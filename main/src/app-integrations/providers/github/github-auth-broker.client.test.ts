import type { ConfigService } from '@mariodebono/di-config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../config/index.js';
import {
    GitHubAuthBrokerClient,
    GitHubBrokerError,
} from './github-auth-broker.client.js';

describe('GitHubAuthBrokerClient', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('uses the local broker and exact ticket redemption contract in development', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json(
                    {
                        attemptId: 'a'.repeat(64),
                        attemptToken: 'b'.repeat(43),
                        browserUrl:
                            'https://github.com/login/oauth/authorize?client_id=client&code_challenge=challenge&code_challenge_method=S256&prompt=select_account&redirect_uri=http%3A%2F%2F127.0.0.1%3A8787%2Fv1%2Foauth%2Fgithub%2Fcallback&state=state',
                        expiresAt: Date.now() + 60_000,
                    },
                    { status: 201 },
                ),
            )
            .mockResolvedValueOnce(
                Response.json({
                    accessToken: 'access-token',
                    expiresIn: 28_800,
                    installationUrl:
                        'https://github.com/apps/godot-launcher/installations/new?state=state',
                    refreshToken: 'refresh-token',
                    refreshTokenExpiresIn: 15_897_600,
                    scope: '',
                    tokenType: 'bearer',
                }),
            )
            .mockResolvedValueOnce(Response.json({ installationId: '123456' }))
            .mockResolvedValueOnce(
                Response.json({
                    accessToken: 'rotated-access-token',
                    expiresIn: 28_800,
                    refreshToken: 'rotated-refresh-token',
                    refreshTokenExpiresIn: 15_897_600,
                    scope: '',
                    tokenType: 'bearer',
                }),
            )
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetchMock);
        const config = {
            getOrThrow: vi.fn(() => true),
        } as unknown as ConfigService<AppConfig>;
        const client = new GitHubAuthBrokerClient(config);
        const signal = new AbortController().signal;

        const attempt = await client.createAttempt(
            'c'.repeat(43),
            { host: '127.0.0.1', port: 54321, nonce: 'd'.repeat(43) },
            'connect',
            signal,
        );
        await client.redeemOAuth(
            attempt,
            'e'.repeat(43),
            'f'.repeat(38),
            signal,
        );
        await client.redeemSetup(
            attempt,
            'e'.repeat(43),
            'g'.repeat(38),
            signal,
        );
        await client.refresh('refresh-token', signal);
        await client.revoke('access-token', signal);

        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            'http://127.0.0.1:8787/v1/oauth/github/attempts',
        );
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            body: expect.stringContaining('"intent":"connect"'),
        });
        expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
            `/attempts/${'a'.repeat(64)}/redeem`,
        );
        expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
            method: 'POST',
            headers: expect.objectContaining({
                Authorization: `Bearer ${'b'.repeat(43)}`,
            }),
        });
        expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
            `/attempts/${'a'.repeat(64)}/redeem`,
        );
        expect(String(fetchMock.mock.calls[3]?.[0])).toBe(
            'http://127.0.0.1:8787/v1/oauth/github/tokens/refresh',
        );
        expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
            body: '{"refreshToken":"refresh-token"}',
        });
        expect(String(fetchMock.mock.calls[4]?.[0])).toBe(
            'http://127.0.0.1:8787/v1/oauth/github/authorisation',
        );
        expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({
            body: '{"accessToken":"access-token"}',
            method: 'DELETE',
        });
    });

    it('accepts only the expected direct authorisation URL', async () => {
        const callback = encodeURIComponent(
            'http://127.0.0.1:8787/v1/oauth/github/callback',
        );
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json(
                    {
                        attemptId: 'a'.repeat(64),
                        attemptToken: 'b'.repeat(43),
                        browserUrl: `https://github.com/login/oauth/authorize?client_id=client&code_challenge=challenge&code_challenge_method=S256&prompt=select_account&redirect_uri=${callback}&state=state`,
                        expiresAt: Date.now() + 60_000,
                    },
                    { status: 201 },
                ),
            ),
        );
        const client = new GitHubAuthBrokerClient({
            getOrThrow: vi.fn(() => true),
        } as unknown as ConfigService<AppConfig>);

        await expect(
            client.createAttempt(
                'c'.repeat(43),
                { host: '127.0.0.1', port: 54321, nonce: 'd'.repeat(43) },
                'reauthorise',
                new AbortController().signal,
            ),
        ).resolves.toMatchObject({ attemptId: 'a'.repeat(64) });
    });

    it('rejects an unexpected browser destination', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json(
                    {
                        attemptId: 'a'.repeat(64),
                        attemptToken: 'b'.repeat(43),
                        browserUrl:
                            'https://github.com/apps/another-app/installations/new?state=test',
                        expiresAt: Date.now() + 60_000,
                    },
                    { status: 201 },
                ),
            ),
        );
        const client = new GitHubAuthBrokerClient({
            getOrThrow: vi.fn(() => true),
        } as unknown as ConfigService<AppConfig>);

        await expect(
            client.createAttempt(
                'c'.repeat(43),
                { host: '127.0.0.1', port: 54321, nonce: 'd'.repeat(43) },
                'connect',
                new AbortController().signal,
            ),
        ).rejects.toThrow('invalid authorisation URL');
    });

    it('rejects an oversized successful broker response before parsing', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify('x'.repeat(65_536)))),
        );
        const client = new GitHubAuthBrokerClient({
            getOrThrow: vi.fn(() => true),
        } as unknown as ConfigService<AppConfig>);

        await expect(
            client.createAttempt(
                'c'.repeat(43),
                { host: '127.0.0.1', port: 54321, nonce: 'd'.repeat(43) },
                'connect',
                new AbortController().signal,
            ),
        ).rejects.toThrow('GitHub returned an invalid response');
    });

    it('maps an oversized broker error to a safe error code', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(JSON.stringify('secret'.repeat(12_000)), {
                        status: 503,
                    }),
            ),
        );
        const client = new GitHubAuthBrokerClient({
            getOrThrow: vi.fn(() => true),
        } as unknown as ConfigService<AppConfig>);

        await expect(
            client.createAttempt(
                'c'.repeat(43),
                { host: '127.0.0.1', port: 54321, nonce: 'd'.repeat(43) },
                'connect',
                new AbortController().signal,
            ),
        ).rejects.toEqual(new GitHubBrokerError('invalid_response', 503));
    });
});
