import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureVSCodiumProject } from './vscodiumProjectConfiguration.js';

vi.mock('electron-log', () => ({
    default: { warn: vi.fn() },
}));

const temporaryDirectories: string[] = [];

async function createProject(): Promise<{
    projectDir: string;
    configDir: string;
}> {
    const projectDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'launcher-vscodium-'),
    );
    temporaryDirectories.push(projectDir);
    const configDir = path.join(projectDir, '.vscode');
    await fs.promises.mkdir(configDir);
    return { projectDir, configDir };
}

describe('VSCodium project configuration', () => {
    afterEach(async () => {
        await Promise.all(
            temporaryDirectories.splice(0).map((directory) =>
                fs.promises.rm(directory, {
                    recursive: true,
                    force: true,
                }),
            ),
        );
    });

    it('adds only the Open VSX Godot recommendation for a new project', async () => {
        const { projectDir, configDir } = await createProject();

        await configureVSCodiumProject(projectDir, '/godot', 4.5, false);

        const extensions = JSON.parse(
            await fs.promises.readFile(
                path.join(configDir, 'extensions.json'),
                'utf-8',
            ),
        );
        const settings = JSON.parse(
            await fs.promises.readFile(
                path.join(configDir, 'settings.json'),
                'utf-8',
            ),
        );
        expect(extensions.recommendations).toEqual(['geequlim.godot-tools']);
        expect(settings).toMatchObject({
            'godotTools.editorPath.godot4': '/godot',
            'editor.tabSize': 4,
            'editor.insertSpaces': false,
            'files.eol': '\n',
        });
        await expect(
            fs.promises.stat(path.join(configDir, 'launch.json')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(
            fs.promises.stat(path.join(configDir, 'tasks.json')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('adds DotRush and managed debug files for a new .NET project', async () => {
        const { projectDir, configDir } = await createProject();

        await configureVSCodiumProject(projectDir, '/godot', 4.5, true);

        const extensions = JSON.parse(
            await fs.promises.readFile(
                path.join(configDir, 'extensions.json'),
                'utf-8',
            ),
        );
        expect(extensions.recommendations).toEqual([
            'geequlim.godot-tools',
            'nromanov.dotrush',
        ]);
        const launch = JSON.parse(
            await fs.promises.readFile(
                path.join(configDir, 'launch.json'),
                'utf-8',
            ),
        );
        const tasks = JSON.parse(
            await fs.promises.readFile(
                path.join(configDir, 'tasks.json'),
                'utf-8',
            ),
        );
        expect(launch.configurations).toEqual([
            expect.objectContaining({
                name: 'Godot: Play (VSCodium)',
                type: 'coreclr',
                request: 'attach',
                preLaunchTask: 'Godot: Build (VSCodium)',
                processPath: expect.any(String),
            }),
        ]);
        expect(tasks.tasks).toEqual([
            {
                label: 'Godot: Build (VSCodium)',
                command: 'dotnet',
                type: 'process',
                args: ['build'],
                problemMatcher: '$msCompile',
            },
        ]);
    });

    it('migrates its launch profile to attach without creating duplicates', async () => {
        const { projectDir, configDir } = await createProject();
        await fs.promises.writeFile(
            path.join(configDir, 'launch.json'),
            JSON.stringify({
                version: '0.2.0',
                configurations: [
                    {
                        name: 'Godot: Play (VSCodium)',
                        type: 'coreclr',
                        request: 'launch',
                        preLaunchTask: 'Godot: Build (VSCodium)',
                        program: '/old-godot',
                        args: [],
                        // biome-ignore lint/suspicious/noTemplateCurlyInString: editor workspace variable
                        cwd: '${workspaceFolder}',
                    },
                ],
            }),
        );

        await configureVSCodiumProject(projectDir, '/new-godot', 4.5, true);
        await configureVSCodiumProject(projectDir, '/newer-godot', 4.5, true);

        const launch = JSON.parse(
            await fs.promises.readFile(
                path.join(configDir, 'launch.json'),
                'utf-8',
            ),
        );
        const tasks = JSON.parse(
            await fs.promises.readFile(
                path.join(configDir, 'tasks.json'),
                'utf-8',
            ),
        );
        expect(launch.configurations).toHaveLength(1);
        expect(launch.configurations[0]).toMatchObject({
            request: 'attach',
            processPath: expect.stringContaining('newer-godot'),
        });
        expect(launch.configurations[0]).not.toHaveProperty('program');
        expect(tasks.tasks).toHaveLength(1);
    });

    it('replaces VS Code recommendations during an explicit switch', async () => {
        const { projectDir, configDir } = await createProject();
        const extensionsPath = path.join(configDir, 'extensions.json');
        await fs.promises.writeFile(
            extensionsPath,
            JSON.stringify({
                recommendations: [
                    'geequlim.godot-tools',
                    'mariodebono.godot-4-vscode-theme',
                    'ms-dotnettools.csharp',
                    'ms-dotnettools.csdevkit',
                    'user.extension',
                ],
            }),
        );

        await configureVSCodiumProject(
            projectDir,
            '/godot',
            4.5,
            true,
            'vscode',
        );

        const result = JSON.parse(
            await fs.promises.readFile(extensionsPath, 'utf-8'),
        );
        expect(result.recommendations).toEqual([
            'geequlim.godot-tools',
            'ms-dotnettools.csdevkit',
            'user.extension',
            'nromanov.dotrush',
        ]);
    });

    it('removes only launcher-managed VS Code .NET launch and task entries', async () => {
        const { projectDir, configDir } = await createProject();
        const launchPath = path.join(configDir, 'launch.json');
        const tasksPath = path.join(configDir, 'tasks.json');
        const userLaunch = {
            name: 'User Play',
            type: 'coreclr',
            request: 'launch',
            program: '/user/program',
        };
        const userTask = {
            label: 'user-build',
            command: 'dotnet',
            type: 'process',
            args: ['build'],
            problemMatcher: '$msCompile',
        };
        await fs.promises.writeFile(
            launchPath,
            JSON.stringify({
                version: '0.2.0',
                configurations: [
                    {
                        name: 'Play',
                        type: 'coreclr',
                        request: 'launch',
                        preLaunchTask: 'build',
                        program: '/launcher/godot',
                        args: [],
                        // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code workspace variable
                        cwd: '${workspaceFolder}',
                        stopAtEntry: false,
                    },
                    userLaunch,
                ],
            }),
        );
        await fs.promises.writeFile(
            tasksPath,
            JSON.stringify({
                version: '2.0.0',
                tasks: [
                    {
                        label: 'build',
                        command: 'dotnet',
                        type: 'process',
                        args: ['build'],
                        problemMatcher: '$msCompile',
                    },
                    userTask,
                ],
            }),
        );

        await configureVSCodiumProject(
            projectDir,
            '/godot',
            4.5,
            true,
            'vscode',
        );

        const launchResult = JSON.parse(
            await fs.promises.readFile(launchPath, 'utf-8'),
        );
        const tasksResult = JSON.parse(
            await fs.promises.readFile(tasksPath, 'utf-8'),
        );
        expect(launchResult.configurations).toEqual([
            userLaunch,
            expect.objectContaining({
                name: 'Godot: Play (VSCodium)',
                request: 'attach',
                preLaunchTask: 'Godot: Build (VSCodium)',
                processPath: expect.any(String),
            }),
        ]);
        expect(tasksResult.tasks).toEqual([
            userTask,
            expect.objectContaining({
                label: 'Godot: Build (VSCodium)',
            }),
        ]);
    });

    it('preserves .NET recommendations and files when switching a standard project', async () => {
        const { projectDir, configDir } = await createProject();
        const extensionsPath = path.join(configDir, 'extensions.json');
        const launchPath = path.join(configDir, 'launch.json');
        const tasksPath = path.join(configDir, 'tasks.json');
        const launch = '{ invalid launch config';
        const tasks = '{ invalid tasks config';
        await Promise.all([
            fs.promises.writeFile(
                extensionsPath,
                JSON.stringify({
                    recommendations: [
                        'mariodebono.godot-4-vscode-theme',
                        'ms-dotnettools.csharp',
                    ],
                }),
            ),
            fs.promises.writeFile(launchPath, launch),
            fs.promises.writeFile(tasksPath, tasks),
        ]);

        await configureVSCodiumProject(
            projectDir,
            '/godot',
            4.5,
            false,
            'vscode',
        );

        const result = JSON.parse(
            await fs.promises.readFile(extensionsPath, 'utf-8'),
        );
        expect(result.recommendations).toEqual([
            'ms-dotnettools.csharp',
            'geequlim.godot-tools',
        ]);
        await expect(fs.promises.readFile(launchPath, 'utf-8')).resolves.toBe(
            launch,
        );
        await expect(fs.promises.readFile(tasksPath, 'utf-8')).resolves.toBe(
            tasks,
        );
    });

    it('backs up invalid .NET files before creating managed files', async () => {
        const { projectDir, configDir } = await createProject();
        const launchPath = path.join(configDir, 'launch.json');
        const tasksPath = path.join(configDir, 'tasks.json');
        const launch = '{ invalid launch config';
        const tasks = '{ invalid tasks config';
        await Promise.all([
            fs.promises.writeFile(launchPath, launch),
            fs.promises.writeFile(tasksPath, tasks),
        ]);

        await configureVSCodiumProject(
            projectDir,
            '/godot',
            4.5,
            true,
            'vscode',
        );

        const files = await fs.promises.readdir(configDir);
        const badFiles = files.filter((file) => file.endsWith('.bad'));
        expect(badFiles).toHaveLength(2);
        expect(
            JSON.parse(await fs.promises.readFile(launchPath, 'utf-8'))
                .configurations[0].name,
        ).toBe('Godot: Play (VSCodium)');
        expect(
            JSON.parse(await fs.promises.readFile(tasksPath, 'utf-8')).tasks[0]
                .label,
        ).toBe('Godot: Build (VSCodium)');
    });

    it('preserves existing recommendations and .NET files without an explicit switch', async () => {
        const { projectDir, configDir } = await createProject();
        const extensionsPath = path.join(configDir, 'extensions.json');
        const launchPath = path.join(configDir, 'launch.json');
        const tasksPath = path.join(configDir, 'tasks.json');
        const extensions = `{
    "recommendations": [
        "ms-dotnettools.csharp", // kept because ownership is unknown
        "user.extension"
    ]
}`;
        const launch = JSON.stringify({
            version: '0.2.0',
            configurations: [
                {
                    name: 'Play',
                    type: 'coreclr',
                    request: 'launch',
                    preLaunchTask: 'build',
                    program: '/user/godot',
                    args: [],
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: editor workspace variable
                    cwd: '${workspaceFolder}',
                    stopAtEntry: false,
                },
            ],
        });
        const tasks = JSON.stringify({
            version: '2.0.0',
            tasks: [
                {
                    label: 'build',
                    command: 'dotnet',
                    type: 'process',
                    args: ['build'],
                    problemMatcher: '$msCompile',
                },
            ],
        });
        await Promise.all([
            fs.promises.writeFile(extensionsPath, extensions),
            fs.promises.writeFile(launchPath, launch),
            fs.promises.writeFile(tasksPath, tasks),
        ]);

        await configureVSCodiumProject(projectDir, '/godot', 4.5, true);

        const updatedExtensions = await fs.promises.readFile(
            extensionsPath,
            'utf-8',
        );
        expect(updatedExtensions).toContain(
            '// kept because ownership is unknown',
        );
        expect(updatedExtensions).toContain('ms-dotnettools.csharp');
        expect(updatedExtensions).toContain('user.extension');
        expect(updatedExtensions).toContain('geequlim.godot-tools');
        expect(updatedExtensions).toContain('nromanov.dotrush');
        const updatedLaunch = JSON.parse(
            await fs.promises.readFile(launchPath, 'utf-8'),
        );
        const updatedTasks = JSON.parse(
            await fs.promises.readFile(tasksPath, 'utf-8'),
        );
        expect(updatedLaunch.configurations[0]).toEqual(
            JSON.parse(launch).configurations[0],
        );
        expect(updatedLaunch.configurations[1]).toMatchObject({
            name: 'Godot: Play (VSCodium)',
            request: 'attach',
            preLaunchTask: 'Godot: Build (VSCodium)',
            processPath: expect.any(String),
        });
        expect(updatedTasks.tasks[0]).toEqual(JSON.parse(tasks).tasks[0]);
        expect(updatedTasks.tasks[1]).toMatchObject({
            label: 'Godot: Build (VSCodium)',
        });
    });

    it('updates launcher settings while preserving user settings and comments', async () => {
        const { projectDir, configDir } = await createProject();
        const settingsPath = path.join(configDir, 'settings.json');
        await fs.promises.writeFile(
            settingsPath,
            `{
    // user preference
    "editor.fontSize": 16,
    "editor.tabSize": 2,
    "files.exclude": {
        "**/.cache": true
    }
}`,
        );

        await configureVSCodiumProject(projectDir, '/godot', 4.5, false);

        const updatedSettings = await fs.promises.readFile(
            settingsPath,
            'utf-8',
        );
        expect(updatedSettings).toContain('// user preference');
        expect(updatedSettings).toContain('"editor.fontSize": 16');
        expect(updatedSettings).toContain('"**/.cache": true');
        expect(updatedSettings).toContain('"editor.tabSize": 4');
        expect(updatedSettings).toContain(
            '"godotTools.editorPath.godot4": "/godot"',
        );
    });
});
