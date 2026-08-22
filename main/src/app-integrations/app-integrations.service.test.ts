import type { AppIntegrationSummary } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    type AppIntegrationConnectionRecord,
    type AppIntegrationProvider,
    type AppIntegrationProviderConnection,
    type AppIntegrationProviderConnectionResult,
    AppIntegrationProviderError,
} from './app-integration.types.js';
import type { AppIntegrationProviderRegistry } from './app-integration-provider.registry.js';
import type { AppIntegrationSecretsStore } from './app-integration-secrets.store.js';
import type { AppIntegrationSecureStorageAdapter } from './app-integration-secure-storage.adapter.js';
import { AppIntegrationsService } from './app-integrations.service.js';
import type { AppIntegrationsStore } from './app-integrations.store.js';

vi.mock('electron', () => ({ safeStorage: {} }));

/**
 * Creates one provider connection result for a test account.
 *
 * @param accountId - Immutable provider account ID.
 * @param accountLogin - Provider account login.
 * @returns A validated provider connection result.
 */
function connectionResult(
    accountId: string,
    accountLogin: string,
): AppIntegrationProviderConnection {
    return {
        accountId,
        accountLogin,
        accountDisplayName: `Account ${accountId}`,
        credential: `{"token":"secret-${accountId}"}`,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        accessTargets: [
            {
                providerTargetId: `installation-${accountId}`,
                login: accountLogin,
                type: 'user',
                manageUrl: `https://github.com/settings/installations/installation-${accountId}`,
            },
        ],
        selectedAccessTargetId: `installation-${accountId}`,
    };
}

/**
 * Creates an authorised connection with an optional installation continuation.
 *
 * @param connected - Final provider connection returned after installation.
 * @returns A provider result at the installation-choice stage.
 */
function connectionAttempt(
    connected: AppIntegrationProviderConnection,
): AppIntegrationProviderConnectionResult {
    return {
        connection: { ...connected, selectedAccessTargetId: null },
        installation: {
            install: vi.fn(async () => connected),
            close: vi.fn(),
        },
    };
}

/**
 * Creates one completed provider result without an installation continuation.
 *
 * @param connected - Verified reauthorised connection.
 * @returns A completed provider result.
 */
function completedConnection(
    connected: AppIntegrationProviderConnection,
): AppIntegrationProviderConnectionResult {
    return { connection: connected, installation: null };
}

describe('AppIntegrationsService', () => {
    let records: Map<string, AppIntegrationConnectionRecord>;
    let ciphertexts: Map<string, string>;
    let provider: AppIntegrationProvider;
    let service: AppIntegrationsService;

    beforeEach(() => {
        records = new Map();
        ciphertexts = new Map();
        provider = {
            metadata: { id: 'github', displayName: 'GitHub', order: 10 },
            connect: vi.fn(async () =>
                connectionAttempt(connectionResult('1', 'octocat')),
            ),
            refresh: vi.fn(async () => ({
                status: 'temporarily-unavailable' as const,
            })),
            prepareCredentialRevocation: vi.fn(async (_signal, credential) => ({
                credential,
                accessTokenExpiresAt: null,
                refreshTokenExpiresAt: null,
            })),
            revokeCredential: vi.fn(),
            isCredentialValid: vi.fn(() => true),
            openManageAccess: vi.fn(),
        };
        const registry = {
            list: vi.fn(() => [provider]),
            get: vi.fn(() => provider),
        } as unknown as AppIntegrationProviderRegistry;
        const store = {
            listByProvider: vi.fn(async (providerId: string) =>
                [...records.values()].filter(
                    (record) => record.providerId === providerId,
                ),
            ),
            get: vi.fn(async (connectionId: string) =>
                records.get(connectionId),
            ),
            findByAccount: vi.fn(
                async (providerId: string, accountId: string) =>
                    [...records.values()].find(
                        (record) =>
                            record.providerId === providerId &&
                            record.accountId === accountId,
                    ) ?? null,
            ),
            set: vi.fn(async (record: AppIntegrationConnectionRecord) => {
                records.set(record.id, record);
            }),
            remove: vi.fn(async (connectionId: string) => {
                const previous = records.get(connectionId) ?? null;
                records.delete(connectionId);
                return previous;
            }),
        } as unknown as AppIntegrationsStore;
        const secrets = {
            get: vi.fn(async (connectionId: string) =>
                ciphertexts.get(connectionId),
            ),
            set: vi.fn(async (connectionId: string, ciphertext: string) => {
                ciphertexts.set(connectionId, ciphertext);
            }),
            remove: vi.fn(async (connectionId: string) => {
                ciphertexts.delete(connectionId);
            }),
        } as unknown as AppIntegrationSecretsStore;
        const secureStorage = {
            isAvailable: vi.fn(async () => true),
            encrypt: vi.fn(async (value: string) => `encrypted:${value}`),
            decrypt: vi.fn(async (value: string) =>
                value.replace('encrypted:', ''),
            ),
        } as unknown as AppIntegrationSecureStorageAdapter;
        service = new AppIntegrationsService(
            registry,
            store,
            secrets,
            secureStorage,
        );
    });

    /** Connects the first existing installation offered by the fake provider. */
    async function connectFirstOption() {
        const started = await service.connect('github');
        const option = started.integration.connectionOptions[0];
        if (!option) {
            throw new Error('Test connection option was not created');
        }
        return service.finishConnections('github', [option.id]);
    }

    it('requires an explicit choice for one existing installation', async () => {
        const attempt = connectionAttempt(connectionResult('1', 'octocat'));
        vi.mocked(provider.connect).mockResolvedValueOnce(attempt);
        const started = await service.connect('github');

        expect(started).toMatchObject({
            ok: true,
            integration: {
                id: 'github',
                state: 'selection-required',
                connectionStage: 'choosing',
                connections: [],
                connectionOptions: [{ login: 'octocat', type: 'user' }],
            },
        });
        expect(records.size).toBe(0);
        expect(ciphertexts.size).toBe(0);
        expect(JSON.stringify(started)).not.toContain('installation-1');

        const option = started.integration.connectionOptions[0];
        if (!option) {
            throw new Error('Test connection option was not created');
        }
        const result = await service.finishConnections('github', [option.id]);

        expect(result).toMatchObject({
            ok: true,
            integration: {
                id: 'github',
                state: 'connected',
                connections: [
                    {
                        accountLogin: 'octocat',
                        accountDisplayName: 'Account 1',
                        state: 'connected',
                        accessTargets: [
                            {
                                login: 'octocat',
                                type: 'user',
                                availability: 'available',
                            },
                        ],
                    },
                ],
            },
        });
        expect([...ciphertexts.values()]).toEqual([
            'encrypted:{"token":"secret-1"}',
        ]);
        expect(JSON.stringify(result)).not.toContain('secret');
        expect(JSON.stringify(result)).not.toContain('installation-1');
        expect(provider.connect).toHaveBeenCalledWith(expect.any(AbortSignal), {
            intent: 'connect',
            expectedAccountId: null,
        });
        expect(attempt.installation?.close).toHaveBeenCalledOnce();
        expect(attempt.installation?.install).not.toHaveBeenCalled();
    });

    it('persists several selected installations as one connection', async () => {
        const connected = connectionResult('1', 'octocat');
        connected.accessTargets.push({
            providerTargetId: 'installation-org',
            login: 'godotlauncher',
            type: 'organization',
            manageUrl:
                'https://github.com/organizations/godotlauncher/settings/installations/installation-org',
        });
        const attempt = connectionAttempt(connected);
        vi.mocked(provider.connect).mockResolvedValueOnce(attempt);

        const started = await service.connect('github');
        const result = await service.finishConnections(
            'github',
            started.integration.connectionOptions.map((option) => option.id),
        );

        expect(result.ok).toBe(true);
        expect(records.size).toBe(1);
        expect(ciphertexts.size).toBe(1);
        expect([...records.values()][0]?.accessTargets).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ login: 'octocat', type: 'user' }),
                expect.objectContaining({
                    login: 'godotlauncher',
                    type: 'organization',
                }),
            ]),
        );
        expect(attempt.installation?.install).not.toHaveBeenCalled();
        expect(attempt.installation?.close).toHaveBeenCalledOnce();
    });

    it('rejects empty, duplicate, and unknown installation choices', async () => {
        const started = await service.connect('github');
        const option = started.integration.connectionOptions[0];
        if (!option) {
            throw new Error('Test connection option was not created');
        }

        for (const optionIds of [
            [],
            [option.id, option.id],
            [option.id, 'unknown-option'],
        ]) {
            await expect(
                service.finishConnections('github', optionIds),
            ).resolves.toMatchObject({ ok: false });
        }

        expect(records.size).toBe(0);
        expect(ciphertexts.size).toBe(0);
        await expect(
            service.finishConnections('github', [option.id]),
        ).resolves.toMatchObject({ ok: true });
    });

    it('keeps installation pending while focus refreshes are ignored', async () => {
        let completeInstallation:
            | ((connected: AppIntegrationProviderConnection) => void)
            | undefined;
        const installed = connectionResult('1', 'octocat');
        const attempt = connectionAttempt(installed);
        if (!attempt.installation) {
            throw new Error('Test installation continuation was not created');
        }
        attempt.installation.install = vi.fn(
            () =>
                new Promise<AppIntegrationProviderConnection>((resolve) => {
                    completeInstallation = resolve;
                }),
        );
        vi.mocked(provider.connect).mockResolvedValueOnce(attempt);

        const authorised = await service.connect('github');
        expect(authorised.integration.connectionStage).toBe('choosing');
        const installing = service.installConnection('github');
        await vi.waitFor(() =>
            expect(attempt.installation?.install).toHaveBeenCalledOnce(),
        );

        await expect(service.refresh('github')).resolves.toMatchObject({
            ok: true,
            integration: {
                state: 'connecting',
                connectionStage: 'installing',
            },
        });
        expect(provider.refresh).not.toHaveBeenCalled();

        completeInstallation?.(installed);
        await expect(installing).resolves.toMatchObject({
            ok: true,
            integration: { state: 'connected', connectionStage: null },
        });
    });

    it('adds different connections and refreshes an existing identity without duplication', async () => {
        await connectFirstOption();
        const firstId = [...records.keys()][0];
        vi.mocked(provider.connect).mockResolvedValueOnce(
            connectionAttempt(connectionResult('2', 'hubot')),
        );

        await connectFirstOption();
        expect(records.size).toBe(2);
        expect(ciphertexts.size).toBe(2);

        vi.mocked(provider.connect).mockResolvedValueOnce(
            completedConnection(connectionResult('1', 'octocat-renamed')),
        );
        const result = await service.reconnect('github', String(firstId));

        expect(records.size).toBe(2);
        expect(ciphertexts.size).toBe(2);
        expect(records.get(String(firstId))).toMatchObject({
            id: firstId,
            accountLogin: 'octocat-renamed',
        });
        expect(result.integration.connections).toHaveLength(2);
        expect(provider.connect).toHaveBeenLastCalledWith(
            expect.any(AbortSignal),
            expect.objectContaining({
                intent: 'reconnect',
                expectedAccountId: '1',
            }),
        );
    });

    it('updates the same installation for one user without duplication', async () => {
        await connectFirstOption();
        const update = connectionAttempt(
            connectionResult('1', 'octocat-renamed'),
        );
        vi.mocked(provider.connect).mockResolvedValueOnce(update);

        const started = await service.connect('github');
        expect(started.integration.connectionOptions).toEqual([]);
        const result = await service.installConnection('github');

        expect(result.ok).toBe(true);
        expect(records.size).toBe(1);
        expect([...records.values()][0]?.accessTargets).toHaveLength(1);
        expect([...records.values()][0]?.accountLogin).toBe('octocat-renamed');
        expect([...records.values()][0]?.accessTargets[0]?.login).toBe(
            'octocat-renamed',
        );
    });

    it('allows the same installation under two authorised users', async () => {
        await connectFirstOption();
        const second = connectionResult('2', 'hubot');
        const secondTarget = second.accessTargets[0];
        if (!secondTarget) {
            throw new Error('Test connection target was not created');
        }
        second.accessTargets[0] = {
            ...secondTarget,
            providerTargetId: 'installation-1',
        };
        second.selectedAccessTargetId = 'installation-1';
        vi.mocked(provider.connect).mockResolvedValueOnce(
            connectionAttempt(second),
        );

        await connectFirstOption();

        expect(records.size).toBe(2);
        expect(
            [...records.values()].map(
                (record) => record.accessTargets[0]?.providerTargetId,
            ),
        ).toEqual(['installation-1', 'installation-1']);
    });

    it('marks missing installations unavailable and restores them on refresh', async () => {
        await connectFirstOption();
        const hidden = connectionResult('1', 'octocat');
        hidden.credential = '{"token":"rotated"}';
        hidden.accessTargets = [];
        hidden.selectedAccessTargetId = null;
        vi.mocked(provider.refresh).mockResolvedValueOnce({
            status: 'refreshed',
            connection: hidden,
        });

        const unavailable = await service.refresh('github');

        expect(
            unavailable.integration.connections[0]?.accessTargets[0],
        ).toMatchObject({
            login: 'octocat',
            availability: 'unavailable',
        });
        expect([...ciphertexts.values()]).toEqual([
            'encrypted:{"token":"rotated"}',
        ]);

        const restored = connectionResult('1', 'octocat');
        restored.selectedAccessTargetId = null;
        vi.mocked(provider.refresh).mockResolvedValueOnce({
            status: 'refreshed',
            connection: restored,
        });

        const available = await service.refresh('github');

        expect(
            available.integration.connections[0]?.accessTargets[0],
        ).toMatchObject({
            availability: 'available',
        });
    });

    it('requires reauthorisation after a terminal credential failure', async () => {
        await connectFirstOption();
        vi.mocked(provider.refresh).mockResolvedValueOnce({
            status: 'reauthorisation-required',
        });

        const result = await service.refresh('github');

        expect(result.integration.connections[0]?.state).toBe(
            'reauthorisation-required',
        );
        expect(ciphertexts.size).toBe(1);
    });

    it('leases refreshed credentials only through the main-process callback', async () => {
        await connectFirstOption();
        const result = await service.withCredentialLease(
            'github',
            async (routes) => ({
                count: routes.length,
                targetId: routes[0]?.accessTarget.id,
                receivedCredential: routes[0]?.credential,
            }),
        );

        expect(result).toMatchObject({
            ok: true,
            value: {
                count: 1,
                receivedCredential: '{"token":"secret-1"}',
            },
        });
        expect(provider.refresh).toHaveBeenCalledOnce();
        expect(JSON.stringify(await service.list())).not.toContain('secret-1');
    });

    it('disconnects one target while retaining a shared credential', async () => {
        const connected = connectionResult('1', 'octocat');
        connected.accessTargets.push({
            providerTargetId: 'installation-org',
            login: 'godotlauncher',
            type: 'organization',
            manageUrl:
                'https://github.com/organizations/godotlauncher/settings/installations/installation-org',
        });
        connected.selectedAccessTargetId = 'installation-1';
        vi.mocked(provider.connect).mockResolvedValueOnce(
            connectionAttempt(connected),
        );
        await connectFirstOption();
        connected.selectedAccessTargetId = 'installation-org';
        vi.mocked(provider.connect).mockResolvedValueOnce(
            connectionAttempt(connected),
        );
        const secondAttempt = await service.connect('github');
        const organisationOption =
            secondAttempt.integration.connectionOptions.find(
                (option) => option.login === 'godotlauncher',
            );
        if (!organisationOption) {
            throw new Error('Test organisation option was not created');
        }
        await service.finishConnections('github', [organisationOption.id]);
        const record = [...records.values()][0];
        const target = record?.accessTargets.find(
            (item) => item.providerTargetId === 'installation-1',
        );
        if (!record || !target) {
            throw new Error('Test connections were not persisted');
        }

        await service.disconnect('github', record.id, target.id, {
            revokeAuthorisation: true,
        });

        expect(records.get(record.id)?.accessTargets).toHaveLength(1);
        expect(ciphertexts.has(record.id)).toBe(true);
        expect(provider.revokeCredential).not.toHaveBeenCalled();
    });

    it('targets reconnect, management, and disconnect actions', async () => {
        await connectFirstOption();
        vi.mocked(provider.connect).mockResolvedValueOnce(
            connectionAttempt(connectionResult('2', 'hubot')),
        );
        await connectFirstOption();
        const octocat = [...records.values()].find(
            (record) => record.accountId === '1',
        );
        if (!octocat) {
            throw new Error('Test account was not persisted');
        }

        vi.mocked(provider.connect).mockResolvedValueOnce(
            completedConnection(connectionResult('1', 'octocat')),
        );
        await service.reconnect('github', octocat.id);
        expect(provider.connect).toHaveBeenLastCalledWith(
            expect.any(AbortSignal),
            expect.objectContaining({
                intent: 'reconnect',
                expectedAccountId: '1',
            }),
        );

        const refreshed = records.get(octocat.id);
        const target = refreshed?.accessTargets[0];
        if (!target) {
            throw new Error('Test installation was not persisted');
        }
        await service.manageAccess('github', octocat.id, target.id);
        await service.manageAccess('github', octocat.id, target.id);
        expect(provider.openManageAccess).toHaveBeenCalledTimes(2);
        expect(provider.openManageAccess).toHaveBeenLastCalledWith(target);

        const result = await service.disconnect(
            'github',
            octocat.id,
            target.id,
            { revokeAuthorisation: false },
        );
        expect(result.integration.connections).toHaveLength(1);
        expect(records.has(octocat.id)).toBe(false);
        expect(ciphertexts.has(octocat.id)).toBe(false);
        expect(provider.revokeCredential).not.toHaveBeenCalled();
    });

    it('revokes the final authorisation before deleting local state', async () => {
        await connectFirstOption();
        const record = [...records.values()][0];
        const target = record?.accessTargets[0];
        if (!record || !target) {
            throw new Error('Test connection was not persisted');
        }
        vi.mocked(provider.revokeCredential).mockImplementationOnce(
            async () => {
                expect(records.has(record.id)).toBe(true);
                expect(ciphertexts.has(record.id)).toBe(true);
            },
        );

        const result = await service.disconnect(
            'github',
            record.id,
            target.id,
            { revokeAuthorisation: true },
        );

        expect(result.ok).toBe(true);
        expect(provider.prepareCredentialRevocation).toHaveBeenCalledWith(
            expect.any(AbortSignal),
            '{"token":"secret-1"}',
        );
        expect(provider.revokeCredential).toHaveBeenCalledWith(
            expect.any(AbortSignal),
            '{"token":"secret-1"}',
        );
        expect(records.has(record.id)).toBe(false);
        expect(ciphertexts.has(record.id)).toBe(false);
    });

    it('preserves local state when selected revocation fails', async () => {
        await connectFirstOption();
        const record = [...records.values()][0];
        const target = record?.accessTargets[0];
        if (!record || !target) {
            throw new Error('Test connection was not persisted');
        }
        vi.mocked(provider.revokeCredential).mockRejectedValueOnce(
            new AppIntegrationProviderError('provider-unavailable'),
        );

        const result = await service.disconnect(
            'github',
            record.id,
            target.id,
            { revokeAuthorisation: true },
        );

        expect(result).toMatchObject({
            ok: false,
            reason: 'provider-unavailable',
        });
        expect(records.get(record.id)).toEqual(record);
        expect(ciphertexts.has(record.id)).toBe(true);
    });

    it('rejects an invalid renderer revocation option without deleting state', async () => {
        await connectFirstOption();
        const record = [...records.values()][0];
        const target = record?.accessTargets[0];
        if (!record || !target) {
            throw new Error('Test connection was not persisted');
        }

        const result = await service.disconnect(
            'github',
            record.id,
            target.id,
            { revokeAuthorisation: 'true' } as never,
        );

        expect(result).toMatchObject({ ok: false, reason: 'unknown' });
        expect(provider.revokeCredential).not.toHaveBeenCalled();
        expect(records.has(record.id)).toBe(true);
        expect(ciphertexts.has(record.id)).toBe(true);
    });

    it('does not disconnect while the provider credential is refreshing', async () => {
        await connectFirstOption();
        const record = [...records.values()][0];
        const target = record?.accessTargets[0];
        if (!record || !target) {
            throw new Error('Test connection was not persisted');
        }
        let finishRefresh:
            | ((result: { status: 'temporarily-unavailable' }) => void)
            | undefined;
        vi.mocked(provider.refresh).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishRefresh = resolve;
                }),
        );
        const refreshing = service.refresh('github');
        await vi.waitFor(() => expect(provider.refresh).toHaveBeenCalledOnce());

        const result = await service.disconnect(
            'github',
            record.id,
            target.id,
            { revokeAuthorisation: true },
        );

        expect(result).toMatchObject({
            ok: false,
            reason: 'already-connecting',
        });
        expect(provider.revokeCredential).not.toHaveBeenCalled();
        expect(records.has(record.id)).toBe(true);
        expect(ciphertexts.has(record.id)).toBe(true);
        finishRefresh?.({ status: 'temporarily-unavailable' });
        await refreshing;
    });

    it('does not refresh while provider credential revocation is active', async () => {
        await connectFirstOption();
        const record = [...records.values()][0];
        const target = record?.accessTargets[0];
        if (!record || !target) {
            throw new Error('Test connection was not persisted');
        }
        let finishRevocation: (() => void) | undefined;
        vi.mocked(provider.revokeCredential).mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finishRevocation = resolve;
                }),
        );
        const disconnecting = service.disconnect(
            'github',
            record.id,
            target.id,
            { revokeAuthorisation: true },
        );
        await vi.waitFor(() =>
            expect(provider.revokeCredential).toHaveBeenCalledOnce(),
        );

        await expect(service.refresh('github')).resolves.toMatchObject({
            ok: true,
        });
        expect(provider.refresh).not.toHaveBeenCalled();
        expect(records.has(record.id)).toBe(true);
        expect(ciphertexts.has(record.id)).toBe(true);

        finishRevocation?.();
        await expect(disconnecting).resolves.toMatchObject({ ok: true });
    });

    it('retains a rotated credential when revocation fails', async () => {
        await connectFirstOption();
        const record = [...records.values()][0];
        const target = record?.accessTargets[0];
        if (!record || !target) {
            throw new Error('Test connection was not persisted');
        }
        vi.mocked(provider.prepareCredentialRevocation).mockResolvedValueOnce({
            credential: '{"token":"rotated-secret"}',
            accessTokenExpiresAt: '2026-08-22T00:00:00.000Z',
            refreshTokenExpiresAt: '2027-02-21T00:00:00.000Z',
        });
        vi.mocked(provider.revokeCredential).mockRejectedValueOnce(
            new AppIntegrationProviderError('network-error'),
        );

        const result = await service.disconnect(
            'github',
            record.id,
            target.id,
            { revokeAuthorisation: true },
        );

        expect(result).toMatchObject({ ok: false, reason: 'network-error' });
        expect(ciphertexts.get(record.id)).toBe(
            'encrypted:{"token":"rotated-secret"}',
        );
        expect(records.get(record.id)).toMatchObject({
            accessTokenExpiresAt: '2026-08-22T00:00:00.000Z',
            refreshTokenExpiresAt: '2027-02-21T00:00:00.000Z',
        });
    });

    it('rejects a different account before replacing a targeted connection', async () => {
        await connectFirstOption();
        const record = [...records.values()][0];
        if (!record) {
            throw new Error('Test account was not persisted');
        }
        const previousCiphertext = ciphertexts.get(record.id);
        vi.mocked(provider.connect).mockResolvedValueOnce(
            completedConnection(connectionResult('2', 'hubot')),
        );

        await expect(
            service.reconnect('github', record.id),
        ).resolves.toMatchObject({ ok: false, reason: 'account-mismatch' });
        expect(records.get(record.id)).toEqual(record);
        expect(ciphertexts.get(record.id)).toBe(previousCiphertext);
    });

    it('shows connecting and cancels the active provider attempt', async () => {
        provider.connect = vi.fn(
            (signal) =>
                new Promise((_, reject) => {
                    signal.addEventListener('abort', () =>
                        reject(new AppIntegrationProviderError('cancelled')),
                    );
                }),
        );

        const connecting = service.connect('github');
        await expect(service.list()).resolves.toMatchObject([
            { state: 'connecting' },
        ] satisfies Partial<AppIntegrationSummary>[]);
        await expect(service.cancel('github')).resolves.toMatchObject({
            ok: true,
            integration: { state: 'not-connected', connections: [] },
        });
        await expect(connecting).resolves.toMatchObject({
            ok: false,
            reason: 'cancelled',
        });
    });
});
