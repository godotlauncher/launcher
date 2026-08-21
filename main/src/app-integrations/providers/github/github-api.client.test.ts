import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubApiClient } from './github-api.client.js';

describe('GitHubApiClient', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('lists every active installation available to the user', async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({
                installations: [
                    {
                        id: 123456,
                        account: {
                            login: 'godotlauncher',
                            type: 'Organization',
                        },
                        html_url:
                            'https://github.com/organizations/godotlauncher/settings/installations/123456',
                        suspended_at: null,
                    },
                    {
                        id: 654321,
                        account: { login: 'octocat', type: 'User' },
                        html_url:
                            'https://github.com/settings/installations/654321',
                        suspended_at: null,
                    },
                ],
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const client = new GitHubApiClient();

        await expect(
            client.getInstallations(
                'access-token',
                new AbortController().signal,
            ),
        ).resolves.toEqual([
            {
                providerTargetId: '123456',
                login: 'godotlauncher',
                type: 'organization',
                manageUrl:
                    'https://github.com/organizations/godotlauncher/settings/installations/123456',
            },
            {
                providerTargetId: '654321',
                login: 'octocat',
                type: 'user',
                manageUrl: 'https://github.com/settings/installations/654321',
            },
        ]);

        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            'https://api.github.com/user/installations?per_page=100&page=1',
        );
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            headers: expect.objectContaining({
                Authorization: 'Bearer access-token',
            }),
        });
    });

    it('omits suspended installations', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json({
                    installations: [
                        {
                            id: 123456,
                            account: {
                                login: 'godotlauncher',
                                type: 'Organization',
                            },
                            html_url:
                                'https://github.com/organizations/godotlauncher/settings/installations/123456',
                            suspended_at: '2026-08-20T10:00:00Z',
                        },
                    ],
                }),
            ),
        );
        const client = new GitHubApiClient();

        await expect(
            client.getInstallations(
                'access-token',
                new AbortController().signal,
            ),
        ).resolves.toEqual([]);
    });

    it('normalises personal-account installations', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json({
                    installations: [
                        {
                            id: 123456,
                            account: { login: 'octocat', type: 'User' },
                            html_url:
                                'https://github.com/settings/installations/123456',
                            suspended_at: null,
                        },
                    ],
                }),
            ),
        );
        const client = new GitHubApiClient();

        await expect(
            client.getInstallations(
                'access-token',
                new AbortController().signal,
            ),
        ).resolves.toEqual([
            expect.objectContaining({
                providerTargetId: '123456',
                login: 'octocat',
                type: 'user',
            }),
        ]);
    });

    it('rejects a settings URL that does not match the installation owner', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json({
                    installations: [
                        {
                            id: 123456,
                            account: {
                                login: 'godotlauncher',
                                type: 'Organization',
                            },
                            html_url:
                                'https://github.com/settings/installations/123456',
                            suspended_at: null,
                        },
                    ],
                }),
            ),
        );
        const client = new GitHubApiClient();

        await expect(
            client.getInstallations(
                'access-token',
                new AbortController().signal,
            ),
        ).rejects.toThrow('invalid installation settings URL');
    });
});
