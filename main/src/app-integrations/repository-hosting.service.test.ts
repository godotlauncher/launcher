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
});

/** Creates a repository service with callback-scoped fake credentials. */
function createService(
    routes: AppIntegrationCredentialRoute[],
    capability: { listRepositories: ReturnType<typeof vi.fn> },
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
