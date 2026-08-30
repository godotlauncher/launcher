import { describe, expect, it, vi } from 'vitest';
import type { AppIntegrationCredentialRoute } from './app-integration-capability.types.js';
import { RepositoryHostingService } from './repository-hosting.service.js';

const route = (suffix: string): AppIntegrationCredentialRoute => ({
    connectionId: `connection-${suffix}`,
    credential: `secret-${suffix}`,
    accessTarget: {
        id: `target-${suffix}`,
        providerTargetId: `installation-${suffix}`,
        login: suffix,
        type: 'user',
        manageUrl: `https://example.com/${suffix}`,
        availability: 'available',
    },
});

describe('RepositoryHostingService', () => {
    it('limits pages and returns idempotent opaque cursor retries', async () => {
        const capability = {
            listRepositories: vi
                .fn()
                .mockResolvedValueOnce({
                    repositories: Array.from({ length: 50 }, (_, index) => ({
                        id: String(index + 1),
                        owner: 'owner',
                        name: `repository-${index + 1}`,
                        visibility: 'private',
                        cloneUrl: `https://example.com/owner/repository-${index + 1}.git`,
                    })),
                    nextCursor: 'provider-page-2',
                })
                .mockResolvedValueOnce({
                    repositories: [
                        {
                            id: '51',
                            owner: 'owner',
                            name: 'repository-51',
                            visibility: 'private',
                            cloneUrl:
                                'https://example.com/owner/repository-51.git',
                        },
                    ],
                    nextCursor: null,
                }),
        };
        const service = createService([route('one')], capability);

        const first = await service.listRepositories('github');
        expect(first).toMatchObject({
            ok: true,
            page: { repositories: { length: 50 } },
        });
        if (!first.ok || !first.page.nextCursor) {
            throw new Error('Expected a continuation cursor');
        }
        const second = await service.listRepositories(
            'github',
            first.page.nextCursor,
        );
        const retry = await service.listRepositories(
            'github',
            first.page.nextCursor,
        );

        expect(second).toEqual(retry);
        expect(capability.listRepositories).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(first)).not.toContain('secret-one');
        expect(JSON.stringify(first)).not.toContain('installation-one');
    });

    it('deduplicates repositories while retaining healthy alternative routes', async () => {
        const capability = {
            listRepositories: vi.fn(async () => ({
                repositories: [
                    {
                        id: '42',
                        owner: 'owner',
                        name: 'repository',
                        visibility: 'public',
                        cloneUrl: 'https://example.com/owner/repository.git',
                    },
                ],
                nextCursor: null,
            })),
        };
        const service = createService([route('one'), route('two')], capability);

        const result = await service.listRepositories('github');

        expect(result).toMatchObject({
            ok: true,
            page: { repositories: [{ id: '42' }] },
        });
        expect(capability.listRepositories).toHaveBeenCalledTimes(2);
    });

    it('expires a session when a connected target drifts', async () => {
        const routes = [route('one')];
        const capability = {
            listRepositories: vi.fn(async () => ({
                repositories: [],
                nextCursor: 'provider-next',
            })),
        };
        const service = createService(routes, capability);
        const first = await service.listRepositories('github');
        if (!first.ok || !first.page.nextCursor) {
            throw new Error('Expected a continuation cursor');
        }
        routes.length = 0;

        await expect(
            service.listRepositories('github', first.page.nextCursor),
        ).resolves.toEqual({ ok: false, reason: 'session-expired' });
    });

    it('revalidates an opaque selection inside the credential lease', async () => {
        const selectedRoute = route('one');
        const repository = {
            id: '42',
            owner: 'owner',
            name: 'repository',
            visibility: 'private' as const,
            cloneUrl: 'https://example.com/owner/repository.git',
        };
        const capability = {
            listRepositories: vi.fn(async () => ({
                repositories: [repository],
                nextCursor: null,
            })),
            resolveRepository: vi.fn(async () => ({
                repository,
                gitCredential: {
                    username: 'x-access-token',
                    password: selectedRoute.credential,
                },
            })),
        };
        const service = createService([selectedRoute], capability);
        const listed = await service.listRepositories('github');
        if (!listed.ok) {
            throw new Error('Expected a repository page');
        }
        const repositoryRef = listed.page.repositories[0]?.repositoryRef;
        if (!repositoryRef) {
            throw new Error('Expected an opaque repository reference');
        }
        const operation = vi.fn(async (access) => access.canonicalUrl);

        const result = await service.withRepositoryCloneAccess(
            'github',
            repositoryRef,
            operation,
        );

        expect(result).toEqual({
            ok: true,
            value: repository.cloneUrl,
        });
        expect(capability.resolveRepository).toHaveBeenCalledWith(
            expect.objectContaining({
                credential: selectedRoute.credential,
                accessTarget: selectedRoute.accessTarget,
                repository: expect.objectContaining({ id: repository.id }),
            }),
        );
        expect(operation).toHaveBeenCalledWith({
            canonicalUrl: repository.cloneUrl,
            credential: {
                username: 'x-access-token',
                password: selectedRoute.credential,
            },
        });
        expect(JSON.stringify(result)).not.toContain(selectedRoute.credential);
    });

    it('rejects an opaque reference after its repository route drifts', async () => {
        const routes = [route('one')];
        const repository = {
            id: '42',
            owner: 'owner',
            name: 'repository',
            visibility: 'private' as const,
            cloneUrl: 'https://example.com/owner/repository.git',
        };
        const capability = {
            listRepositories: vi.fn(async () => ({
                repositories: [repository],
                nextCursor: null,
            })),
            resolveRepository: vi.fn(),
        };
        const service = createService(routes, capability);
        const listed = await service.listRepositories('github');
        if (!listed.ok) {
            throw new Error('Expected a repository page');
        }
        const repositoryRef = listed.page.repositories[0]?.repositoryRef;
        if (!repositoryRef) {
            throw new Error('Expected an opaque repository reference');
        }
        routes[0] = route('two');

        await expect(
            service.withRepositoryCloneAccess('github', repositoryRef, vi.fn()),
        ).resolves.toEqual({ ok: false, reason: 'session-expired' });
        expect(capability.resolveRepository).not.toHaveBeenCalled();
    });

    it('checks repository availability inside the exact credential lease', async () => {
        const selectedRoute = route('one');
        selectedRoute.connectionId = '5c2d1cf0-d9a2-4db5-a095-23764076bc7e';
        selectedRoute.accessTarget.id = 'f82aa4ee-0570-4fc5-97bf-00bb6253ff23';
        const checkRepositoryNameAvailability = vi.fn(async () => 'available');
        const service = new RepositoryHostingService(
            {
                get: vi.fn(() => ({ checkRepositoryNameAvailability })),
            } as never,
            {
                withCredentialLease: vi.fn(async (_providerId, operation) => ({
                    ok: true,
                    value: await operation([selectedRoute]),
                })),
            } as never,
        );

        await expect(
            service.checkRepositoryNameAvailability('github', {
                connectionId: selectedRoute.connectionId,
                accessTargetId: selectedRoute.accessTarget.id,
                repositoryName: 'my-game',
            }),
        ).resolves.toEqual({ ok: true, availability: 'available' });
        expect(checkRepositoryNameAvailability).toHaveBeenCalledWith(
            expect.objectContaining({
                credential: selectedRoute.credential,
                accessTarget: selectedRoute.accessTarget,
                repositoryName: 'my-game',
            }),
        );
    });

    it('recovers an exact repository inside the selected credential lease', async () => {
        const selectedRoute = route('one');
        selectedRoute.connectionId = '5c2d1cf0-d9a2-4db5-a095-23764076bc7e';
        selectedRoute.accessTarget.id = 'f82aa4ee-0570-4fc5-97bf-00bb6253ff23';
        selectedRoute.accessTarget.capabilities = ['repository-creation'];
        const recoverRepositoryCreation = vi.fn(async () => ({
            status: 'present' as const,
            repository: {
                id: '42',
                owner: 'one',
                name: 'my-game',
                cloneUrl: 'https://github.com/one/my-game.git',
                webUrl: 'https://github.com/one/my-game',
            },
        }));
        const service = new RepositoryHostingService(
            { get: vi.fn(() => ({ recoverRepositoryCreation })) } as never,
            {
                withCredentialLease: vi.fn(async (_providerId, operation) => ({
                    ok: true,
                    value: await operation([selectedRoute]),
                })),
            } as never,
        );

        await expect(
            service.recoverRepositoryCreation('github', {
                connectionId: selectedRoute.connectionId,
                accessTargetId: selectedRoute.accessTarget.id,
                repositoryName: 'my-game',
            }),
        ).resolves.toMatchObject({
            ok: true,
            recovery: {
                status: 'present',
                repository: { id: '42', name: 'my-game' },
            },
        });
        expect(recoverRepositoryCreation).toHaveBeenCalledWith(
            expect.objectContaining({
                credential: selectedRoute.credential,
                accessTarget: selectedRoute.accessTarget,
                repositoryName: 'my-game',
            }),
        );
    });
});

/** Creates a repository service with callback-scoped fake credentials. */
function createService(
    routes: AppIntegrationCredentialRoute[],
    capability: {
        listRepositories: ReturnType<typeof vi.fn>;
        resolveRepository?: ReturnType<typeof vi.fn>;
    },
): RepositoryHostingService {
    return new RepositoryHostingService(
        { get: vi.fn(() => capability) } as never,
        {
            withCredentialLease: vi.fn(async (_providerId, operation) => ({
                ok: true,
                value: await operation(routes),
            })),
        } as never,
    );
}
