import { exec } from 'child_process';
import { promisify } from 'util';
import { nativeImage } from 'electron';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CapturedImage } from '@app/api';

const execAsync = promisify(exec);

/**
 * Screen capture service for macOS
 * Uses native screencapture binary and Electron's nativeImage for processing
 */
export class ScreenCaptureService {
  private readonly maxHeight: number;
  private readonly jpegQuality: number;

  constructor(maxHeight: number = 384, jpegQuality: number = 85) {
    this.maxHeight = maxHeight;
    this.jpegQuality = jpegQuality;
  }

  /**
   * Captures the current screen as a JPEG image
   * - Resizes to maxHeight while maintaining aspect ratio
   * - Returns base64-encoded JPEG
   */
  async captureScreen(maxHeightOverride?: number): Promise<CapturedImage> {
    const tempPath = join(tmpdir(), `saffron-screenshot-${Date.now()}.png`);
    const effectiveMaxHeight = maxHeightOverride ?? this.maxHeight;

    try {
      // Use macOS screencapture to capture screen
      // -x: no sound, -C: capture cursor, -t png: format
      await execAsync(`screencapture -x -C -t png "${tempPath}"`);

      let image = nativeImage.createFromPath(tempPath);

      if (image.isEmpty()) {
        throw new Error('Failed to read screenshot');
      }

      const { width: origW, height: origH } = image.getSize();

      // Resize if taller than max
      if (origH > effectiveMaxHeight) {
        const scale = effectiveMaxHeight / origH;
        const newW = Math.floor(origW * scale);
        image = image.resize({ width: newW, height: effectiveMaxHeight });
      }

      const { width, height } = image.getSize();

      // Convert to JPEG base64
      const buffer = image.toJPEG(this.jpegQuality);
      const base64 = buffer.toString('base64');

      return {
        base64: `data:image/jpeg;base64,${base64}`,
        width,
        height,
      };
    } finally {
      try {
        await unlink(tempPath);
      } catch {
        // temp file already gone
      }
    }
  }
}
