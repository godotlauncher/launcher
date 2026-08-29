import { describe, expect, it, vi } from 'vitest';
import { GitHubApiError } from './github-api.client.js';
import { GitHubRepositoryBrowsingCapability } from './github-repository-browsing.capability.js';

const request = {
    credential: JSON.stringify({
        version: 1,
        createdAt: '2026-08-22T12:00:00.000Z',
        accessToken: 'secret-token',
        expiresIn: 28_800,
        refreshToken: 'refresh-token',
        refreshTokenExpiresIn: 15_768_000,
        scope: '',
        tokenType: 'bearer',
    }),
    accessTarget: {
        id: 'local-target',
        providerTargetId: '123',
        login: 'owner',
        type: 'user' as const,
        manageUrl: 'https://github.com/settings/installations/123',
        availability: 'available' as const,
    },
    cursor: null,
    signal: new AbortController().signal,
};

describe('GitHubRepositoryBrowsingCapability', () => {
    it('omits archived, disabled, and non-pullable repositories', async () => {
        const base = {
            id: 1,
            owner: { login: 'owner' },
            name: 'repository',
            full_name: 'owner/repository',
            visibility: 'private' as const,
            clone_url: 'https://github.com/owner/repository.git',
            disabled: false,
            archived: false,
            permissions: { pull: true },
        };
        const github = {
            getInstallationRepositories: vi.fn(async () => ({
                repositories: [
                    base,
                    { ...base, id: 2, disabled: true },
                    { ...base, id: 3, archived: true },
                    { ...base, id: 4, permissions: { pull: false } },
                ],
                nextCursor: null,
            })),
        };
        const capability = new GitHubRepositoryBrowsingCapability(
            github as never,
        );

        await expect(capability.listRepositories(request)).resolves.toEqual({
            repositories: [
                {
                    id: '1',
                    owner: 'owner',
                    name: 'repository',
                    visibility: 'private',
                    cloneUrl: 'https://github.com/owner/repository.git',
                },
            ],
            nextCursor: null,
        });
        expect(github.getInstallationRepositories).toHaveBeenCalledWith(
            'secret-token',
            '123',
            null,
            request.signal,
        );
    });

    it('returns a provider-formatted credential only from exact revalidation', async () => {
        const repository = {
            id: 42,
            owner: { login: 'owner' },
            name: 'repository',
            full_name: 'owner/repository',
            visibility: 'private' as const,
            clone_url: 'https://github.com/owner/repository.git',
            disabled: false,
            archived: false,
            permissions: { pull: true },
        };
        const github = { getRepository: vi.fn(async () => repository) };
        const capability = new GitHubRepositoryBrowsingCapability(
            github as never,
        );

        await expect(
            capability.resolveRepository({
                ...request,
                repository: {
                    id: '42',
                    owner: 'owner',
                    name: 'repository',
                    visibility: 'private',
                    cloneUrl: 'https://github.com/owner/repository.git',
                },
            }),
        ).resolves.toEqual({
            repository: {
                id: '42',
                owner: 'owner',
                name: 'repository',
                visibility: 'private',
                cloneUrl: 'https://github.com/owner/repository.git',
            },
            gitCredential: {
                username: 'x-access-token',
                password: 'secret-token',
            },
        });
        expect(github.getRepository).toHaveBeenCalledWith(
            'secret-token',
            'owner',
            'repository',
            '42',
            request.signal,
        );
    });

    it('rejects an invalid stored credential before calling GitHub', async () => {
        const github = { getInstallationRepositories: vi.fn() };
        const capability = new GitHubRepositoryBrowsingCapability(
            github as never,
        );

        await expect(
            capability.listRepositories({
                ...request,
                credential: 'secret-token',
            }),
        ).rejects.toMatchObject({ reason: 'reauthorisation-required' });
        expect(github.getInstallationRepositories).not.toHaveBeenCalled();
    });

    it.each([
        [new GitHubApiError(401), 'reauthorisation-required'],
        [new GitHubApiError(403), 'reauthorisation-required'],
        [new GitHubApiError(403, true), 'rate-limited'],
        [new GitHubApiError(404), 'repository-unavailable'],
        [new GitHubApiError(500), 'provider-unavailable'],
        [new GitHubApiError(null), 'provider-unavailable'],
    ] as const)('maps GitHub API failures safely', async (error, reason) => {
        const github = {
            getInstallationRepositories: vi.fn(async () => {
                throw error;
            }),
        };
        const capability = new GitHubRepositoryBrowsingCapability(
            github as never,
        );

        await expect(
            capability.listRepositories(request),
        ).rejects.toMatchObject({ reason });
    });
});
