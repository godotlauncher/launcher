import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectRemoteImportService } from './project-remote-import.service.js';

describe('ProjectRemoteImportService', () => {
    let parentDirectory: string;
    const git = {
        exists: vi.fn(async () => true),
        inspectRepository: vi.fn(async () => ({
            status: 'not-a-repository' as const,
        })),
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
    const progress = { publish: vi.fn() };
    const clone = { clone: vi.fn() };

    beforeEach(async () => {
        vi.clearAllMocks();
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
            projectPath: path.join(canonicalParent, 'game'),
            projectFilePath: path.join(
                canonicalParent,
                'game',
                'project.godot',
            ),
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
            projectPath: path.join(await fs.realpath(parentDirectory), 'game'),
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

    it('rejects a cloned repository without a root project.godot', async () => {
        clone.clone.mockImplementationOnce(async (request) => {
            await fs.mkdir(request.destinationPath);
            return { ok: true };
        });
        const service = createService();

        await expect(
            service.importRemoteProject({
                source: 'public-git-url',
                url: 'https://example.com/team/not-godot.git',
                parentDirectory,
                directoryName: 'not-godot',
            }),
        ).resolves.toMatchObject({
            ok: false,
            reason: 'not-godot-project',
        });
        expect(await fs.readdir(parentDirectory)).toEqual([]);
    });

    /** Creates the service with test-owned external boundaries. */
    function createService(): ProjectRemoteImportService {
        return new ProjectRemoteImportService(
            git as never,
            clone as never,
            publicSources as never,
            repositoryHosting as never,
            progress as never,
        );
    }
});
