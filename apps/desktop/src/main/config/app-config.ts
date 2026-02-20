export type Position = 'top' | 'bottom' | 'left' | 'right';

export const AppConfig = Object.freeze({
  window: {
    sizePercent: 40,
    animationDurationMs: 100,
    animationBufferMs: 20,
    position: 'bottom' as Position,
    opacity: 0.92,
    autoHideOnBlur: true,
    blurHideDelayMs: 150,
    toggleDebounceMs: 300,
    screenshotDebounceMs: 200,
  },
  shortcuts: {
    toggle: 'Cmd+`',
    captureScreenshot: 'Cmd+]',
    toggleTransparency: 'Cmd+Shift+T',
  },
  transparency: {
    default: 0.95,
    min: 0.1,
    max: 1.0,
  },
  foreground: {
    default: 0.85,
    min: 0.1,
    max: 1.0,
  },
  ai: {
    models: {
      fast: 'claude-haiku-4-5-20251001',
      default: 'claude-sonnet-4-5-20250929',
    },
    maxTokens: 4096,
    titleMaxTokens: 20,
    temperature: 0.7,
    maxIterations: 15,
    // Sonnet 4.5 pricing — last verified Feb 2026
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
    },
  },
  screenshot: {
    maxHeight: 384,
    jpegQuality: 85,
    maxPending: 3,
  },
  agents: {
    maxConcurrent: 10,
  },
  tools: {
    commandTimeoutMs: 60_000,
    maxBufferBytes: 10 * 1024 * 1024,
    userResponseTimeoutMs: 5 * 60 * 1000,
    searchMaxResults: 100,
    webFetchCharLimit: 10_000,
    maxCodeLength: 50_000,
    safeSearch: 0 as 0 | 1 | 2,
  },
});
