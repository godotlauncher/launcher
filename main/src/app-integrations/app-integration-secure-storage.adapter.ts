import { Injectable } from '@mariodebono/di';
import { safeStorage } from 'electron';
import { isSecureStorageAvailable } from './app-integration-secure-storage.utils.js';

@Injectable()
export class AppIntegrationSecureStorageAdapter {
    /** Returns whether the current OS-backed encryption backend is safe to use. */
    async isAvailable(): Promise<boolean> {
        return isSecureStorageAvailable(safeStorage);
    }

    /** Encrypts a provider credential into base64 text. */
    async encrypt(credential: string): Promise<string> {
        if (!(await this.isAvailable())) {
            throw new Error('Secure storage is unavailable');
        }
        return safeStorage.encryptString(credential).toString('base64');
    }

    /** Decrypts a provider credential from base64 text. */
    async decrypt(ciphertext: string): Promise<string> {
        if (!(await this.isAvailable())) {
            throw new Error('Secure storage is unavailable');
        }
        return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'));
    }
}
