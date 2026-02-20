import { app, globalShortcut } from 'electron';
import { TransparencyManager } from './windows/transparency-manager';
import { QuickTerminalWindow } from './windows/quick-terminal';
import { ScreenCaptureService } from './services/screen-capture.service';
import { ClaudeAPIService } from './services/claude-api.service';
import { DatabaseService } from './services/database.service';
import { KeychainService } from './services/keychain.service';
import { AgentManager } from './agents';
import { registerHandlers } from './handlers/index';
import { AppConfig } from './config/app-config';

// Initialize services
const services = {
  screenCapture: new ScreenCaptureService(AppConfig.screenshot.maxHeight, AppConfig.screenshot.jpegQuality),
  claudeAPI: new ClaudeAPIService(),
  database: new DatabaseService(),
  keychain: null as KeychainService | null,
  agentManager: null as AgentManager | null,
  transparencyManager: null as TransparencyManager | null,
  quickTerminal: null as QuickTerminalWindow | null,
};

/**
 * Registers global keyboard shortcuts
 */
function registerShortcuts(): void {
  // Toggle window
  const toggleShortcut = process.platform === 'darwin'
    ? AppConfig.shortcuts.toggle
    : AppConfig.shortcuts.toggle.replace('Cmd', 'Ctrl');

  let lastExecutionTime = 0;
  const debounceDelay = AppConfig.window.toggleDebounceMs;

  const registered = globalShortcut.register(toggleShortcut, async () => {
    const now = Date.now();
    if (now - lastExecutionTime < debounceDelay) return;
    lastExecutionTime = now;

    if (services.quickTerminal) {
      await services.quickTerminal.toggle();
    }
  });

  if (registered) {
    console.log(`Global shortcut ${toggleShortcut} registered`);
  } else {
    console.error(`Failed to register global shortcut ${toggleShortcut}`);
  }

  // Capture screenshot
  const screenshotShortcut = process.platform === 'darwin'
    ? AppConfig.shortcuts.captureScreenshot
    : AppConfig.shortcuts.captureScreenshot.replace('Cmd', 'Ctrl');

  let lastScreenshotTime = 0;
  const screenshotDebounceDelay = AppConfig.window.screenshotDebounceMs;

  const screenshotRegistered = globalShortcut.register(screenshotShortcut, () => {
    const now = Date.now();
    if (now - lastScreenshotTime < screenshotDebounceDelay) return;
    lastScreenshotTime = now;

    if (services.quickTerminal && services.quickTerminal.isVisible()) {
      const win = services.quickTerminal.getWindow();
      if (!win.isDestroyed()) {
        win.webContents.send('screenshot:capture');
      }
    }
  });

  if (screenshotRegistered) {
    console.log(`Global shortcut ${screenshotShortcut} registered`);
  } else {
    console.error(`Failed to register global shortcut ${screenshotShortcut}`);
  }

  // Toggle transparency
  const transparencyShortcut = process.platform === 'darwin'
    ? AppConfig.shortcuts.toggleTransparency
    : AppConfig.shortcuts.toggleTransparency.replace('Cmd', 'Ctrl');

  const transparencyRegistered = globalShortcut.register(transparencyShortcut, () => {
    if (services.transparencyManager) {
      services.transparencyManager.toggle();
    }
  });

  if (transparencyRegistered) {
    console.log(`Global shortcut ${transparencyShortcut} registered`);
  } else {
    console.error(`Failed to register global shortcut ${transparencyShortcut}`);
  }
}

/**
 * App lifecycle: ready
 */
app.whenReady().then(() => {
  // Initialize keychain (requires app ready for safeStorage)
  services.keychain = new KeychainService(services.database);

  // Create the sole window
  services.quickTerminal = new QuickTerminalWindow();
  const win = services.quickTerminal.getWindow();

  // Initialize TransparencyManager
  services.transparencyManager = new TransparencyManager(win, AppConfig.window.opacity);

  // Initialize AgentManager
  services.agentManager = new AgentManager(
    win,
    services.database,
    services.claudeAPI,
    services.screenCapture,
    services.keychain!
  );

  // Initialize with API key if available
  services.keychain!.getApiKey().then((apiKey) => {
    if (apiKey && services.agentManager) {
      services.agentManager.initialize(apiKey);
      console.log('AgentManager initialized with stored API key');
    }
  }).catch((error) => {
    console.error('Failed to initialize AgentManager:', error);
  });

  registerHandlers({
    screenCapture: services.screenCapture,
    claudeAPI: services.claudeAPI,
    database: services.database,
    keychain: services.keychain!,
    agentManager: services.agentManager,
    transparencyManager: services.transparencyManager,
    quickTerminal: services.quickTerminal,
  }, win);
  registerShortcuts();
});

/**
 * App lifecycle: activate (macOS dock icon clicked)
 * Show the window if it was hidden via toggle.
 */
app.on('activate', () => {
  if (services.quickTerminal && !services.quickTerminal.isVisible()) {
    services.quickTerminal.show();
  }
});

/**
 * App lifecycle: window-all-closed
 * Quit the app when the window is actually closed (e.g. Cmd+W).
 * Note: hiding the window via toggle does NOT trigger this event.
 */
app.on('window-all-closed', () => {
  app.quit();
});

/**
 * App lifecycle: will-quit
 */
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  services.quickTerminal?.destroy();
  services.database.close();
});

/**
 * Security: prevent navigation to external URLs
 * Skip webview contents (used by the Search tab) so they can navigate freely.
 */
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    // Webview guests may navigate freely but must not open new windows
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    return;
  }

  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    if (process.env.NODE_ENV === 'development') {
      if (parsedUrl.hostname !== 'localhost') {
        event.preventDefault();
      }
    } else {
      event.preventDefault();
    }
  });

  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
