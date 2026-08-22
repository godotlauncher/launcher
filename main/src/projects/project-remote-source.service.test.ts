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
        const projects = {
            list: vi.fn(async () => [
                { path: '/projects/game' },
                { path: '/projects/other' },
            ]),
        };
        const git = {
            getNormalizedRemoteOrigin: vi
                .fn()
                .mockResolvedValueOnce('https://github.com/Owner/Game')
                .mockResolvedValueOnce(null),
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
            git as never,
            projects as never,
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
        expect(projects.list).toHaveBeenCalledOnce();
        expect(git.getNormalizedRemoteOrigin).toHaveBeenCalledTimes(2);
        expect(repositoryHosting.listRepositories).toHaveBeenCalledWith(
            'github',
            undefined,
        );
    });
});
