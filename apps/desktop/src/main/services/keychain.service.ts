import { safeStorage } from 'electron';
import type { DatabaseService } from './database.service';

export type ApiKeyService = 'anthropic' | 'replicate';

const SERVICE_LABELS: Record<ApiKeyService, string> = {
  anthropic: 'Anthropic (Claude)',
  replicate: 'Replicate',
};

/**
 * Keychain service for secure API key storage
 * Uses Electron's safeStorage (OS-level encryption) + SQLite
 */
export class KeychainService {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  static readonly SERVICES: ApiKeyService[] = ['anthropic', 'replicate'];
  static readonly SERVICE_LABELS = SERVICE_LABELS;

  async getKey(service: ApiKeyService): Promise<string | null> {
    try {
      const encrypted = this.db.getSecret(service);
      if (!encrypted) return null;

      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('safeStorage encryption not available');
        return null;
      }

      const buffer = Buffer.from(encrypted, 'hex');
      return safeStorage.decryptString(buffer);
    } catch (error) {
      console.error(`Failed to retrieve ${service} API key:`, error);
      return null;
    }
  }

  async setKey(service: ApiKeyService, key: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this system');
    }

    try {
      const encrypted = safeStorage.encryptString(key);
      this.db.setSecret(service, encrypted.toString('hex'));
    } catch (error) {
      console.error(`Failed to store ${service} API key:`, error);
      throw new Error(`Failed to store ${service} API key securely`);
    }
  }

  async deleteKey(service: ApiKeyService): Promise<boolean> {
    try {
      this.db.deleteSecret(service);
      return true;
    } catch (error) {
      console.error(`Failed to delete ${service} API key:`, error);
      return false;
    }
  }

  async hasKey(service: ApiKeyService): Promise<boolean> {
    const key = await this.getKey(service);
    return key !== null;
  }

  async getKeyStatuses(): Promise<Record<ApiKeyService, boolean>> {
    const results = await Promise.all(
      KeychainService.SERVICES.map(async (s) => [s, await this.hasKey(s)] as const)
    );
    return Object.fromEntries(results) as Record<ApiKeyService, boolean>;
  }

  // Convenience aliases for anthropic key
  async getApiKey(): Promise<string | null> {
    return this.getKey('anthropic');
  }

  async setApiKey(key: string): Promise<void> {
    return this.setKey('anthropic', key);
  }

  async deleteApiKey(): Promise<boolean> {
    return this.deleteKey('anthropic');
  }
}
