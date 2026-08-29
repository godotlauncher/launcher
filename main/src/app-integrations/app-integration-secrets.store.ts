import { promises as fs } from 'node:fs';
import path from 'node:path';
import { JsonFileStore } from '../json-store/json-file.store.js';
import type { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import {
    createEmptyAppIntegrationSecretsStore,
    normalizeAppIntegrationSecretsStore,
} from './app-integration.schema.js';
import type {
    AppIntegrationModuleOptions,
    AppIntegrationSecretsStoreFile,
} from './app-integration.types.js';

export class AppIntegrationSecretsStore extends JsonFileStore<AppIntegrationSecretsStoreFile> {
    private readonly filePath: string;

    /**
     * Creates the encrypted credential store.
     *
     * @param coordinator - Shared atomic JSON coordinator.
     * @param options - App integration storage options.
     */
    constructor(
        coordinator: JsonStoreCoordinatorService,
        options: AppIntegrationModuleOptions,
    ) {
        const filePath = path.resolve(
            options.directory,
            options.secretsFileName,
        );
        super(coordinator, {
            pathProvider: () => filePath,
            defaultValue: createEmptyAppIntegrationSecretsStore,
            parse: (raw) => JSON.parse(raw) as AppIntegrationSecretsStoreFile,
            normalize: normalizeAppIntegrationSecretsStore,
        });
        this.filePath = filePath;
    }

    /** Returns one encrypted credential. */
    async get(connectionId: string): Promise<string | null> {
        const { value } = await this.readValue();
        return value.credentials[connectionId] ?? null;
    }

    /** Stores one encrypted credential. */
    async set(connectionId: string, ciphertext: string): Promise<void> {
        await this.updateValue((current) => ({
            ...current,
            credentials: {
                ...current.credentials,
                [connectionId]: ciphertext,
            },
        }));
        await this.restrictFilePermissions();
    }

    /** Removes one encrypted credential. */
    async remove(connectionId: string): Promise<void> {
        await this.updateValue((current) => {
            const credentials = { ...current.credentials };
            delete credentials[connectionId];
            return { ...current, credentials };
        });
        await this.restrictFilePermissions();
    }

    /** Restricts the encrypted credential file to the current user on POSIX. */
    private async restrictFilePermissions(): Promise<void> {
        if (process.platform !== 'win32') {
            await fs.chmod(this.filePath, 0o600);
        }
    }
}
