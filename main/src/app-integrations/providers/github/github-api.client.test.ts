import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubApiClient } from './github-api.client.js';

describe('GitHubApiClient', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('returns a valid user identity', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json({ id: 1, login: 'octocat', name: 'Octo Cat' }),
            ),
        );
        const client = new GitHubApiClient();

        await expect(
            client.getUser('access-token', new AbortController().signal),
        ).resolves.toEqual({ id: 1, login: 'octocat', name: 'Octo Cat' });
    });

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
                        permissions: { contents: 'read' },
                        suspended_at: null,
                    },
                    {
                        id: 654321,
                        account: { login: 'octocat', type: 'User' },
                        html_url:
                            'https://github.com/settings/installations/654321',
                        permissions: { contents: 'write' },
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
                capabilities: ['repository-browsing'],
                login: 'godotlauncher',
                type: 'organization',
                manageUrl:
                    'https://github.com/organizations/godotlauncher/settings/installations/123456',
            },
            {
                providerTargetId: '654321',
                capabilities: ['repository-browsing'],
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

    it('marks installations with approved write permissions for creation', async () => {
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
                            permissions: {
                                contents: 'write',
                                administration: 'write',
                            },
                            suspended_at: null,
                        },
                    ],
                }),
            ),
        );

        await expect(
            new GitHubApiClient().getInstallations(
                'access-token',
                new AbortController().signal,
            ),
        ).resolves.toEqual([
            expect.objectContaining({
                capabilities: ['repository-browsing', 'repository-creation'],
            }),
        ]);
    });

    it('creates only an empty private organisation repository', async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({
                id: 42,
                owner: { login: 'godotlauncher' },
                name: 'my-game',
                full_name: 'godotlauncher/my-game',
                private: true,
                clone_url: 'https://github.com/godotlauncher/my-game.git',
                html_url: 'https://github.com/godotlauncher/my-game',
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            new GitHubApiClient().createPrivateRepository(
                'access-token',
                'godotlauncher',
                'organization',
                'my-game',
                new AbortController().signal,
            ),
        ).resolves.toMatchObject({ id: 42, private: true });
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            'https://api.github.com/orgs/godotlauncher/repos',
        );
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            method: 'POST',
            redirect: 'manual',
            body: JSON.stringify({
                name: 'my-game',
                private: true,
                auto_init: false,
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
                            permissions: { contents: 'read' },
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

    it('omits installations that have not approved Contents read access', async () => {
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
                            permissions: {},
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
                            permissions: { contents: 'read' },
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
                            permissions: { contents: 'read' },
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

    it('rejects an oversized user response before parsing', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify('x'.repeat(65_536)))),
        );
        const client = new GitHubApiClient();

        await expect(
            client.getUser('access-token', new AbortController().signal),
        ).rejects.toThrow('GitHub returned an invalid response');
    });

    it('rejects more installations than one requested page can contain', async () => {
        const installation = {
            id: 123456,
            account: { login: 'godotlauncher', type: 'Organization' },
            html_url:
                'https://github.com/organizations/godotlauncher/settings/installations/123456',
            permissions: { contents: 'read' },
            suspended_at: null,
        };
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json({
                    installations: Array.from(
                        { length: 101 },
                        () => installation,
                    ),
                }),
            ),
        );
        const client = new GitHubApiClient();

        await expect(
            client.getInstallations(
                'access-token',
                new AbortController().signal,
            ),
        ).rejects.toThrow();
    });

    it('lists bounded pullable repository fields with a validated next link', async () => {
        const next =
            'https://api.github.com/user/installations/123/repositories?per_page=50&page=2';
        const fetchMock = vi.fn(async () =>
            Response.json(
                {
                    repositories: [
                        {
                            id: 42,
                            owner: { login: 'GodotLauncher' },
                            name: 'Launcher',
                            full_name: 'GodotLauncher/Launcher',
                            visibility: 'public',
                            clone_url:
                                'https://github.com/GodotLauncher/Launcher.git',
                            disabled: false,
                            archived: false,
                            permissions: { pull: true },
                        },
                    ],
                },
                { headers: { Link: `<${next}>; rel="next"` } },
            ),
        );
        vi.stubGlobal('fetch', fetchMock);
        const client = new GitHubApiClient();

        await expect(
            client.getInstallationRepositories(
                'access-token',
                '123',
                null,
                new AbortController().signal,
            ),
        ).resolves.toMatchObject({
            repositories: [{ id: 42, visibility: 'public' }],
            nextCursor: next,
        });
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            'https://api.github.com/user/installations/123/repositories?per_page=50',
        );
    });

    it.each([
        'https://evil.example/user/installations/123/repositories?per_page=50&page=2',
        'https://api.github.com/user/installations/456/repositories?per_page=50&page=2',
        'https://api.github.com/user/installations/123/repositories?per_page=50&page=2&token=secret',
        'https://api.github.com/user/installations/123/repositories?per_page=50&page=2&page=3',
    ])('rejects an unsafe repository continuation link', async (next) => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json(
                    { repositories: [] },
                    { headers: { Link: `<${next}>; rel="next"` } },
                ),
            ),
        );
        const client = new GitHubApiClient();

        await expect(
            client.getInstallationRepositories(
                'access-token',
                '123',
                null,
                new AbortController().signal,
            ),
        ).rejects.toThrow('Invalid GitHub repository page URL');
    });

    it('rejects malformed and oversized repository entries', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json({
                    repositories: [
                        {
                            id: 42,
                            owner: { login: 'GodotLauncher' },
                            name: 'Launcher',
                            full_name: 'Other/Launcher',
                            visibility: 'public',
                            clone_url:
                                'https://github.com/GodotLauncher/Launcher.git',
                            disabled: false,
                            archived: false,
                            permissions: { pull: true },
                        },
                    ],
                }),
            ),
        );
        const client = new GitHubApiClient();

        await expect(
            client.getInstallationRepositories(
                'access-token',
                '123',
                null,
                new AbortController().signal,
            ),
        ).rejects.toThrow();
    });
});
