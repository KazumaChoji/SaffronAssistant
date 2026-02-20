/**
 * System capability
 * Provides methods to control the application
 */

export interface SystemCapability {
  /**
   * Gets the application version
   */
  getAppVersion(): Promise<string>;

  /**
   * Shows the main window
   */
  showWindow(): Promise<void>;

  /**
   * Hides the main window
   */
  hideWindow(): Promise<void>;

  /**
   * Toggles window visibility (show if hidden, hide if shown)
   */
  toggleWindow(): Promise<void>;

  /**
   * Quits the application
   */
  quit(): Promise<void>;

  /**
   * Uninstalls the application — deletes all data and moves app to trash
   */
  uninstall(): Promise<void>;

  /**
   * Checks if the application window is currently visible
   */
  isWindowVisible(): Promise<boolean>;

  /**
   * Registers a callback to be called when the window is shown
   * @returns A cleanup function to remove the listener
   */
  onWindowShown(callback: () => void): () => void;

  /**
   * Registers a callback to be called when the screenshot shortcut is triggered
   * @returns A cleanup function to remove the listener
   */
  onScreenshotCapture(callback: () => void): () => void;

  /**
   * Sets the window background opacity (0.1 - 1.0)
   */
  setOpacity(opacity: number): Promise<void>;

  /**
   * Gets the current window background opacity
   */
  getOpacity(): Promise<number>;

  /**
   * Toggles between transparent and opaque window
   */
  toggleTransparency(): Promise<void>;

  /**
   * Registers a callback for opacity change events
   * @returns A cleanup function to remove the listener
   */
  onOpacityChanged(callback: (opacity: number) => void): () => void;

  /**
   * Sets the foreground component opacity (0.1 - 1.0)
   */
  setFgOpacity(opacity: number): Promise<void>;

  /**
   * Gets the current foreground component opacity
   */
  getFgOpacity(): Promise<number>;

  /**
   * Registers a callback for foreground opacity change events
   * @returns A cleanup function to remove the listener
   */
  onFgOpacityChanged(callback: (opacity: number) => void): () => void;

  /**
   * Sets the window slide-in position
   */
  setPosition(position: 'top' | 'bottom' | 'left' | 'right'): Promise<void>;

  /**
   * Gets the current window slide-in position
   */
  getPosition(): Promise<'top' | 'bottom' | 'left' | 'right'>;

  /**
   * Registers a callback for the slide-in animation event
   */
  onAnimateIn(callback: (position: 'top' | 'bottom' | 'left' | 'right', durationMs: number) => void): () => void;

  /**
   * Registers a callback for the slide-out animation event
   */
  onAnimateOut(callback: (position: 'top' | 'bottom' | 'left' | 'right', durationMs: number) => void): () => void;

  /**
   * Gets macOS screen recording permission status
   */
  getScreenRecordingStatus(): Promise<'granted' | 'denied' | 'not-determined'>;

  /**
   * Opens System Settings to the Screen Recording permission pane
   */
  openScreenRecordingPrefs(): Promise<void>;

  /**
   * Flashes a fullscreen red overlay and plays a system beep (timer alert)
   */
  timerFlash(): Promise<void>;

  /**
   * Resets the SQLite database — drops all tables and re-creates the schema
   */
  resetDatabase(): Promise<{ success: boolean; error?: string }>;
}
