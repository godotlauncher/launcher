import { describe, expect, it, vi } from 'vitest';
import { ProjectRemoteSourceService } from './project-remote-source.service.js';

describe('ProjectRemoteSourceService', () => {
    it('removes approved addresses from the public bridge result', async () => {
        const service = new ProjectRemoteSourceService(
            {
                inspect: vi.fn(async () => ({
                    ok: true,
                    source: {
                        canonicalUrl: 'https://example.com/team/game.git',
                        suggestedDirectoryName: 'game',
                        approvedAddresses: ['93.184.216.34'],
                    },
                })),
            } as never,
            {} as never,
            {} as never,
        );

        const result = await service.inspectPublicGitSource(
            'https://example.com/team/game.git',
        );

        expect(result).toEqual({
            ok: true,
            canonicalUrl: 'https://example.com/team/game.git',
            suggestedDirectoryName: 'game',
        });
        expect(JSON.stringify(result)).not.toContain('93.184.216.34');
    });

    it('marks canonical stored origins without mutating projects', async () => {
        const projectOrigins = {
            getOrigins: vi.fn(
                async () => new Set(['https://github.com/Owner/Game']),
            ),
        };
        const repositoryHosting = {
            listRepositories: vi.fn(async () => ({
                ok: true,
                page: {
                    sessionId: 'session-one',
                    repositories: [
                        {
                            repositoryRef: 'repository-ref',
                            id: '42',
                            owner: 'Owner',
                            name: 'Game',
                            visibility: 'private',
                            cloneUrl: 'https://github.com/Owner/Game.git',
                            routeKeys: new Set(['route']),
                        },
                    ],
                    nextCursor: null,
                },
            })),
        };
        const service = new ProjectRemoteSourceService(
            {} as never,
            repositoryHosting as never,
            projectOrigins as never,
        );

        const result = await service.listConnectedRepositories('github');

        expect(result).toEqual({
            ok: true,
            page: {
                repositories: [
                    {
                        repositoryRef: 'repository-ref',
                        providerId: 'github',
                        owner: 'Owner',
                        name: 'Game',
                        visibility: 'private',
                        alreadyImported: true,
                    },
                ],
                nextCursor: null,
            },
        });
        expect(projectOrigins.getOrigins).toHaveBeenCalledOnce();
        expect(repositoryHosting.listRepositories).toHaveBeenCalledWith(
            'github',
            undefined,
        );
    });

    it('starts stored-origin indexing concurrently with provider browsing', async () => {
        const origins = Promise.withResolvers<ReadonlySet<string>>();
        const repositories = Promise.withResolvers<{
            ok: true;
            page: {
                sessionId: string;
                repositories: [];
                nextCursor: null;
            };
        }>();
        const projectOrigins = {
            getOrigins: vi.fn(() => origins.promise),
        };
        const repositoryHosting = {
            listRepositories: vi.fn(() => repositories.promise),
        };
        const service = new ProjectRemoteSourceService(
            {} as never,
            repositoryHosting as never,
            projectOrigins as never,
        );

        const result = service.listConnectedRepositories('github');
        expect(projectOrigins.getOrigins).toHaveBeenCalledOnce();
        expect(repositoryHosting.listRepositories).toHaveBeenCalledOnce();

        repositories.resolve({
            ok: true,
            page: {
                sessionId: 'session-one',
                repositories: [],
                nextCursor: null,
            },
        });
        origins.resolve(new Set());

        await expect(result).resolves.toEqual({
            ok: true,
            page: { repositories: [], nextCursor: null },
        });
    });

    it('does not fail provider browsing when the origin index is unavailable', async () => {
        const service = new ProjectRemoteSourceService(
            {} as never,
            {
                listRepositories: vi.fn(async () => ({
                    ok: true,
                    page: {
                        sessionId: 'session-one',
                        repositories: [],
                        nextCursor: null,
                    },
                })),
            } as never,
            {
                getOrigins: vi.fn(async () => {
                    throw new Error('unavailable');
                }),
            } as never,
        );

        await expect(
            service.listConnectedRepositories('github'),
        ).resolves.toEqual({
            ok: true,
            page: { repositories: [], nextCursor: null },
        });
    });
});
