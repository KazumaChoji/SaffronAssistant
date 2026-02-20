import { create } from 'zustand';
import type { AppSettings, ApiKeyService } from '@app/api';

interface SettingsStore {
  apiKeyStatuses: Record<ApiKeyService, boolean>;
  settings: AppSettings | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
}

const DEFAULT_STATUSES: Record<ApiKeyService, boolean> = {
  anthropic: false,
  replicate: false,
};

export const useSettings = create<SettingsStore>((set) => ({
  apiKeyStatuses: { ...DEFAULT_STATUSES },
  settings: null,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });

    try {
      const [statuses, settings] = await Promise.all([
        window.api.settings.getApiKeyStatuses(),
        window.api.settings.getSettings(),
      ]);

      set({ apiKeyStatuses: statuses, settings, isLoading: false });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load settings',
      });
    }
  },

  updateSettings: async (newSettings: Partial<AppSettings>) => {
    set({ isLoading: true, error: null });

    try {
      await window.api.settings.updateSettings(newSettings);
      set((state) => ({
        settings: state.settings ? { ...state.settings, ...newSettings } : null,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to update settings:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to update settings',
      });
    }
  },
}));
