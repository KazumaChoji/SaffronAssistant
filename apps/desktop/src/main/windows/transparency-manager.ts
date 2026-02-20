import { BrowserWindow } from 'electron';
import { AppConfig } from '../config/app-config';

const DEFAULT_OPACITY = AppConfig.transparency.default;
const MIN_OPACITY = AppConfig.transparency.min;
const MAX_OPACITY = AppConfig.transparency.max;

const DEFAULT_FG_OPACITY = AppConfig.foreground.default;
const MIN_FG_OPACITY = AppConfig.foreground.min;
const MAX_FG_OPACITY = AppConfig.foreground.max;

export class TransparencyManager {
  private window: BrowserWindow;
  private opacity: number = DEFAULT_OPACITY;
  private previousOpacity: number = DEFAULT_OPACITY;
  private fgOpacity: number = DEFAULT_FG_OPACITY;

  constructor(window: BrowserWindow, initialOpacity?: number) {
    this.window = window;
    if (initialOpacity !== undefined) {
      this.opacity = this.clamp(initialOpacity);
    }
    this.previousOpacity = this.opacity;
  }

  /**
   * Set background opacity and notify renderer
   */
  setOpacity(value: number): void {
    this.opacity = this.clamp(value);
    this.notifyRenderer();
  }

  /**
   * Get current background opacity value
   */
  getOpacity(): number {
    return this.opacity;
  }

  /**
   * Set foreground opacity and notify renderer
   */
  setFgOpacity(value: number): void {
    this.fgOpacity = this.clamp(value, MIN_FG_OPACITY, MAX_FG_OPACITY);
    this.notifyFgRenderer();
  }

  /**
   * Get current foreground opacity value
   */
  getFgOpacity(): number {
    return this.fgOpacity;
  }

  /**
   * Toggle between current opacity and fully opaque
   */
  toggle(): void {
    if (this.opacity < MAX_OPACITY) {
      // Going opaque - save current opacity for restoration
      this.previousOpacity = this.opacity;
      this.opacity = MAX_OPACITY;
    } else {
      // Restoring transparency
      this.opacity = this.previousOpacity < MAX_OPACITY ? this.previousOpacity : DEFAULT_OPACITY;
    }
    this.notifyRenderer();
  }

  private notifyRenderer(): void {
    if (this.window.isDestroyed()) return;
    this.window.webContents.send('system:opacity-changed', this.opacity);
  }

  private notifyFgRenderer(): void {
    if (this.window.isDestroyed()) return;
    this.window.webContents.send('system:fg-opacity-changed', this.fgOpacity);
  }

  private clamp(value: number, min = MIN_OPACITY, max = MAX_OPACITY): number {
    return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
  }
}
