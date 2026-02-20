import type { Tool } from '../types';
import type { ScreenCaptureService } from '../../services/screen-capture.service';

export function createScreenshotTool(screenCapture: ScreenCaptureService): Tool<Record<string, never>> {
  return {
    name: 'screenshot',
    description: 'Capture a screenshot of the user\'s active desktop. Returns the current screen contents as an image so you can see what the user sees. Use this proactively when you need to check what\'s on screen or when the user asks you to look at their screen.',
    input_schema: {
      type: 'object',
      properties: {},
    },
    permission: { permission: 'always', risk_level: 'safe' },

    async execute() {
      const captured = await screenCapture.captureScreen(Infinity);
      console.log(`[screenshot tool] Captured ${captured.width}x${captured.height}`);
      return {
        text: `Screenshot captured (${captured.width}x${captured.height})`,
        images: [captured.base64],
      };
    },
  };
}
