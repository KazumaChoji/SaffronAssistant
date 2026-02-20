/**
 * Screen capture capability
 * Provides methods to capture screenshots
 */

export interface CapturedImage {
  /** Base64-encoded JPEG image data */
  base64: string;

  /** Image width in pixels */
  width: number;

  /** Image height in pixels */
  height: number;
}

export interface ScreenCapability {
  /**
   * Captures the current screen as a JPEG image
   * - Excludes the app's own windows from the capture
   * - Resizes to max 384px height while maintaining aspect ratio
   * - Returns base64-encoded JPEG
   */
  captureScreen(): Promise<CapturedImage>;
}
