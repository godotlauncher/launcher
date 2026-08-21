import path from 'node:path';
import { JsonFileStore } from '../json-store/json-file.store.js';
import type { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import {
    createEmptyAppIntegrationStore,
    normalizeAppIntegrationStore,
} from './app-integration.schema.js';
import type {
    AppIntegrationConnectionRecord,
    AppIntegrationModuleOptions,
    AppIntegrationStoreFile,
} from './app-integration.types.js';

export class AppIntegrationsStore extends JsonFileStore<AppIntegrationStoreFile> {
    /**
     * Creates the non-secret connection store.
     *
     * @param coordinator - Shared atomic JSON coordinator.
     * @param options - App integration storage options.
     */
    constructor(
        coordinator: JsonStoreCoordinatorService,
        options: AppIntegrationModuleOptions,
    ) {
        super(coordinator, {
            pathProvider: () =>
                path.resolve(options.directory, options.metadataFileName),
            defaultValue: createEmptyAppIntegrationStore,
            parse: (raw) => JSON.parse(raw) as AppIntegrationStoreFile,
            normalize: normalizeAppIntegrationStore,
        });
    }

    /**
     * Returns every connection for one provider.
     *
     * @param providerId - Registered provider ID.
     * @returns Persisted connections for the provider.
     */
    async listByProvider(
        providerId: string,
    ): Promise<AppIntegrationConnectionRecord[]> {
        const { value } = await this.readValue();
        return Object.values(value.connections).filter(
            (connection) => connection.providerId === providerId,
        );
    }

    /**
     * Returns one connection by its stable local ID.
     *
     * @param connectionId - Stable local connection ID.
     * @returns The matching record, or null.
     */
    async get(
        connectionId: string,
    ): Promise<AppIntegrationConnectionRecord | null> {
        const { value } = await this.readValue();
        return value.connections[connectionId] ?? null;
    }

    /**
     * Returns one provider connection by its immutable account ID.
     *
     * @param providerId - Registered provider ID.
     * @param accountId - Immutable provider account ID.
     * @returns The matching record, or null.
     */
    async findByAccount(
        providerId: string,
        accountId: string,
    ): Promise<AppIntegrationConnectionRecord | null> {
        const connections = await this.listByProvider(providerId);
        return (
            connections.find(
                (connection) => connection.accountId === accountId,
            ) ?? null
        );
    }

    /**
     * Stores one connection by its stable local ID.
     *
     * @param record - Validated connection metadata.
     */
    async set(record: AppIntegrationConnectionRecord): Promise<void> {
        await this.updateValue((current) => ({
            ...current,
            connections: {
                ...current.connections,
                [record.id]: record,
            },
        }));
    }

    /**
     * Removes one connection and returns the removed record.
     *
     * @param connectionId - Stable local connection ID.
     * @returns The removed record, or null.
     */
    async remove(
        connectionId: string,
    ): Promise<AppIntegrationConnectionRecord | null> {
        let removed: AppIntegrationConnectionRecord | null = null;
        await this.updateValue((current) => {
            removed = current.connections[connectionId] ?? null;
            const connections = { ...current.connections };
            delete connections[connectionId];
            return { ...current, connections };
        });
        return removed;
    }
}
