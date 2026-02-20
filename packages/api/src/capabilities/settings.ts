/**
 * Settings capability
 * Provides methods to manage application settings and API keys
 */

export type ApiKeyService = 'anthropic' | 'replicate';

export interface KeyboardShortcuts {
  /** Shortcut to toggle window visibility (e.g., "Cmd+\\") */
  toggleWindow: string;

  /** Shortcut to submit a query (e.g., "Cmd+Enter") */
  submitQuery: string;
}

export interface AppSettings {
  /** Selected AI model */
  model: string;

  /** UI theme */
  theme: 'light' | 'dark' | 'system';

  /** Keyboard shortcuts configuration */
  shortcuts: KeyboardShortcuts;

  /** Maximum height for captured screenshots (pixels) */
  maxScreenshotHeight: number;

  /** Window background opacity (0.1 - 1.0) */
  opacity: number;

  /** Window slide-in position */
  position: 'top' | 'bottom' | 'left' | 'right';
}

export interface SettingsCapability {
  /**
   * Checks if an API key is configured for a service (does NOT return the key)
   */
  hasApiKey(service: ApiKeyService): Promise<boolean>;

  /**
   * Stores an API key for a service in secure storage (macOS Keychain)
   */
  setApiKey(service: ApiKeyService, key: string): Promise<void>;

  /**
   * Deletes the API key for a service
   */
  deleteApiKey(service: ApiKeyService): Promise<boolean>;

  /**
   * Returns which services have API keys configured
   */
  getApiKeyStatuses(): Promise<Record<ApiKeyService, boolean>>;

  /**
   * Retrieves all application settings
   */
  getSettings(): Promise<AppSettings>;

  /**
   * Updates application settings (partial update supported)
   */
  updateSettings(settings: Partial<AppSettings>): Promise<void>;
}
