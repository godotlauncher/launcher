import type { ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('electron-log', () => ({ default: logger }));

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
const repository = {
    id: '42',
    owner: 'godotlauncher',
    name: 'my-game',
    cloneUrl: 'https://github.com/godotlauncher/my-game.git',
    webUrl: 'https://github.com/godotlauncher/my-game',
};

describe('ProjectPublicationService', () => {
    beforeEach(() => vi.clearAllMocks());

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

    it('reuses a confirmed attempt and removes it after publication', async () => {
        const repositories = {
            listRepositoryCreationTargets: vi.fn(async () => ({
                ok: true as const,
                targets: [target],
            })),
            withRepositoryCreationAccess: vi.fn(
                async (_providerId, _selection, operation) => ({
                    ok: true as const,
                    value: await operation({
                        repository,
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

        const failed = await service.publish(project, options, true);
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
                status: 'failed',
                attemptId: failed.attemptId,
            },
        });
        await expect(service.retry(failed.attemptId)).resolves.toMatchObject({
            publication: {
                status: 'published',
                repository: { owner: 'godotlauncher', name: 'my-game' },
            },
        });
        expect(
            repositories.withRepositoryCreationAccess,
        ).toHaveBeenCalledOnce();
        expect(repositories.withRepositoryPushAccess).toHaveBeenCalledTimes(2);
        expect(gitPush.pushMain).toHaveBeenCalledTimes(3);
        expect(gitPush.pushMain).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                requiresGitLfsUpload: true,
                requiresEmptyRemote: false,
            }),
        );
        expect(gitPush.pushMain).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                requiresGitLfsUpload: true,
                requiresEmptyRemote: false,
            }),
        );
        expect(gitPush.pushMain).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                requiresGitLfsUpload: true,
                requiresEmptyRemote: false,
            }),
        );
        await expect(service.retry(failed.attemptId)).resolves.toBeNull();
    });

    it('discards only the selected failed attempt', async () => {
        const service = new ProjectPublicationService({} as never, {} as never);
        const invalidOptions = { ...options, repositoryName: 'invalid/name' };
        const first = await service.publish(project, invalidOptions, false);
        const second = await service.publish(
            { ...project, path: '/projects/other-game' },
            invalidOptions,
            false,
        );
        if (first.status !== 'failed' || second.status !== 'failed') {
            throw new Error('Expected failed attempts');
        }

        service.discard(first.attemptId);

        await expect(service.retry(first.attemptId)).resolves.toBeNull();
        await expect(service.retry(second.attemptId)).resolves.toMatchObject({
            publication: {
                status: 'failed',
                attemptId: second.attemptId,
            },
        });
    });

    it('clears every failed attempt during shutdown', async () => {
        const service = new ProjectPublicationService({} as never, {} as never);
        const invalidOptions = { ...options, repositoryName: 'invalid/name' };
        const first = await service.publish(project, invalidOptions, false);
        const second = await service.publish(
            { ...project, path: '/projects/other-game' },
            invalidOptions,
            false,
        );
        if (first.status !== 'failed' || second.status !== 'failed') {
            throw new Error('Expected failed attempts');
        }

        service.onModuleDestroy();

        await expect(service.retry(first.attemptId)).resolves.toBeNull();
        await expect(service.retry(second.attemptId)).resolves.toBeNull();
    });

    it('checks an uncertain creation and retries one create after confirmed absence', async () => {
        const withRepositoryCreationAccess = vi
            .fn()
            .mockResolvedValueOnce({
                ok: false as const,
                reason: 'remote-creation-uncertain' as const,
            })
            .mockImplementationOnce(
                async (_providerId, _selection, operation) => ({
                    ok: true as const,
                    value: await operation({
                        repository,
                        gitCredential: {
                            username: 'x-access-token',
                            password: 'secret',
                        },
                    }),
                }),
            );
        const repositories = {
            listRepositoryCreationTargets: vi.fn(async () => ({
                ok: true as const,
                targets: [target],
            })),
            withRepositoryCreationAccess,
            recoverRepositoryCreation: vi.fn(async () => ({
                ok: true as const,
                recovery: { status: 'absent' as const },
            })),
        };
        const gitPush = {
            pushMain: vi.fn(async () => ({
                ok: true as const,
                canonicalUrl: repository.cloneUrl,
            })),
        };
        const service = new ProjectPublicationService(
            repositories as never,
            gitPush as never,
        );

        const failed = await service.publish(project, options, false);
        expect(failed).toMatchObject({
            status: 'failed',
            reason: 'remote-creation-uncertain',
            recoveryAction: 'check-and-retry',
            canRetry: true,
            canEdit: false,
        });
        if (failed.status !== 'failed') throw new Error('Expected failure');

        await expect(
            service.retry(failed.attemptId, undefined, 'check-and-retry'),
        ).resolves.toMatchObject({
            publication: {
                status: 'published',
            },
        });
        expect(withRepositoryCreationAccess).toHaveBeenCalledTimes(2);
        expect(gitPush.pushMain).toHaveBeenCalledWith(
            expect.objectContaining({ requiresEmptyRemote: false }),
        );
    });

    it('requires confirmation before publishing to a recovered empty repository', async () => {
        const recoverRepositoryCreation = vi.fn(async () => ({
            ok: true as const,
            recovery: { status: 'present' as const, repository },
        }));
        const repositories = {
            listRepositoryCreationTargets: vi.fn(async () => ({
                ok: true as const,
                targets: [target],
            })),
            withRepositoryCreationAccess: vi.fn(async () => ({
                ok: false as const,
                reason: 'remote-creation-uncertain' as const,
            })),
            recoverRepositoryCreation,
            withRepositoryPushAccess: vi.fn(
                async (_providerId, _selection, operation) => ({
                    ok: true as const,
                    value: await operation({
                        credential: {
                            username: 'x-access-token',
                            password: 'secret',
                        },
                    }),
                }),
            ),
        };
        const gitPush = {
            checkRemoteEmpty: vi.fn(async () => ({
                ok: true as const,
                empty: true,
            })),
            pushMain: vi.fn(async () => ({
                ok: true as const,
                canonicalUrl: repository.cloneUrl,
            })),
        };
        const service = new ProjectPublicationService(
            repositories as never,
            gitPush as never,
        );
        const failed = await service.publish(project, options, true);
        if (failed.status !== 'failed') throw new Error('Expected failure');

        const checked = await service.retry(
            failed.attemptId,
            undefined,
            'check-and-retry',
        );
        expect(checked?.publication).toMatchObject({
            status: 'failed',
            reason: 'remote-creation-uncertain',
            recoveryAction: 'confirm-recovered-repository',
            repository: { owner: 'godotlauncher', name: 'my-game' },
            canEdit: false,
        });
        expect(gitPush.pushMain).not.toHaveBeenCalled();

        await expect(
            service.retry(
                failed.attemptId,
                undefined,
                'confirm-recovered-repository',
            ),
        ).resolves.toMatchObject({
            publication: { status: 'published' },
        });
        expect(recoverRepositoryCreation).toHaveBeenCalledTimes(2);
        expect(gitPush.pushMain).toHaveBeenCalledWith(
            expect.objectContaining({
                requiresEmptyRemote: true,
                requiresGitLfsUpload: true,
            }),
        );
    });

    it('does not create or push when uncertain recovery remains inconclusive', async () => {
        const repositories = {
            listRepositoryCreationTargets: vi.fn(async () => ({
                ok: true as const,
                targets: [target],
            })),
            withRepositoryCreationAccess: vi.fn(async () => ({
                ok: false as const,
                reason: 'remote-creation-uncertain' as const,
            })),
            recoverRepositoryCreation: vi.fn(async () => ({
                ok: false as const,
                reason: 'network-unavailable' as const,
            })),
        };
        const gitPush = {
            checkRemoteEmpty: vi.fn(),
            pushMain: vi.fn(),
        };
        const service = new ProjectPublicationService(
            repositories as never,
            gitPush as never,
        );
        const failed = await service.publish(project, options, false);
        if (failed.status !== 'failed') throw new Error('Expected failure');

        await expect(
            service.retry(failed.attemptId, undefined, 'check-and-retry'),
        ).resolves.toMatchObject({
            publication: {
                status: 'failed',
                reason: 'remote-creation-uncertain',
                recoveryAction: 'check-and-retry',
            },
        });
        expect(
            repositories.withRepositoryCreationAccess,
        ).toHaveBeenCalledOnce();
        expect(gitPush.checkRemoteEmpty).not.toHaveBeenCalled();
        expect(gitPush.pushMain).not.toHaveBeenCalled();
        const logs = JSON.stringify(logger.info.mock.calls);
        expect(logs).not.toContain(project.path);
        expect(logs).not.toContain(options.repositoryName);
        expect(logs).not.toContain('secret');
    });

    it('refuses a recovered repository that contains refs', async () => {
        const repositories = {
            listRepositoryCreationTargets: vi.fn(async () => ({
                ok: true as const,
                targets: [target],
            })),
            withRepositoryCreationAccess: vi.fn(async () => ({
                ok: false as const,
                reason: 'remote-creation-uncertain' as const,
            })),
            recoverRepositoryCreation: vi.fn(async () => ({
                ok: true as const,
                recovery: { status: 'present' as const, repository },
            })),
            withRepositoryPushAccess: vi.fn(
                async (_providerId, _selection, operation) => ({
                    ok: true as const,
                    value: await operation({
                        credential: {
                            username: 'x-access-token',
                            password: 'secret',
                        },
                    }),
                }),
            ),
        };
        const gitPush = {
            checkRemoteEmpty: vi.fn(async () => ({
                ok: true as const,
                empty: false,
            })),
            pushMain: vi.fn(),
        };
        const service = new ProjectPublicationService(
            repositories as never,
            gitPush as never,
        );
        const failed = await service.publish(project, options, false);
        if (failed.status !== 'failed') throw new Error('Expected failure');

        await expect(
            service.retry(failed.attemptId, undefined, 'check-and-retry'),
        ).resolves.toMatchObject({
            publication: {
                status: 'failed',
                reason: 'recovered-repository-not-empty',
                canRetry: false,
            },
        });
        expect(gitPush.pushMain).not.toHaveBeenCalled();
    });
});
