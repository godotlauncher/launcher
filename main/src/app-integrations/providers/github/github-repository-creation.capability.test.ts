import { describe, expect, it, vi } from 'vitest';
import { GitHubApiError } from './github-api.client.js';
import { GitHubRepositoryCreationCapability } from './github-repository-creation.capability.js';

const request = {
    credential: JSON.stringify({
        version: 1,
        createdAt: '2026-08-30T12:00:00.000Z',
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
        login: 'godotlauncher',
        type: 'organization' as const,
        manageUrl:
            'https://github.com/organizations/godotlauncher/settings/installations/123',
        availability: 'available' as const,
        capabilities: [
            'repository-browsing' as const,
            'repository-creation' as const,
        ],
    },
    repositoryName: 'my-game',
    signal: new AbortController().signal,
};

describe('GitHubRepositoryCreationCapability', () => {
    it('returns a validated exact repository for ambiguous creation recovery', async () => {
        const github = {
            recoverPrivateRepository: vi.fn(async () => ({
                id: 42,
                owner: { login: 'godotlauncher' },
                name: 'my-game',
                full_name: 'godotlauncher/my-game',
                private: true as const,
                clone_url: 'https://github.com/godotlauncher/my-game.git',
                html_url: 'https://github.com/godotlauncher/my-game',
            })),
        };
        const capability = new GitHubRepositoryCreationCapability(
            github as never,
        );

        await expect(
            capability.recoverRepositoryCreation(request),
        ).resolves.toEqual({
            status: 'present',
            repository: {
                id: '42',
                owner: 'godotlauncher',
                name: 'my-game',
                cloneUrl: 'https://github.com/godotlauncher/my-game.git',
                webUrl: 'https://github.com/godotlauncher/my-game',
            },
        });
        expect(github.recoverPrivateRepository).toHaveBeenCalledWith(
            'secret-token',
            'godotlauncher',
            'my-game',
            request.signal,
        );
    });

    it('reports an absent repository without creating it', async () => {
        const capability = new GitHubRepositoryCreationCapability({
            recoverPrivateRepository: vi.fn(async () => null),
        } as never);

        await expect(
            capability.recoverRepositoryCreation(request),
        ).resolves.toEqual({ status: 'absent' });
    });

    it.each([
        [new GitHubApiError(null), 'network-unavailable'],
        [new GitHubApiError(401), 'permission-update-required'],
        [new GitHubApiError(403, true), 'rate-limited'],
    ] as const)(
        'maps recovery lookup failures safely',
        async (error, reason) => {
            const capability = new GitHubRepositoryCreationCapability({
                recoverPrivateRepository: vi.fn(async () => {
                    throw error;
                }),
            } as never);

            await expect(
                capability.recoverRepositoryCreation(request),
            ).rejects.toMatchObject({ reason });
        },
    );
});
