import type { ProjectDetails } from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ProjectPublicationService } from './project-publication.service.js';

const target = {
    providerId: 'github',
    connectionId: '5c2d1cf0-d9a2-4db5-a095-23764076bc7e',
    accessTargetId: 'f82aa4ee-0570-4fc5-97bf-00bb6253ff23',
    ownerLogin: 'godotlauncher',
    ownerType: 'organization' as const,
    accountLogin: 'octocat',
};

const options = {
    providerId: 'github',
    connectionId: target.connectionId,
    accessTargetId: target.accessTargetId,
    repositoryName: 'my-game',
};

const project = { path: '/projects/my-game' } as ProjectDetails;

describe('ProjectPublicationService', () => {
    it('returns a cautious repository-name availability result', async () => {
        const repositories = {
            checkRepositoryNameAvailability: vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true as const,
                    availability: 'unavailable' as const,
                })
                .mockResolvedValueOnce({
                    ok: false as const,
                    reason: 'network-unavailable' as const,
                }),
        };
        const service = new ProjectPublicationService(
            repositories as never,
            { pushMain: vi.fn() } as never,
        );

        await expect(
            service.checkRepositoryNameAvailability(options),
        ).resolves.toEqual({ status: 'unavailable' });
        await expect(
            service.checkRepositoryNameAvailability(options),
        ).resolves.toEqual({
            status: 'unknown',
            reason: 'network-unavailable',
        });
    });

    it('retries a confirmed repository without creating it twice', async () => {
        const repositories = {
            listRepositoryCreationTargets: vi.fn(async () => ({
                ok: true as const,
                targets: [target],
            })),
            withRepositoryCreationAccess: vi.fn(
                async (_providerId, _selection, operation) => ({
                    ok: true as const,
                    value: await operation({
                        repository: {
                            id: '42',
                            owner: 'godotlauncher',
                            name: 'my-game',
                            cloneUrl:
                                'https://github.com/godotlauncher/my-game.git',
                            webUrl: 'https://github.com/godotlauncher/my-game',
                        },
                        gitCredential: {
                            username: 'x-access-token',
                            password: 'secret',
                        },
                    }),
                }),
            ),
            withRepositoryPushAccess: vi.fn(
                async (_providerId, _selection, operation) => ({
                    ok: true as const,
                    value: await operation({
                        credential: {
                            username: 'x-access-token',
                            password: 'fresh-secret',
                        },
                    }),
                }),
            ),
        };
        const gitPush = {
            pushMain: vi
                .fn()
                .mockResolvedValueOnce({ ok: false, reason: 'push-failed' })
                .mockResolvedValueOnce({
                    ok: true,
                    canonicalUrl:
                        'https://github.com/godotlauncher/my-game.git',
                }),
        };
        const service = new ProjectPublicationService(
            repositories as never,
            gitPush as never,
        );

        const failed = await service.publish(project, options);
        expect(failed).toMatchObject({
            status: 'failed',
            reason: 'remote-created-push-failed',
            canRetry: true,
            canEdit: false,
            repository: { owner: 'godotlauncher', name: 'my-game' },
        });
        if (failed.status !== 'failed') throw new Error('Expected failure');

        await expect(service.retry(failed.attemptId)).resolves.toMatchObject({
            publication: {
                status: 'published',
                repository: { owner: 'godotlauncher', name: 'my-game' },
            },
        });
        expect(
            repositories.withRepositoryCreationAccess,
        ).toHaveBeenCalledOnce();
        expect(repositories.withRepositoryPushAccess).toHaveBeenCalledOnce();
        expect(gitPush.pushMain).toHaveBeenCalledTimes(2);
    });

    it('does not retry an uncertain remote creation', async () => {
        const repositories = {
            listRepositoryCreationTargets: vi.fn(async () => ({
                ok: true as const,
                targets: [target],
            })),
            withRepositoryCreationAccess: vi.fn(async () => ({
                ok: false as const,
                reason: 'remote-creation-uncertain' as const,
            })),
        };
        const service = new ProjectPublicationService(
            repositories as never,
            { pushMain: vi.fn() } as never,
        );

        const failed = await service.publish(project, options);
        expect(failed).toMatchObject({
            status: 'failed',
            reason: 'remote-creation-uncertain',
            canRetry: false,
        });
        if (failed.status !== 'failed') throw new Error('Expected failure');

        await expect(service.retry(failed.attemptId)).resolves.toMatchObject({
            publication: {
                status: 'failed',
                reason: 'remote-creation-uncertain',
                canRetry: false,
            },
        });
        expect(
            repositories.withRepositoryCreationAccess,
        ).toHaveBeenCalledOnce();
    });
});
