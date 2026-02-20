import { ipcMain, BrowserWindow, app, shell, systemPreferences } from 'electron';
import { rm } from 'fs/promises';
import type { ScreenCaptureService } from '../services/screen-capture.service';
import type { ClaudeAPIService } from '../services/claude-api.service';
import type { DatabaseService } from '../services/database.service';
import type { AgentManager } from '../agents';
import type { TransparencyManager } from '../windows/transparency-manager';
import type { QuickTerminalWindow } from '../windows/quick-terminal';
import type { AppSettings, ApiKeyService } from '@app/api';
import { registerAgentHandlers } from '../agents';
import { AppConfig, type Position } from '../config/app-config';

const VALID_POSITIONS: Position[] = ['top', 'bottom', 'left', 'right'];
const MAX_TODO_TEXT_LENGTH = 1000;

const ENV_KEY_MAP: Record<ApiKeyService, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  replicate: 'REPLICATE_API_TOKEN',
};

interface Services {
  screenCapture: ScreenCaptureService;
  claudeAPI: ClaudeAPIService;
  database: DatabaseService;
  agentManager: AgentManager | null;
  transparencyManager: TransparencyManager | null;
  quickTerminal: QuickTerminalWindow | null;
}

/**
 * Registers all IPC handlers
 */
export function registerHandlers(
  services: Services,
  mainWindow: BrowserWindow
): void {
  // Screen capture handlers
  ipcMain.handle('screen:capture', async () => {
    try {
      return await services.screenCapture.captureScreen();
    } catch (error) {
      console.error('Screen capture failed:', error);
      throw error;
    }
  });

  // Settings handlers - API keys read from process.env (.env file)
  ipcMain.handle('settings:hasApiKey', async (_event, service: ApiKeyService) => {
    const envVar = ENV_KEY_MAP[service];
    if (!envVar) return false;
    return !!process.env[envVar];
  });

  ipcMain.handle('settings:getApiKeyStatuses', async () => {
    return {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      replicate: !!process.env.REPLICATE_API_TOKEN,
    };
  });

  ipcMain.handle('settings:getSettings', async () => {
    const settings: AppSettings = {
      model: AppConfig.ai.models.fast,
      theme: 'system',
      shortcuts: {
        toggleWindow: AppConfig.shortcuts.toggle,
        submitQuery: 'Cmd+Enter',
      },
      maxScreenshotHeight: AppConfig.screenshot.maxHeight,
      opacity: services.transparencyManager?.getOpacity() ?? AppConfig.transparency.default,
      position: services.quickTerminal?.getPosition() ?? AppConfig.window.position,
    };
    return settings;
  });

  ipcMain.handle(
    'settings:updateSettings',
    async (_event, _settings: Partial<AppSettings>) => {
      // no-op for now
    }
  );

  // System handlers
  ipcMain.handle('system:getAppVersion', async () => {
    return app.getVersion();
  });

  ipcMain.handle('system:showWindow', async () => {
    await services.quickTerminal?.show();
  });

  ipcMain.handle('system:hideWindow', async () => {
    await services.quickTerminal?.hide();
  });

  ipcMain.handle('system:toggleWindow', async () => {
    await services.quickTerminal?.toggle();
  });

  ipcMain.handle('system:quit', async () => {
    app.quit();
  });

  ipcMain.handle('system:uninstall', async () => {
    // Delete all app data (database, secrets, preferences)
    const userDataPath = app.getPath('userData');
    try {
      await rm(userDataPath, { recursive: true, force: true });
    } catch {
      // best effort
    }
    // Move app bundle to trash
    const appPath = app.getPath('exe').replace(/\/Contents\/.*$/, '');
    shell.trashItem(appPath).catch(() => {});
    app.quit();
  });

  ipcMain.handle('system:isWindowVisible', async () => {
    return services.quickTerminal?.isVisible() ?? false;
  });

  // Position handlers
  ipcMain.handle('system:setPosition', async (_event, position: Position) => {
    if (!VALID_POSITIONS.includes(position)) {
      throw new Error(`Invalid position: ${position}`);
    }
    services.quickTerminal?.setPosition(position);
  });

  ipcMain.handle('system:getPosition', async () => {
    return services.quickTerminal?.getPosition() ?? AppConfig.window.position;
  });

  // Transparency handlers
  ipcMain.handle('system:setOpacity', async (_event, opacity: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, opacity));
    services.transparencyManager?.setOpacity(clamped);
  });

  ipcMain.handle('system:getOpacity', async () => {
    return services.transparencyManager?.getOpacity() ?? AppConfig.transparency.default;
  });

  ipcMain.handle('system:toggleTransparency', async () => {
    services.transparencyManager?.toggle();
  });

  // Foreground opacity handlers
  ipcMain.handle('system:setFgOpacity', async (_event, opacity: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, opacity));
    services.transparencyManager?.setFgOpacity(clamped);
  });

  ipcMain.handle('system:getFgOpacity', async () => {
    return services.transparencyManager?.getFgOpacity() ?? AppConfig.foreground.default;
  });

  // Permission handlers
  ipcMain.handle('system:getScreenRecordingStatus', async () => {
    if (process.platform !== 'darwin') return 'granted';
    return systemPreferences.getMediaAccessStatus('screen');
  });

  ipcMain.handle('system:openScreenRecordingPrefs', async () => {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  });

  // Timer flash: fullscreen red overlay + system beep
  ipcMain.handle('system:timerFlash', async () => {
    // BrowserWindow and screen are type-only in this file's top-level import,
    // so access via require to ensure they're available as values.
    const { BrowserWindow: BW, screen: scr } = require('electron');

    // Unhide the app so the overlay can appear even when the window was hidden
    const wasHidden = !mainWindow.isVisible();
    if (wasHidden && process.platform === 'darwin') {
      app.show();
    }

    shell.beep();

    const display = scr.getDisplayNearestPoint(scr.getCursorScreenPoint());
    const { x, y, width, height } = display.bounds;

    const overlay = new BW({
      x, y, width, height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    overlay.setIgnoreMouseEvents(true);
    if (process.platform === 'darwin') {
      overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      overlay.setAlwaysOnTop(true, 'screen-saver', 2);
    }

    const html = '<!DOCTYPE html><html><head><style>'
      + '*{margin:0;padding:0}'
      + 'html,body{width:100%;height:100%;background:transparent}'
      + 'body{background:rgba(255,40,40,0.18);animation:flash 0.5s ease-in-out 4}'
      + '@keyframes flash{0%,100%{opacity:1}50%{opacity:0}}'
      + '</style></head><body></body></html>';

    overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    overlay.webContents.once('did-finish-load', () => {
      if (!overlay.isDestroyed()) overlay.showInactive();
    });

    setTimeout(() => {
      if (!overlay.isDestroyed()) overlay.close();
      // Re-hide the app if it was hidden before the flash
      if (wasHidden && process.platform === 'darwin') {
        app.hide();
      }
    }, 2500);
  });

  // Notes handlers
  ipcMain.handle('notes:getContent', async (_event, noteId?: string) => {
    try {
      return services.database.getNotesContent(noteId);
    } catch (error) {
      console.error('Failed to get notes:', error);
      return '';
    }
  });

  ipcMain.handle('notes:saveContent', async (_event, content: string, noteId?: string) => {
    try {
      services.database.saveNotesContent(content, noteId);
    } catch (error) {
      console.error('Failed to save notes:', error);
      throw error;
    }
  });

  ipcMain.handle('notes:pushVersion', async (_event, content: string, noteId?: string) => {
    try {
      services.database.pushNoteVersion(content, noteId);
    } catch (error) {
      console.error('Failed to push note version:', error);
      throw error;
    }
  });

  ipcMain.handle('notes:getVersions', async (_event, noteId?: string) => {
    try {
      return services.database.getNoteVersions(noteId);
    } catch (error) {
      console.error('Failed to get note versions:', error);
      return [];
    }
  });

  ipcMain.handle('notes:addImage', async (_event, dataUrl: string) => {
    try {
      return services.database.addNoteImage(dataUrl);
    } catch (error) {
      console.error('Failed to add note image:', error);
      throw error;
    }
  });

  ipcMain.handle('notes:getImages', async () => {
    try {
      return services.database.getNoteImages();
    } catch (error) {
      console.error('Failed to get note images:', error);
      return [];
    }
  });

  // Todos handlers
  ipcMain.handle('todos:getAll', async () => {
    try {
      return services.database.getTodos();
    } catch (error) {
      console.error('Failed to get todos:', error);
      return [];
    }
  });

  ipcMain.handle('todos:add', async (_event, text: string) => {
    if (!text || typeof text !== 'string' || text.length > MAX_TODO_TEXT_LENGTH) {
      throw new Error(`Todo text must be a non-empty string of at most ${MAX_TODO_TEXT_LENGTH} characters`);
    }
    try {
      return services.database.addTodo(text);
    } catch (error) {
      console.error('Failed to add todo:', error);
      throw error;
    }
  });

  ipcMain.handle('todos:update', async (_event, id: number, done: boolean) => {
    try {
      services.database.updateTodo(id, done);
    } catch (error) {
      console.error('Failed to update todo:', error);
      throw error;
    }
  });

  ipcMain.handle('todos:delete', async (_event, id: number) => {
    try {
      services.database.deleteTodo(id);
    } catch (error) {
      console.error('Failed to delete todo:', error);
      throw error;
    }
  });

  // Tracker handlers
  ipcMain.handle('tracker:getDays', async () => {
    try {
      return services.database.getTrackerDays();
    } catch (error) {
      console.error('Failed to get tracker days:', error);
      return [];
    }
  });

  ipcMain.handle('tracker:toggleDay', async (_event, date: string) => {
    try {
      return services.database.toggleTrackerDay(date);
    } catch (error) {
      console.error('Failed to toggle tracker day:', error);
      throw error;
    }
  });

  ipcMain.handle('tracker:getTitle', async () => {
    try {
      return services.database.getTrackerTitle();
    } catch (error) {
      console.error('Failed to get tracker title:', error);
      return '';
    }
  });

  ipcMain.handle('tracker:setTitle', async (_event, title: string) => {
    try {
      services.database.setTrackerTitle(title);
    } catch (error) {
      console.error('Failed to set tracker title:', error);
      throw error;
    }
  });

  // Database reset
  ipcMain.handle('system:resetDatabase', async () => {
    try {
      // Terminate all agents first
      if (services.agentManager) {
        await services.agentManager.terminateAll();
      }
      services.database.reset();
      return { success: true };
    } catch (error: any) {
      console.error('Failed to reset database:', error);
      return { success: false, error: error.message };
    }
  });

  // Register agent handlers
  if (services.agentManager) {
    registerAgentHandlers(services.agentManager, mainWindow);
  }
}
