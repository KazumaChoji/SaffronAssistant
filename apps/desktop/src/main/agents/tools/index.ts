import { ToolRegistry } from '../tool-registry';
import { webSearchTool } from './web-search';
import { webFetchTool } from './web-fetch';
import { calculatorTool } from './calculator';
import { createScreenshotTool } from './screenshot';
import { createImageGenerationTool } from './image-generation';
import { executeCodeTool } from './execute-code';
import type { ScreenCaptureService } from '../../services/screen-capture.service';
import type { KeychainService } from '../../services/keychain.service';

export function createToolRegistry(screenCapture?: ScreenCaptureService, keychain?: KeychainService): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(webSearchTool);
  registry.register(webFetchTool);
  registry.register(calculatorTool);
  registry.register(executeCodeTool);
  registry.register(createImageGenerationTool(() => keychain?.getKey('replicate') ?? Promise.resolve(null)));
  if (screenCapture) {
    registry.register(createScreenshotTool(screenCapture));
    console.log('[tools] Screenshot tool registered');
  } else {
    console.warn('[tools] No ScreenCaptureService provided — screenshot tool NOT registered');
  }
  return registry;
}
