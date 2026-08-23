import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
