import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
    APP_INTEGRATION_SCHEMA_VERSION,
    APP_INTEGRATION_SECRETS_SCHEMA_VERSION,
} from './app-integration.constants.js';
import type {
    AppIntegrationConnectionRecord,
    AppIntegrationSecretsStoreFile,
    AppIntegrationStoreFile,
} from './app-integration.types.js';

const LegacyAccessTargetSchema = z.object({
    id: z.string().trim().min(1),
    login: z.string().trim().min(1),
    type: z.enum(['organization', 'user']),
    manageUrl: z.url(),
});

const AccessTargetSchema = z.object({
    id: z.uuid(),
    providerTargetId: z.string().trim().min(1),
    login: z.string().trim().min(1),
    type: z.enum(['organization', 'user']),
    manageUrl: z.url(),
    availability: z.enum(['available', 'unavailable']).default('available'),
});

const ConnectionFields = {
    id: z.uuid(),
    providerId: z.string().trim().min(1),
    accountId: z.string().trim().min(1),
    accountLogin: z.string().trim().min(1),
    accountDisplayName: z.string().trim().min(1).nullable(),
    connectedAt: z.iso.datetime(),
    accessTokenExpiresAt: z.iso.datetime().nullable(),
    refreshTokenExpiresAt: z.iso.datetime().nullable(),
};

const LegacyConnectionRecordSchema = z.object({
    ...ConnectionFields,
    accessTarget: LegacyAccessTargetSchema.nullable().default(null),
});

const ConnectionRecordSchema = z.object({
    ...ConnectionFields,
    requiresReauthorisation: z.boolean().default(false),
    accessTargets: z.array(AccessTargetSchema).default([]),
});

const LegacyAppIntegrationStoreFileSchema = z.object({
    schemaVersion: z.literal(1),
    connections: z.record(
        z.string().trim().min(1),
        LegacyConnectionRecordSchema,
    ),
});

const AppIntegrationStoreFileSchema = z.object({
    schemaVersion: z.literal(APP_INTEGRATION_SCHEMA_VERSION),
    connections: z.record(z.uuid(), ConnectionRecordSchema),
});

const AppIntegrationSecretsStoreFileSchema = z.object({
    schemaVersion: z.literal(APP_INTEGRATION_SECRETS_SCHEMA_VERSION),
    credentials: z.record(z.uuid(), z.base64()),
});

/** Creates an empty connection metadata store. */
export function createEmptyAppIntegrationStore(): AppIntegrationStoreFile {
    return { schemaVersion: APP_INTEGRATION_SCHEMA_VERSION, connections: {} };
}

/** Creates an empty encrypted credential store. */
export function createEmptyAppIntegrationSecretsStore(): AppIntegrationSecretsStoreFile {
    return {
        schemaVersion: APP_INTEGRATION_SECRETS_SCHEMA_VERSION,
        credentials: {},
    };
}

/**
 * Validates, upgrades, and orders stored connection metadata.
 *
 * @param value - Untrusted persisted value.
 * @returns Valid current connection metadata.
 */
export function normalizeAppIntegrationStore(
    value: unknown,
): AppIntegrationStoreFile {
    const current = AppIntegrationStoreFileSchema.safeParse(value);
    if (current.success) {
        return {
            schemaVersion: APP_INTEGRATION_SCHEMA_VERSION,
            connections: Object.fromEntries(
                Object.entries(current.data.connections).sort(
                    ([left], [right]) => left.localeCompare(right),
                ),
            ),
        };
    }

    const legacy = LegacyAppIntegrationStoreFileSchema.parse(value);
    const connections = Object.fromEntries(
        Object.values(legacy.connections)
            .map((record): [string, AppIntegrationConnectionRecord] => [
                record.id,
                {
                    id: record.id,
                    providerId: record.providerId,
                    accountId: record.accountId,
                    accountLogin: record.accountLogin,
                    accountDisplayName: record.accountDisplayName,
                    connectedAt: record.connectedAt,
                    accessTokenExpiresAt: record.accessTokenExpiresAt,
                    refreshTokenExpiresAt: record.refreshTokenExpiresAt,
                    requiresReauthorisation: false,
                    accessTargets: record.accessTarget
                        ? [
                              {
                                  id: createLegacyAccessTargetId(
                                      record.id,
                                      record.accessTarget.id,
                                  ),
                                  providerTargetId: record.accessTarget.id,
                                  login: record.accessTarget.login,
                                  type: record.accessTarget.type,
                                  manageUrl: record.accessTarget.manageUrl,
                                  availability: 'available',
                              },
                          ]
                        : [],
                },
            ])
            .sort(([left], [right]) => left.localeCompare(right)),
    );

    return { schemaVersion: APP_INTEGRATION_SCHEMA_VERSION, connections };
}

/**
 * Validates and orders stored encrypted credentials.
 *
 * @param value - Untrusted persisted value.
 * @returns Valid current encrypted credentials.
 */
export function normalizeAppIntegrationSecretsStore(
    value: unknown,
): AppIntegrationSecretsStoreFile {
    const parsed = AppIntegrationSecretsStoreFileSchema.parse(value);
    return {
        schemaVersion: APP_INTEGRATION_SECRETS_SCHEMA_VERSION,
        credentials: Object.fromEntries(
            Object.entries(parsed.credentials).sort(([left], [right]) =>
                left.localeCompare(right),
            ),
        ),
    };
}

/**
 * Creates a stable opaque UUID for one unreleased legacy access target.
 *
 * @param connectionId - Stable local connection ID.
 * @param providerTargetId - Provider-owned target ID.
 * @returns A deterministic renderer-safe target ID.
 */
function createLegacyAccessTargetId(
    connectionId: string,
    providerTargetId: string,
): string {
    const hash = createHash('sha256')
        .update(`${connectionId}\0${providerTargetId}`)
        .digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
