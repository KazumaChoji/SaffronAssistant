import { BrowserWindow, screen, app } from 'electron';
import { join } from 'path';
import { AppConfig, type Position } from '../config/app-config';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class QuickTerminalWindow {
  private window: BrowserWindow;
  private visible = false;
  private isAnimating = false;
  private position: Position;

  constructor() {
    this.position = AppConfig.window.position;
    this.window = this.createWindow();
  }

  getWindow(): BrowserWindow {
    return this.window;
  }

  getPosition(): Position {
    return this.position;
  }

  setPosition(pos: Position): void {
    this.position = pos;
    if (this.visible) {
      // Reposition immediately without animation
      const target = this.getTargetBounds();
      this.window.setBounds(target);
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  async toggle(): Promise<void> {
    if (this.isAnimating) return;
    if (this.visible) {
      await this.hide();
    } else {
      await this.show();
    }
  }

  async show(): Promise<void> {
    if (this.visible || this.isAnimating) return;

    if (this.window.isDestroyed()) {
      this.window = this.createWindow();
    }

    const target = this.getTargetBounds();

    // Position window at final location instantly
    this.window.setBounds(target);
    this.isAnimating = true;

    // Re-apply workspace visibility — hide()/app.hide() can silently reset it on macOS
    if (process.platform === 'darwin') {
      this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      this.window.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    // Tell renderer to prepare offscreen transform, then show
    this.window.webContents.send('window:animate-in', this.position, AppConfig.window.animationDurationMs);
    this.window.showInactive();

    // Re-apply again after show — some Electron versions reset it during showInactive()
    if (process.platform === 'darwin') {
      this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      this.window.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    this.window.focus();

    // Wait for CSS transition to complete
    await this.sleep(AppConfig.window.animationDurationMs + AppConfig.window.animationBufferMs);

    this.visible = true;
    this.isAnimating = false;

    this.window.webContents.send('window:shown');
  }

  async hide(): Promise<void> {
    if (!this.visible || this.isAnimating || this.window.isDestroyed()) return;

    this.isAnimating = true;

    // Tell renderer to slide content offscreen
    this.window.webContents.send('window:animate-out', this.position, AppConfig.window.animationDurationMs);

    // Wait for CSS transition to complete, then hide
    await this.sleep(AppConfig.window.animationDurationMs + AppConfig.window.animationBufferMs);

    if (this.window.isDestroyed()) {
      this.visible = false;
      this.isAnimating = false;
      return;
    }

    this.window.hide();
    this.visible = false;
    this.isAnimating = false;

    // Deactivate Electron so macOS focuses the topmost window on the current space
    if (process.platform === 'darwin') {
      app.hide();
    }
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.visible = false;
  }

  private getActiveDisplay(): Electron.Display {
    const cursor = screen.getCursorScreenPoint();
    return screen.getDisplayNearestPoint(cursor);
  }

  private getWindowSize(): { width: number; height: number } {
    const display = this.getActiveDisplay();
    const { width: screenWidth, height: screenHeight } = display.workArea;
    const pct = AppConfig.window.sizePercent / 100;

    if (this.position === 'top' || this.position === 'bottom') {
      return { width: screenWidth, height: Math.floor(screenHeight * pct) };
    }
    // left or right
    return { width: Math.floor(screenWidth * pct), height: screenHeight };
  }

  private getTargetBounds(): Bounds {
    const display = this.getActiveDisplay();
    const { x: areaX, y: areaY, width: areaW, height: areaH } = display.workArea;
    const { width: winW, height: winH } = this.getWindowSize();

    switch (this.position) {
      case 'top':
      case 'left':
        return { x: areaX, y: areaY, width: winW, height: winH };
      case 'right':
        return { x: areaX + areaW - winW, y: areaY, width: winW, height: winH };
      case 'bottom':
      default:
        return { x: areaX, y: areaY + areaH - winH, width: winW, height: winH };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createWindow(): BrowserWindow {
    const target = this.getTargetBounds();

    const win = new BrowserWindow({
      width: target.width,
      height: target.height,
      x: target.x,
      y: target.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: false,
      show: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      roundedCorners: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: true,
      },
    });

    // Window stays fully opaque — transparency is CSS background-only
    win.setOpacity(1.0);

    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true, 'screen-saver', 1);
      win.setContentProtection(true);
    }

    if (AppConfig.window.autoHideOnBlur) {
      win.on('blur', () => {
        setTimeout(() => {
          if (this.visible && !this.isAnimating && !win.isDestroyed() && !win.isFocused()) {
            this.hide();
          }
        }, AppConfig.window.blurHideDelayMs);
      });
    }

    // Cmd+Arrow shortcuts to change position (only active when window is focused)
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !input.meta || input.shift || input.alt || input.control) return;

      const arrowToPosition: Record<string, Position> = {
        ArrowUp: 'top',
        ArrowDown: 'bottom',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };

      const newPos = arrowToPosition[input.key];
      if (newPos && newPos !== this.position) {
        event.preventDefault();
        this.setPosition(newPos);
      }
    });

    win.webContents.on('console-message', (_event, level, message) => {
      const tag = ['LOG', 'WARN', 'ERR'][level] ?? 'LOG';
      console.log(`[renderer:${tag}] ${message}`);
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`Renderer failed to load: ${errorCode} ${errorDescription}`);
    });

    win.webContents.on('did-finish-load', () => {
      console.log('Renderer loaded successfully');
    });

    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('Renderer process crashed:', details);
    });

    if (process.env.NODE_ENV === 'development' && process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      win.loadFile(join(__dirname, '../../dist/index.html'));
    }

    return win;
  }

}
