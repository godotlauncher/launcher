import type { ConfigService } from '@mariodebono/di-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../config/index.js';
import type { GitHubApiClient } from './github-api.client.js';
import { GitHubAppIntegrationProvider } from './github-app-integration.provider.js';
import type { GitHubAuthBrokerClient } from './github-auth-broker.client.js';
import type { GitHubAuthLoopbackListenerService } from './github-auth-loopback-listener.service.js';

const mocks = vi.hoisted(() => ({
    openExternal: vi.fn(),
    revealMainWindow: vi.fn(),
}));

vi.mock('electron', () => ({ shell: { openExternal: mocks.openExternal } }));
vi.mock('../../../mainWindow.js', () => ({
    revealMainWindow: mocks.revealMainWindow,
}));

describe('GitHubAppIntegrationProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns verified installation choices after OAuth', async () => {
        const respond = vi.fn();
        const listener = {
            descriptor: {
                host: '127.0.0.1' as const,
                port: 54321,
                nonce: 'n'.repeat(43),
            },
            waitForCompletion: vi.fn().mockResolvedValueOnce({
                ticket: 't'.repeat(38),
                respond,
            }),
            close: vi.fn(),
        };
        const broker = {
            createAttempt: vi.fn(async () => ({
                attemptId: 'a'.repeat(64),
                attemptToken: 'b'.repeat(43),
                browserUrl:
                    'https://github.com/login/oauth/authorize?prompt=select_account',
                expiresAt: Date.now() + 60_000,
            })),
            redeemOAuth: vi.fn(async () => ({
                accessToken: 'access-token',
                expiresIn: 28_800,
                installationUrl:
                    'https://github.com/apps/godot-launcher/installations/new?state=state',
                refreshToken: 'refresh-token',
                refreshTokenExpiresIn: 15_897_600,
                scope: '',
                tokenType: 'bearer',
            })),
            cancel: vi.fn(),
        };
        const accessTarget = {
            providerTargetId: '123456',
            login: 'godotlauncher',
            type: 'organization' as const,
            manageUrl:
                'https://github.com/organizations/godotlauncher/settings/installations/123456',
        };
        const github = {
            getUser: vi.fn(async () => ({
                id: 1,
                login: 'octocat',
                name: 'The Octocat',
            })),
            getInstallations: vi.fn(async () => [accessTarget]),
        };
        const provider = new GitHubAppIntegrationProvider(
            {
                getOrThrow: vi.fn(() => true),
            } as unknown as ConfigService<AppConfig>,
            broker as unknown as GitHubAuthBrokerClient,
            {
                start: vi.fn(async () => listener),
            } as unknown as GitHubAuthLoopbackListenerService,
            github as unknown as GitHubApiClient,
        );

        const result = await provider.connect(new AbortController().signal, {
            intent: 'connect',
            expectedAccountId: null,
        });

        expect(mocks.openExternal).toHaveBeenCalledWith(
            expect.stringContaining('https://github.com/login/oauth/authorize'),
        );
        expect(broker.createAttempt).toHaveBeenCalledWith(
            expect.any(String),
            listener.descriptor,
            'connect',
            expect.any(AbortSignal),
        );
        expect(github.getUser).toHaveBeenCalledWith(
            'access-token',
            expect.any(AbortSignal),
        );
        expect(github.getInstallations).toHaveBeenCalledWith(
            'access-token',
            expect.any(AbortSignal),
        );
        expect(respond).toHaveBeenCalledWith(true);
        expect(mocks.revealMainWindow).toHaveBeenCalledOnce();
        expect(mocks.openExternal).toHaveBeenCalledTimes(1);
        expect(broker.cancel).not.toHaveBeenCalled();
        expect(listener.close).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            connection: {
                accountId: '1',
                accountLogin: 'octocat',
                accountDisplayName: 'The Octocat',
                accessTargets: [accessTarget],
                selectedAccessTargetId: null,
            },
        });
        expect(provider.isCredentialValid(result.connection.credential)).toBe(
            true,
        );

        await result.installation?.close();
        expect(listener.close).toHaveBeenCalledOnce();
        expect(broker.cancel).toHaveBeenCalledWith(
            expect.objectContaining({ attemptId: 'a'.repeat(64) }),
        );
    });

    it('installs explicitly through the original broker attempt', async () => {
        const oauthRespond = vi.fn();
        const setupRespond = vi.fn();
        const listener = {
            descriptor: {
                host: '127.0.0.1' as const,
                port: 54321,
                nonce: 'n'.repeat(43),
            },
            waitForCompletion: vi
                .fn()
                .mockResolvedValueOnce({
                    ticket: 'o'.repeat(38),
                    respond: oauthRespond,
                })
                .mockResolvedValueOnce({
                    ticket: 's'.repeat(38),
                    respond: setupRespond,
                }),
            close: vi.fn(),
        };
        const broker = {
            createAttempt: vi.fn(async () => ({
                attemptId: 'a'.repeat(64),
                attemptToken: 'b'.repeat(43),
                browserUrl:
                    'https://github.com/login/oauth/authorize?prompt=select_account',
                expiresAt: Date.now() + 60_000,
            })),
            redeemOAuth: vi.fn(async () => ({
                accessToken: 'access-token',
                expiresIn: 28_800,
                installationUrl:
                    'https://github.com/apps/godot-launcher/installations/new?state=state',
                refreshToken: 'refresh-token',
                refreshTokenExpiresIn: 15_897_600,
                scope: '',
                tokenType: 'bearer',
            })),
            redeemSetup: vi.fn(async () => ({ installationId: '123456' })),
            cancel: vi.fn(),
        };
        const accessTarget = {
            providerTargetId: '123456',
            login: 'godotlauncher',
            type: 'organization' as const,
            manageUrl:
                'https://github.com/organizations/godotlauncher/settings/installations/123456',
        };
        const github = {
            getUser: vi.fn(async () => ({
                id: 1,
                login: 'octocat',
                name: 'The Octocat',
            })),
            getInstallations: vi
                .fn()
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([accessTarget]),
        };
        const provider = new GitHubAppIntegrationProvider(
            {
                getOrThrow: vi.fn(() => true),
            } as unknown as ConfigService<AppConfig>,
            broker as unknown as GitHubAuthBrokerClient,
            {
                start: vi.fn(async () => listener),
            } as unknown as GitHubAuthLoopbackListenerService,
            github as unknown as GitHubApiClient,
        );

        const result = await provider.connect(new AbortController().signal, {
            intent: 'connect',
            expectedAccountId: null,
        });
        await expect(result.installation?.install()).resolves.toMatchObject({
            accountId: '1',
            accessTargets: [accessTarget],
            selectedAccessTargetId: '123456',
        });

        expect(broker.createAttempt).toHaveBeenCalledWith(
            expect.any(String),
            listener.descriptor,
            'connect',
            expect.any(AbortSignal),
        );
        expect(broker.createAttempt).toHaveBeenCalledOnce();
        expect(oauthRespond).toHaveBeenCalledWith(true);
        expect(setupRespond).toHaveBeenCalledWith(true);
        expect(mocks.openExternal).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('/installations/new'),
        );
        expect(github.getInstallations).toHaveBeenCalledTimes(2);
        expect(mocks.revealMainWindow).toHaveBeenCalledTimes(2);

        await result.installation?.close();
        expect(listener.close).toHaveBeenCalledOnce();
    });

    it('rejects a different identity during reconnect', async () => {
        const listener = {
            descriptor: {
                host: '127.0.0.1' as const,
                port: 54321,
                nonce: 'n'.repeat(43),
            },
            waitForCompletion: vi.fn(async () => ({
                ticket: 't'.repeat(38),
                respond: vi.fn(),
            })),
            close: vi.fn(),
        };
        const broker = {
            createAttempt: vi.fn(async () => ({
                attemptId: 'a'.repeat(64),
                attemptToken: 'b'.repeat(43),
                browserUrl:
                    'https://github.com/login/oauth/authorize?prompt=select_account',
                expiresAt: Date.now() + 60_000,
            })),
            redeemOAuth: vi.fn(async () => ({
                accessToken: 'access-token',
                expiresIn: 28_800,
                installationUrl: null,
                refreshToken: 'refresh-token',
                refreshTokenExpiresIn: 15_897_600,
                scope: '',
                tokenType: 'bearer',
            })),
            cancel: vi.fn(),
        };
        const github = {
            getUser: vi.fn(async () => ({
                id: 2,
                login: 'hubot',
                name: 'Hubot',
            })),
            getInstallations: vi.fn(async () => []),
        };
        const provider = new GitHubAppIntegrationProvider(
            {
                getOrThrow: vi.fn(() => true),
            } as unknown as ConfigService<AppConfig>,
            broker as unknown as GitHubAuthBrokerClient,
            {
                start: vi.fn(async () => listener),
            } as unknown as GitHubAuthLoopbackListenerService,
            github as unknown as GitHubApiClient,
        );

        await expect(
            provider.connect(new AbortController().signal, {
                intent: 'reconnect',
                expectedAccountId: '1',
            }),
        ).rejects.toMatchObject({ reason: 'account-mismatch' });
        expect(mocks.revealMainWindow).not.toHaveBeenCalled();
    });

    it('rotates an expiring credential and verifies the same user', async () => {
        const broker = {
            refresh: vi.fn(async () => ({
                accessToken: 'rotated-access-token',
                expiresIn: 28_800,
                installationId: null,
                refreshToken: 'rotated-refresh-token',
                refreshTokenExpiresIn: 15_897_600,
                scope: '',
                tokenType: 'bearer',
            })),
        };
        const github = {
            getUser: vi.fn(async () => ({
                id: 1,
                login: 'octocat',
                name: 'The Octocat',
            })),
            getInstallations: vi.fn(async () => []),
        };
        const provider = new GitHubAppIntegrationProvider(
            {} as never,
            broker as unknown as GitHubAuthBrokerClient,
            {} as never,
            github as unknown as GitHubApiClient,
        );
        const credential = JSON.stringify({
            version: 1,
            createdAt: new Date(Date.now() - 9 * 60 * 60 * 1_000).toISOString(),
            accessToken: 'old-access-token',
            expiresIn: 28_800,
            refreshToken: 'old-refresh-token',
            refreshTokenExpiresIn: 15_897_600,
            scope: '',
            tokenType: 'bearer',
        });

        const result = await provider.refresh(
            new AbortController().signal,
            credential,
            '1',
        );

        expect(result).toMatchObject({
            status: 'refreshed',
            connection: {
                accountId: '1',
                accountLogin: 'octocat',
            },
        });
        expect(broker.refresh).toHaveBeenCalledWith(
            'old-refresh-token',
            expect.any(AbortSignal),
        );
        expect(JSON.stringify(result)).toContain('rotated-access-token');
    });

    it('prepares an expiring credential and revokes its complete grant', async () => {
        const broker = {
            refresh: vi.fn(async () => ({
                accessToken: 'rotated-access-token',
                expiresIn: 28_800,
                refreshToken: 'rotated-refresh-token',
                refreshTokenExpiresIn: 15_897_600,
                scope: '',
                tokenType: 'bearer',
            })),
            revoke: vi.fn(),
        };
        const provider = new GitHubAppIntegrationProvider(
            {} as never,
            broker as unknown as GitHubAuthBrokerClient,
            {} as never,
            {} as never,
        );
        const credential = JSON.stringify({
            version: 1,
            createdAt: new Date(Date.now() - 9 * 60 * 60 * 1_000).toISOString(),
            accessToken: 'old-access-token',
            expiresIn: 28_800,
            refreshToken: 'old-refresh-token',
            refreshTokenExpiresIn: 15_897_600,
            scope: '',
            tokenType: 'bearer',
        });
        const signal = new AbortController().signal;

        const prepared = await provider.prepareCredentialRevocation(
            signal,
            credential,
        );
        await provider.revokeCredential(signal, prepared.credential);

        expect(broker.refresh).toHaveBeenCalledWith(
            'old-refresh-token',
            signal,
        );
        expect(broker.revoke).toHaveBeenCalledWith(
            'rotated-access-token',
            signal,
        );
        expect(prepared.credential).toContain('rotated-refresh-token');
        expect(prepared.accessTokenExpiresAt).not.toBeNull();
        expect(prepared.refreshTokenExpiresAt).not.toBeNull();
    });

    it('does not rotate a current credential before revocation', async () => {
        const broker = {
            refresh: vi.fn(),
            revoke: vi.fn(),
        };
        const provider = new GitHubAppIntegrationProvider(
            {} as never,
            broker as unknown as GitHubAuthBrokerClient,
            {} as never,
            {} as never,
        );
        const credential = JSON.stringify({
            version: 1,
            createdAt: new Date().toISOString(),
            accessToken: 'current-access-token',
            expiresIn: 28_800,
            refreshToken: 'current-refresh-token',
            refreshTokenExpiresIn: 15_897_600,
            scope: '',
            tokenType: 'bearer',
        });
        const signal = new AbortController().signal;

        const prepared = await provider.prepareCredentialRevocation(
            signal,
            credential,
        );
        await provider.revokeCredential(signal, prepared.credential);

        expect(prepared.credential).toBe(credential);
        expect(broker.refresh).not.toHaveBeenCalled();
        expect(broker.revoke).toHaveBeenCalledWith(
            'current-access-token',
            signal,
        );
    });

    it('opens the exact verified organisation installation settings', async () => {
        const provider = new GitHubAppIntegrationProvider(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );

        await provider.openManageAccess({
            id: 'e26b8c8d-3f28-4d95-a814-a781223c62e9',
            providerTargetId: '123456',
            login: 'godotlauncher',
            type: 'organization',
            manageUrl:
                'https://github.com/organizations/godotlauncher/settings/installations/123456',
            availability: 'available',
        });

        expect(mocks.openExternal).toHaveBeenCalledWith(
            'https://github.com/organizations/godotlauncher/settings/installations/123456',
        );
    });
});
