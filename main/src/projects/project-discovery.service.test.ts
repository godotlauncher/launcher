import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDiscoveryService } from './project-discovery.service.js';

describe('ProjectDiscoveryService', () => {
    let repositoryPath: string;
    const service = new ProjectDiscoveryService();

    beforeEach(async () => {
        repositoryPath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'project-discovery-test-'),
        );
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(repositoryPath, { recursive: true, force: true });
    });

    it('discovers valid root and nested Godot projects', async () => {
        await writeProject(repositoryPath, 'Root Game');
        await writeProject(
            path.join(repositoryPath, 'games', 'nested'),
            'Nested',
        );

        const originalProjectFile = await fs.readFile(
            path.join(repositoryPath, 'project.godot'),
            'utf8',
        );
        await expect(
            service.discover(repositoryPath, new AbortController().signal),
        ).resolves.toEqual({
            ok: true,
            projects: [
                {
                    name: 'Root Game',
                    relativePath: '.',
                    projectFilePath: path.join(repositoryPath, 'project.godot'),
                    detectedEditor: {
                        kind: 'stable-base',
                        channel: 'official',
                        flavor: 'gdscript',
                        baseVersion: '4.4',
                    },
                },
                {
                    name: 'Nested',
                    relativePath: path.join('games', 'nested'),
                    projectFilePath: path.join(
                        repositoryPath,
                        'games',
                        'nested',
                        'project.godot',
                    ),
                    detectedEditor: {
                        kind: 'stable-base',
                        channel: 'official',
                        flavor: 'gdscript',
                        baseVersion: '4.4',
                    },
                },
            ],
        });
        await expect(
            fs.readFile(path.join(repositoryPath, 'project.godot'), 'utf8'),
        ).resolves.toBe(originalProjectFile);
    });

    it('ignores generated directories, symlinks and malformed projects', async () => {
        await writeProject(path.join(repositoryPath, '.git', 'fixture'), 'Git');
        await writeProject(
            path.join(repositoryPath, '.godot', 'fixture'),
            'Godot',
        );
        await writeProject(
            path.join(repositoryPath, 'node_modules', 'fixture'),
            'Dependency',
        );
        await fs.mkdir(path.join(repositoryPath, 'invalid'), {
            recursive: true,
        });
        await fs.writeFile(
            path.join(repositoryPath, 'invalid', 'project.godot'),
            '[application]\nconfig/name="Invalid"\n',
        );
        await writeProject(path.join(repositoryPath, 'real'), 'Real');
        await fs.symlink(
            path.join(repositoryPath, 'real'),
            path.join(repositoryPath, 'linked'),
        );

        const result = await service.discover(
            repositoryPath,
            new AbortController().signal,
        );

        expect(result).toMatchObject({
            ok: true,
            projects: [{ name: 'Real', relativePath: 'real' }],
        });
    });

    it('stops before traversal when already cancelled', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
            service.discover(repositoryPath, controller.signal),
        ).resolves.toEqual({ ok: false, reason: 'cancelled' });
    });

    it('prefers exact adjacent .godotlauncher editor metadata', async () => {
        await writeProject(repositoryPath, 'Configured Game');
        await fs.writeFile(
            path.join(repositoryPath, '.godotlauncher'),
            [
                '[config]',
                'version=1',
                '',
                '[launcher]',
                'version=1.11.0',
                '',
                '[editor]',
                'channel=custom',
                'flavor=team-build',
                'base_version=4.4',
                'version=4.4-team.2',
                '',
            ].join('\n'),
        );

        await expect(
            service.discover(repositoryPath, new AbortController().signal),
        ).resolves.toMatchObject({
            ok: true,
            projects: [
                {
                    detectedEditor: {
                        kind: 'exact',
                        channel: 'custom',
                        flavor: 'team-build',
                        baseVersion: '4.4',
                        version: '4.4-team.2',
                    },
                },
            ],
        });
    });

    it('detects the .NET flavour from project files', async () => {
        await writeProject(repositoryPath, 'Dotnet Game');
        await fs.writeFile(path.join(repositoryPath, 'Dotnet Game.csproj'), '');

        await expect(
            service.discover(repositoryPath, new AbortController().signal),
        ).resolves.toMatchObject({
            ok: true,
            projects: [
                {
                    detectedEditor: {
                        kind: 'stable-base',
                        flavor: 'dotnet',
                        baseVersion: '4.4',
                    },
                },
            ],
        });
    });

    it('stops when repository nesting exceeds the traversal bound', async () => {
        let directory = repositoryPath;
        for (let depth = 0; depth < 14; depth++) {
            directory = path.join(directory, `level-${depth}`);
            await fs.mkdir(directory);
        }

        await expect(
            service.discover(repositoryPath, new AbortController().signal),
        ).resolves.toEqual({
            ok: false,
            reason: 'discovery-limit-exceeded',
        });
    });

    it('keeps valid local findings and reports malformed project files', async () => {
        await writeProject(path.join(repositoryPath, 'valid'), 'Valid');
        await fs.mkdir(path.join(repositoryPath, 'invalid'));
        await fs.writeFile(
            path.join(repositoryPath, 'invalid', 'project.godot'),
            'not a project',
        );
        const result = await service.scanFolder(
            repositoryPath,
            new AbortController().signal,
            vi.fn(),
        );
        expect(result.status).toBe('complete');
        expect(result.projects.map((project) => project.name)).toEqual([
            'Valid',
        ]);
        expect(result.issues).toEqual([
            {
                relativePath: path.join('invalid', 'project.godot'),
                reason: 'invalid-project',
            },
        ]);
    });
    it('continues healthy siblings after an unreadable directory', async () => {
        await writeProject(path.join(repositoryPath, 'a-valid'), 'Valid');
        const unavailable = path.join(repositoryPath, 'z-unreadable');
        await fs.mkdir(unavailable);
        const original = fs.readdir.bind(fs);
        vi.spyOn(fs, 'readdir').mockImplementation((async (
            directory,
            options,
        ) => {
            if (directory === unavailable)
                throw new Error('private filesystem detail');
            return original(directory, options as never);
        }) as typeof fs.readdir);
        const result = await service.scanFolder(
            repositoryPath,
            new AbortController().signal,
            vi.fn(),
        );
        expect(result.projects.map((project) => project.name)).toEqual([
            'Valid',
        ]);
        expect(result.issues).toEqual([
            { relativePath: 'z-unreadable', reason: 'unreadable-folder' },
        ]);
        expect(JSON.stringify(result)).not.toContain(
            'private filesystem detail',
        );
    });
    it('retains local findings when stopped', async () => {
        await writeProject(repositoryPath, 'Root');
        await writeProject(path.join(repositoryPath, 'nested'), 'Nested');
        const controller = new AbortController();
        const result = await service.scanFolder(
            repositoryPath,
            controller.signal,
            () => controller.abort(),
        );
        expect(result.status).toBe('cancelled');
        expect(result.projects.map((project) => project.name)).toEqual([
            'Root',
        ]);
    });
    it('keeps healthy projects after a local depth limit', async () => {
        await writeProject(repositoryPath, 'Root');
        let nested = repositoryPath;
        for (let depth = 0; depth < 14; depth++) {
            nested = path.join(nested, 'child');
            await fs.mkdir(nested);
        }
        const result = await service.scanFolder(
            repositoryPath,
            new AbortController().signal,
            vi.fn(),
        );
        expect(result.status).toBe('limited');
        expect(result.projects.map((project) => project.name)).toEqual([
            'Root',
        ]);
        expect(result.issues[0].reason).toBe('depth-limit');
    });
    it('keeps the first hundred projects at the local project bound', async () => {
        for (let index = 0; index < 102; index++)
            await writeProject(
                path.join(repositoryPath, String(index).padStart(3, '0')),
                `Game ${index}`,
            );
        const result = await service.scanFolder(
            repositoryPath,
            new AbortController().signal,
            vi.fn(),
        );
        expect(result.status).toBe('limited');
        expect(result.projects).toHaveLength(100);
    });
    it('reports an unavailable root safely', async () => {
        const result = await service.scanFolder(
            path.join(repositoryPath, 'missing'),
            new AbortController().signal,
            vi.fn(),
        );
        expect(result.status).toBe('failed');
        expect(result.projects).toEqual([]);
        expect(result.issues).toEqual([
            { relativePath: '.', reason: 'unreadable-folder' },
        ]);
    });

    /**
     * Writes one minimally valid Godot 4 project definition.
     *
     * @param directory - Project directory to create.
     * @param name - Project name stored in project.godot.
     */
    async function writeProject(
        directory: string,
        name: string,
    ): Promise<void> {
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(
            path.join(directory, 'project.godot'),
            `config_version=5\n\n[application]\nconfig/name="${name}"\nconfig/features=PackedStringArray("4.4")\n`,
        );
    }
});
