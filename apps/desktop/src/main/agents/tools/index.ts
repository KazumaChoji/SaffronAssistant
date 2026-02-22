import { ToolRegistry } from '../tool-registry';
import { calculatorTool } from './calculator';
import { createScreenshotTool } from './screenshot';
import { createImageGenerationTool } from './image-generation';
import { executeCodeTool } from './execute-code';
import { createNoteTools } from './notes-tools';
import { createTodoTools } from './todo-tools';
import { createClockTools } from './timer-tools';
import type { ScreenCaptureService } from '../../services/screen-capture.service';
import type { DatabaseService } from '../../services/database.service';
import type { ClockCommand, ClockStatus } from '@app/api';

interface ToolRegistryOptions {
  screenCapture?: ScreenCaptureService;
  database?: DatabaseService;
  notifyNoteChanged?: (noteId: string) => void;
  notifyTodosChanged?: () => void;
  sendClockCommand?: (cmd: ClockCommand) => void;
  getClockStatus?: () => Promise<ClockStatus>;
}

export function createToolRegistry(
  screenCaptureOrOptions?: ScreenCaptureService | ToolRegistryOptions
): ToolRegistry {
  const opts: ToolRegistryOptions =
    screenCaptureOrOptions && 'captureScreen' in screenCaptureOrOptions
      ? { screenCapture: screenCaptureOrOptions as ScreenCaptureService }
      : (screenCaptureOrOptions as ToolRegistryOptions) ?? {};

  const registry = new ToolRegistry();
  registry.register(calculatorTool);
  registry.register(executeCodeTool);
  registry.register(createImageGenerationTool(() => Promise.resolve(process.env.REPLICATE_API_TOKEN ?? null)));

  if (opts.screenCapture) {
    registry.register(createScreenshotTool(opts.screenCapture));
    console.log('[tools] Screenshot tool registered');
  } else {
    console.warn('[tools] No ScreenCaptureService provided — screenshot tool NOT registered');
  }

  if (opts.database && opts.notifyNoteChanged) {
    for (const tool of createNoteTools(opts.database, opts.notifyNoteChanged)) {
      registry.register(tool);
    }
    console.log('[tools] Note tools registered');
  }

  if (opts.database && opts.notifyTodosChanged) {
    for (const tool of createTodoTools(opts.database, opts.notifyTodosChanged)) {
      registry.register(tool);
    }
    console.log('[tools] Todo tools registered');
  }

  if (opts.sendClockCommand && opts.getClockStatus) {
    for (const tool of createClockTools(opts.sendClockCommand, opts.getClockStatus)) {
      registry.register(tool);
    }
    console.log('[tools] Clock tools registered');
  }

  return registry;
}
