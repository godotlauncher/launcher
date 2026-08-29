import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
}));
vi.mock('electron-log', () => ({ default: logger }));

import { ProjectRemoteImportService } from './project-remote-import.service.js';

describe('ProjectRemoteImportService', () => {
    let parentDirectory: string;
    const git = {
        exists: vi.fn(async () => true),
        inspectRepository: vi.fn(async () => ({
            status: 'not-a-repository' as const,
        })),

        setIdentity: vi.fn(async () => true),
    };
    const publicSources = {
        inspect: vi.fn(async (url: string) => ({
            ok: true as const,
            source: {
                canonicalUrl: url,
                suggestedDirectoryName: 'game',
                approvedAddresses: ['93.184.216.34'],
            },
        })),
    };
    const repositoryHosting = {
        withRepositoryCloneAccess: vi.fn(
            async (_providerId, _repositoryRef, operation) => ({
                ok: true as const,
                value: await operation({
                    canonicalUrl: 'https://github.com/owner/game.git',
                    credential: {
                        username: 'x-access-token',
                        password: 'secret-token',
                    },
                }),
            }),
        ),
    };
    const discovery = {
        discover: vi.fn(async (repositoryPath: string) => ({
            ok: true as const,
            projects: [
                {
                    name: 'Game',
                    relativePath: '.',
                    projectFilePath: path.join(repositoryPath, 'project.godot'),
                    detectedEditor: null,
                },
            ],
        })),
    };
    const progress = { publish: vi.fn() };
    const clone = { clone: vi.fn() };
    const submodules = {
        hasSubmodules: vi.fn(async () => false),
        initialise: vi.fn(),
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        submodules.hasSubmodules.mockResolvedValue(false);
        parentDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'remote-import-test-'),
        );
        clone.clone.mockImplementation(async (request) => {
            await fs.mkdir(request.destinationPath);
            await fs.writeFile(
                path.join(request.destinationPath, 'project.godot'),
                '[application]\nconfig/name="Game"\n',
            );
            request.onProgress(50);
            return { ok: true };
        });
    });

    afterEach(async () => {
        await fs.rm(parentDirectory, { recursive: true, force: true });
    });

    it('clones a public source into an atomic final destination', async () => {
        const service = createService();

        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });

        const canonicalParent = await fs.realpath(parentDirectory);
        expect(result).toMatchObject({
            ok: true,
            repositoryPath: path.join(canonicalParent, 'game'),
            projects: [
                {
                    name: 'Game',
                    relativePath: '.',
                    projectFilePath: path.join(
                        canonicalParent,
                        'game',
                        'project.godot',
                    ),
                    detectedEditor: null,
                },
            ],
        });
        expect(publicSources.inspect).toHaveBeenCalledWith(
            'https://example.com/team/game.git',
        );
        expect(clone.clone).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'public',
                canonicalUrl: 'https://example.com/team/game.git',
                approvedAddresses: ['93.184.216.34'],
            }),
        );
        await expect(
            fs.stat(path.join(parentDirectory, 'game', 'project.godot')),
        ).resolves.toBeDefined();
        expect(
            (await fs.readdir(parentDirectory)).filter((entry) =>
                entry.includes('.support-'),
            ),
        ).toEqual([]);
        expect(logger.info).toHaveBeenCalledWith(
            'Remote project import completed',
            expect.objectContaining({
                event: 'remote_project_import_completed',
                projectCount: 1,
                source: 'public-git-url',
            }),
        );
    });

    it('creates a missing destination parent recursively before cloning', async () => {
        const missingParent = path.join(
            parentDirectory,
            'new',
            'nested',
            'projects',
        );
        const service = createService();

        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory: missingParent,
            directoryName: 'game',
        });

        const canonicalParent = await fs.realpath(missingParent);
        expect(result).toMatchObject({
            ok: true,
            repositoryPath: path.join(canonicalParent, 'game'),
        });
        await expect(
            fs.stat(path.join(canonicalParent, 'game', 'project.godot')),
        ).resolves.toBeDefined();
    });

    it('rejects a missing destination parent beneath an existing file', async () => {
        const blockingFile = path.join(parentDirectory, 'not-a-directory');
        await fs.writeFile(blockingFile, 'blocked');
        const service = createService();

        await expect(
            service.importRemoteProject({
                source: 'public-git-url',
                url: 'https://example.com/team/game.git',
                parentDirectory: path.join(blockingFile, 'projects'),
                directoryName: 'game',
            }),
        ).resolves.toMatchObject({
            ok: false,
            reason: 'destination-invalid',
        });
        expect(clone.clone).not.toHaveBeenCalled();
    });

    it('uses the canonical target of a symlinked destination parent', async () => {
        const canonicalParent = path.join(parentDirectory, 'canonical-parent');
        const selectedParent = path.join(parentDirectory, 'selected-parent');
        await fs.mkdir(canonicalParent);
        await fs.symlink(
            canonicalParent,
            selectedParent,
            process.platform === 'win32' ? 'junction' : 'dir',
        );
        const service = createService();

        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory: selectedParent,
            directoryName: 'game',
        });

        expect(result).toMatchObject({
            ok: true,
            repositoryPath: path.join(
                await fs.realpath(canonicalParent),
                'game',
            ),
        });
        const cloneRequest = clone.clone.mock.calls[0]?.[0];
        expect(cloneRequest).toBeDefined();
        expect(path.dirname(cloneRequest?.destinationPath ?? '')).toBe(
            await fs.realpath(canonicalParent),
        );
    });

    it('revalidates connected selection inside the credential lease', async () => {
        const service = createService();

        const result = await service.importRemoteProject({
            source: 'connected-repository',
            providerId: 'github',
            repositoryRef: 'repository-ref',
            parentDirectory,
            directoryName: 'game',
        });

        expect(result.ok).toBe(true);
        expect(
            repositoryHosting.withRepositoryCloneAccess,
        ).toHaveBeenCalledWith(
            'github',
            'repository-ref',
            expect.any(Function),
        );
        expect(clone.clone).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'connected',
                canonicalUrl: 'https://github.com/owner/game.git',
                credential: {
                    username: 'x-access-token',
                    password: 'secret-token',
                },
            }),
        );
    });

    it('removes only attempt-owned paths after clone failure', async () => {
        clone.clone.mockImplementationOnce(async (request) => {
            await fs.mkdir(request.destinationPath);
            await fs.writeFile(
                path.join(request.destinationPath, 'partial'),
                'partial',
            );
            return { ok: false, reason: 'clone-failed' };
        });
        await fs.writeFile(path.join(parentDirectory, 'keep.txt'), 'keep');
        const service = createService();

        await expect(
            service.importRemoteProject({
                source: 'public-git-url',
                url: 'https://example.com/team/game.git',
                parentDirectory,
                directoryName: 'game',
            }),
        ).resolves.toMatchObject({ ok: false, reason: 'clone-failed' });

        expect(
            await fs.readFile(path.join(parentDirectory, 'keep.txt'), 'utf8'),
        ).toBe('keep');
        expect(await fs.readdir(parentDirectory)).toEqual(['keep.txt']);
        expect(logger.warn).toHaveBeenCalledWith(
            'Remote project import failed',
            expect.objectContaining({
                event: 'remote_project_import_failed',
                reason: 'clone-failed',
                source: 'public-git-url',
            }),
        );
    });

    it('preserves a destination created by another process during cloning', async () => {
        clone.clone.mockImplementationOnce(async (request) => {
            await fs.mkdir(request.destinationPath);
            await fs.writeFile(
                path.join(request.destinationPath, 'project.godot'),
                '[application]\nconfig/name="Game"\n',
            );
            const racedDestination = path.join(parentDirectory, 'game');
            await fs.mkdir(racedDestination);
            await fs.writeFile(
                path.join(racedDestination, 'other-process.txt'),
                'keep',
            );
            return { ok: true };
        });
        const service = createService();

        await expect(
            service.importRemoteProject({
                source: 'public-git-url',
                url: 'https://example.com/team/game.git',
                parentDirectory,
                directoryName: 'game',
            }),
        ).resolves.toMatchObject({
            ok: false,
            reason: 'destination-conflict',
        });
        await expect(
            fs.readFile(
                path.join(parentDirectory, 'game', 'other-process.txt'),
                'utf8',
            ),
        ).resolves.toBe('keep');
        expect(
            (await fs.readdir(parentDirectory)).filter((entry) =>
                entry.includes('.clone-'),
            ),
        ).toEqual([]);
    });

    it('cancels the active clone and cleans its temporary directory', async () => {
        clone.clone.mockImplementationOnce(
            async (request) =>
                new Promise((resolve) => {
                    void fs.mkdir(request.destinationPath).then(() => {
                        request.signal.addEventListener(
                            'abort',
                            () =>
                                resolve({
                                    ok: false,
                                    reason: 'cancelled',
                                }),
                            { once: true },
                        );
                    });
                }),
        );
        const service = createService();
        const importing = service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        await vi.waitFor(() =>
            expect(progress.publish).toHaveBeenCalledWith(
                expect.objectContaining({ stage: 'cloning' }),
            ),
        );
        const jobId = progress.publish.mock.calls.find(
            ([value]) => value.stage === 'cloning',
        )?.[0].jobId;

        await expect(service.cancelRemoteProjectImport(jobId)).resolves.toEqual(
            { jobId, status: 'cancelling' },
        );
        await expect(importing).resolves.toMatchObject({
            ok: false,
            reason: 'cancelled',
        });
        expect(await fs.readdir(parentDirectory)).toEqual([]);
    });

    it('aborts an active clone and cleans attempt-owned paths on shutdown', async () => {
        clone.clone.mockImplementationOnce(
            async (request) =>
                new Promise((resolve) => {
                    void fs.mkdir(request.destinationPath).then(() => {
                        request.signal.addEventListener(
                            'abort',
                            () =>
                                resolve({
                                    ok: false,
                                    reason: 'cancelled',
                                }),
                            { once: true },
                        );
                    });
                }),
        );
        const service = createService();
        const importing = service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        await vi.waitFor(() =>
            expect(progress.publish).toHaveBeenCalledWith(
                expect.objectContaining({ stage: 'cloning' }),
            ),
        );

        service.onModuleDestroy();

        await expect(importing).resolves.toMatchObject({
            ok: false,
            reason: 'cancelled',
        });
        expect(await fs.readdir(parentDirectory)).toEqual([]);
    });

    it('cancels discovery but preserves the completed clone', async () => {
        discovery.discover.mockImplementationOnce(
            async (_repositoryPath, signal: AbortSignal) =>
                new Promise((resolve) => {
                    signal.addEventListener(
                        'abort',
                        () => resolve({ ok: false, reason: 'cancelled' }),
                        { once: true },
                    );
                }),
        );
        const service = createService();
        const importing = service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        await vi.waitFor(() =>
            expect(progress.publish).toHaveBeenCalledWith(
                expect.objectContaining({ stage: 'discovering-projects' }),
            ),
        );
        const jobId = progress.publish.mock.calls.find(
            ([value]) => value.stage === 'discovering-projects',
        )?.[0].jobId;

        await expect(service.cancelRemoteProjectImport(jobId)).resolves.toEqual(
            { jobId, status: 'cancelling' },
        );
        await expect(importing).resolves.toMatchObject({
            ok: false,
            reason: 'cancelled',
            repositoryPath: path.join(
                await fs.realpath(parentDirectory),
                'game',
            ),
        });
        await expect(
            fs.stat(path.join(parentDirectory, 'game')),
        ).resolves.toBeDefined();
    });

    it('rejects case-equivalent destination conflicts before cloning', async () => {
        await fs.mkdir(path.join(parentDirectory, 'Game'));
        const service = createService();

        await expect(
            service.importRemoteProject({
                source: 'public-git-url',
                url: 'https://example.com/team/game.git',
                parentDirectory,
                directoryName: 'game',
            }),
        ).resolves.toMatchObject({
            ok: false,
            reason: 'destination-conflict',
        });
        expect(clone.clone).not.toHaveBeenCalled();
    });

    it('clones an independent repository inside an existing work tree', async () => {
        git.inspectRepository.mockResolvedValueOnce({
            status: 'inside-work-tree',
            root: parentDirectory,
            isProjectRoot: false,
            kind: 'standard',
        });
        const service = createService();

        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });

        expect(result).toMatchObject({
            ok: true,
            repositoryPath: path.join(
                await fs.realpath(parentDirectory),
                'game',
            ),
        });
        expect(clone.clone).toHaveBeenCalledOnce();
    });

    it('fails closed when destination repository scope cannot be inspected', async () => {
        git.inspectRepository.mockResolvedValueOnce({
            status: 'inspection-failed',
        });
        const service = createService();

        await expect(
            service.importRemoteProject({
                source: 'public-git-url',
                url: 'https://example.com/team/game.git',
                parentDirectory,
                directoryName: 'game',
            }),
        ).resolves.toMatchObject({
            ok: false,
            reason: 'destination-invalid',
        });
        expect(clone.clone).not.toHaveBeenCalled();
    });

    it('preserves a cloned repository when no projects are discovered', async () => {
        clone.clone.mockImplementationOnce(async (request) => {
            await fs.mkdir(request.destinationPath);
            return { ok: true };
        });
        discovery.discover.mockResolvedValueOnce({ ok: true, projects: [] });
        const service = createService();

        await expect(
            service.importRemoteProject({
                source: 'public-git-url',
                url: 'https://example.com/team/not-godot.git',
                parentDirectory,
                directoryName: 'not-godot',
            }),
        ).resolves.toMatchObject({ ok: true, projects: [] });
        expect(await fs.readdir(parentDirectory)).toEqual(['not-godot']);
    });

    it('initialises retained submodules and returns a fresh project scan', async () => {
        submodules.hasSubmodules.mockResolvedValueOnce(true);
        const service = createService();
        const imported = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(imported).toMatchObject({ ok: true, hasSubmodules: true });
        if (!imported.ok) throw new Error('Expected a successful import');
        const nestedProject = {
            name: 'Extension Demo',
            relativePath: 'addons/extension/demo',
            projectFilePath: path.join(
                imported.repositoryPath,
                'addons',
                'extension',
                'demo',
                'project.godot',
            ),
            detectedEditor: null,
        };
        submodules.initialise.mockImplementationOnce(async (request) => {
            request.onActivity({
                type: 'initialising',
                path: 'addons/extension',
            });
            return { ok: true, initialisedCount: 1 };
        });
        discovery.discover.mockResolvedValueOnce({
            ok: true,
            projects: [nestedProject],
        });

        await expect(
            service.initialiseRemoteProjectSubmodules(imported.jobId),
        ).resolves.toEqual({
            ok: true,
            jobId: imported.jobId,
            projects: [nestedProject],
        });

        expect(progress.publish).toHaveBeenCalledWith(
            expect.objectContaining({
                activity: {
                    type: 'initialising',
                    path: 'addons/extension',
                },
                canCancel: true,
                jobId: imported.jobId,
                stage: 'initialising-submodules',
            }),
        );
        expect(progress.publish).toHaveBeenCalledWith(
            expect.objectContaining({
                activity: { type: 'complete', projectCount: 1 },
            }),
        );
    });

    it('preserves a retained clone after submodule initialisation fails', async () => {
        const service = createService();
        const imported = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(imported.ok).toBe(true);
        if (!imported.ok) throw new Error('Expected a successful import');
        submodules.initialise.mockResolvedValueOnce({
            ok: false,
            reason: 'unsupported-submodule',
            path: 'addons/private',
        });

        await expect(
            service.initialiseRemoteProjectSubmodules(imported.jobId),
        ).resolves.toEqual({
            ok: false,
            jobId: imported.jobId,
            reason: 'unsupported-submodule',
        });
        await expect(fs.stat(imported.repositoryPath)).resolves.toBeDefined();
        expect(progress.publish).toHaveBeenCalledWith(
            expect.objectContaining({
                activity: {
                    type: 'stopped',
                    path: 'addons/private',
                },
                canCancel: false,
            }),
        );
    });

    it('preserves the completed clone after a discovery failure', async () => {
        discovery.discover.mockResolvedValueOnce({
            ok: false,
            reason: 'discovery-limit-exceeded',
        });
        const service = createService();

        await expect(
            service.importRemoteProject({
                source: 'public-git-url',
                url: 'https://example.com/team/game.git',
                parentDirectory,
                directoryName: 'game',
            }),
        ).resolves.toMatchObject({
            ok: false,
            reason: 'discovery-limit-exceeded',
        });
        await expect(
            fs.stat(path.join(parentDirectory, 'game')),
        ).resolves.toBeDefined();
    });
    it('sets identity only for the exact unchanged final clone', async () => {
        const service = createService();
        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('Expected a successful import');
        git.inspectRepository.mockResolvedValueOnce({
            status: 'inside-work-tree',
            root: result.repositoryPath,
            isProjectRoot: true,
            kind: 'standard',
        });
        git.setIdentity.mockResolvedValueOnce(true);

        await expect(
            service.setRemoteProjectGitIdentity(result.jobId, {
                name: ' Import User ',
                email: ' import@example.com ',
            }),
        ).resolves.toEqual({
            jobId: result.jobId,
            status: 'configured',
        });
        expect(git.setIdentity).toHaveBeenCalledWith(
            'Import User',
            'import@example.com',
            'repository',
            result.repositoryPath,
        );
        await expect(fs.stat(result.repositoryPath)).resolves.toBeDefined();
        await expect(
            service.resolveRemoteProjectClone(result.jobId, 'delete'),
        ).resolves.toEqual({ jobId: result.jobId, status: 'deleted' });
        expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
            'import@example.com',
        );
    });

    it('rejects incomplete identity before inspecting the clone', async () => {
        const service = createService();
        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('Expected a successful import');
        git.inspectRepository.mockClear();

        await expect(
            service.setRemoteProjectGitIdentity(result.jobId, {
                name: 'Import User',
                email: ' ',
            }),
        ).resolves.toEqual({
            jobId: result.jobId,
            status: 'invalid-identity',
        });
        expect(git.inspectRepository).not.toHaveBeenCalled();
        expect(git.setIdentity).not.toHaveBeenCalled();
    });

    it('rejects a destination replaced after clone completion', async () => {
        const service = createService();
        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('Expected a successful import');
        const movedClone = path.join(parentDirectory, 'identity-moved-game');
        await fs.rename(result.repositoryPath, movedClone);
        await fs.mkdir(result.repositoryPath);

        await expect(
            service.setRemoteProjectGitIdentity(result.jobId, {
                name: 'Import User',
                email: 'import@example.com',
            }),
        ).resolves.toEqual({
            jobId: result.jobId,
            status: 'changed',
        });
        expect(git.setIdentity).not.toHaveBeenCalled();
    });

    it.each([
        {
            inspection: { status: 'git-unavailable' as const },
            status: 'git-unavailable' as const,
        },
        {
            inspection: {
                status: 'inside-work-tree' as const,
                root: '/other/repository',
                isProjectRoot: false,
                kind: 'standard' as const,
            },
            status: 'repository-unavailable' as const,
        },
        {
            inspection: {
                status: 'inside-work-tree' as const,
                root: '/linked/repository',
                isProjectRoot: true,
                kind: 'linked-worktree' as const,
            },
            status: 'repository-unavailable' as const,
        },
    ])(
        'returns $status without writing for an unavailable repository scope',
        async ({ inspection, status }) => {
            const service = createService();
            const result = await service.importRemoteProject({
                source: 'public-git-url',
                url: 'https://example.com/team/game.git',
                parentDirectory,
                directoryName: 'game',
            });
            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('Expected a successful import');
            git.inspectRepository.mockResolvedValueOnce(inspection);

            await expect(
                service.setRemoteProjectGitIdentity(result.jobId, {
                    name: 'Import User',
                    email: 'import@example.com',
                }),
            ).resolves.toEqual({ jobId: result.jobId, status });
            expect(git.setIdentity).not.toHaveBeenCalled();
        },
    );

    it('reports a failed repository write without consuming clone ownership', async () => {
        const service = createService();
        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('Expected a successful import');
        git.inspectRepository.mockResolvedValueOnce({
            status: 'inside-work-tree',
            root: result.repositoryPath,
            isProjectRoot: true,
            kind: 'standard',
        });
        git.setIdentity.mockResolvedValueOnce(false);

        await expect(
            service.setRemoteProjectGitIdentity(result.jobId, {
                name: 'Import User',
                email: 'import@example.com',
            }),
        ).resolves.toEqual({
            jobId: result.jobId,
            status: 'update-failed',
        });
        await expect(
            service.resolveRemoteProjectClone(result.jobId, 'delete'),
        ).resolves.toEqual({ jobId: result.jobId, status: 'deleted' });
    });

    it('rejects an identity request for an unknown or expired job', async () => {
        const service = createService();

        await expect(
            service.setRemoteProjectGitIdentity('unknown-job', {
                name: 'Import User',
                email: 'import@example.com',
            }),
        ).resolves.toEqual({
            jobId: 'unknown-job',
            status: 'not-found',
        });
        expect(git.setIdentity).not.toHaveBeenCalled();
    });

    it('deletes only the final clone owned by the exact import job', async () => {
        const service = createService();
        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('Expected a successful import');

        await expect(
            service.resolveRemoteProjectClone(result.jobId, 'delete'),
        ).resolves.toEqual({ jobId: result.jobId, status: 'deleted' });
        await expect(fs.stat(result.repositoryPath)).rejects.toThrow();
        await expect(
            service.resolveRemoteProjectClone(result.jobId, 'delete'),
        ).resolves.toEqual({ jobId: result.jobId, status: 'not-found' });
    });

    it('releases cleanup ownership when the final clone is kept', async () => {
        const service = createService();
        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('Expected a successful import');

        await expect(
            service.resolveRemoteProjectClone(result.jobId, 'keep'),
        ).resolves.toEqual({ jobId: result.jobId, status: 'kept' });
        await expect(fs.stat(result.repositoryPath)).resolves.toBeDefined();
        await expect(
            service.resolveRemoteProjectClone(result.jobId, 'delete'),
        ).resolves.toEqual({ jobId: result.jobId, status: 'not-found' });
    });

    it('forgets cleanup ownership without deleting a final clone on shutdown', async () => {
        const service = createService();
        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('Expected a successful import');

        service.onModuleDestroy();

        await expect(fs.stat(result.repositoryPath)).resolves.toBeDefined();
        await expect(
            service.resolveRemoteProjectClone(result.jobId, 'delete'),
        ).resolves.toEqual({ jobId: result.jobId, status: 'not-found' });
    });

    it('bounds cleanup ownership to the newest completed import', async () => {
        const service = createService();
        const first = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'first-game',
        });
        const second = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'second-game',
        });
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok) {
            throw new Error('Expected successful imports');
        }

        await expect(
            service.resolveRemoteProjectClone(first.jobId, 'delete'),
        ).resolves.toEqual({ jobId: first.jobId, status: 'not-found' });
        await expect(fs.stat(first.repositoryPath)).resolves.toBeDefined();
        await expect(
            service.resolveRemoteProjectClone(second.jobId, 'delete'),
        ).resolves.toEqual({ jobId: second.jobId, status: 'deleted' });
    });

    it('refuses to delete a destination replaced after the clone completed', async () => {
        const service = createService();
        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('Expected a successful import');
        const movedClone = path.join(parentDirectory, 'moved-game');
        await fs.rename(result.repositoryPath, movedClone);
        await fs.mkdir(result.repositoryPath);
        await fs.writeFile(
            path.join(result.repositoryPath, 'other-process.txt'),
            'keep',
        );

        await expect(
            service.resolveRemoteProjectClone(result.jobId, 'delete'),
        ).resolves.toEqual({ jobId: result.jobId, status: 'changed' });
        await expect(
            fs.readFile(
                path.join(result.repositoryPath, 'other-process.txt'),
                'utf8',
            ),
        ).resolves.toBe('keep');
    });

    it('retains cleanup ownership when deleting the final clone fails', async () => {
        const service = createService();
        const result = await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/team/game.git',
            parentDirectory,
            directoryName: 'game',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('Expected a successful import');
        const remove = vi
            .spyOn(fs, 'rm')
            .mockRejectedValueOnce(new Error('busy'));

        await expect(
            service.resolveRemoteProjectClone(result.jobId, 'delete'),
        ).resolves.toEqual({
            jobId: result.jobId,
            status: 'delete-failed',
        });
        remove.mockRestore();
        await expect(fs.stat(result.repositoryPath)).resolves.toBeDefined();
        await expect(
            service.resolveRemoteProjectClone(result.jobId, 'delete'),
        ).resolves.toEqual({ jobId: result.jobId, status: 'deleted' });
    });

    /** Creates the service with test-owned external boundaries. */
    function createService(): ProjectRemoteImportService {
        return new ProjectRemoteImportService(
            git as never,
            clone as never,
            submodules as never,
            publicSources as never,
            repositoryHosting as never,
            discovery as never,
            progress as never,
        );
    }
});
