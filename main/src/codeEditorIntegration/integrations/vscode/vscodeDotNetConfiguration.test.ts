import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock electron-log to suppress expected warnings in tests
vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock the fs module
vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
        promises: {
            mkdir: vi.fn(),
            rename: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
        },
    },
    existsSync: vi.fn(),
    promises: {
        mkdir: vi.fn(),
        rename: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
    },
}));

describe('addVSCodeNETLaunchConfig', () => {
    const projectDir = '/some/net-project';
    const launchPath = '/path/to/godot';
    const vscodeDir = path.join(projectDir, '.vscode');
    const _launchJson = path.join(vscodeDir, 'launch.json');
    const _tasksJson = path.join(vscodeDir, 'tasks.json');

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.promises.readFile).mockResolvedValue('{}');
        vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    test('creates launch.json and tasks.json when none exist', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const mod = await vi.importActual<
            typeof import('./vscodeProjectConfiguration.js')
        >('./vscodeProjectConfiguration.js');
        await mod.addVSCodeNETLaunchConfig(projectDir, launchPath);

        expect(fs.promises.mkdir).toHaveBeenCalledWith(
            expect.stringContaining('.vscode'),
            { recursive: true },
        );

        const launchCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('launch.json'));
        const tasksCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('tasks.json'));

        expect(launchCall).toBeDefined();
        expect(tasksCall).toBeDefined();

        const launchCfg = JSON.parse(launchCall?.[1] as string);
        expect(launchCfg.configurations).toBeDefined();
        expect(launchCfg.configurations[0].type).toBe('coreclr');
        expect(launchCfg.configurations[0]).toMatchObject({
            launchSettingsProfile: '',
            checkForDevCert: false,
        });
        expect(String(launchCfg.configurations[0].program)).toEqual(
            expect.stringContaining('path'),
        );

        const tasksCfg = JSON.parse(tasksCall?.[1] as string);
        expect(tasksCfg.tasks[0].command).toBe('dotnet');
    });

    test('appends Contents/MacOS/Godot for .app bundles on darwin', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'darwin',
            configurable: true,
        });
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const mod = await vi.importActual<
            typeof import('./vscodeProjectConfiguration.js')
        >('./vscodeProjectConfiguration.js');
        await mod.addVSCodeNETLaunchConfig(
            projectDir,
            '/Applications/Godot.app',
        );

        const launchCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('launch.json'));
        const launchCfg = JSON.parse(launchCall?.[1] as string);

        // match mac .app path regardless of path separators or drive letters
        expect(String(launchCfg.configurations[0].program)).toMatch(
            /Applications[\\/ ]Godot\.app[\\/ ]Contents[\\/ ]MacOS[\\/ ]Godot/i,
        );

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test('preserves user launch program paths and adds a managed profile', async () => {
        const existing = {
            version: '0.2.0',
            configurations: [
                { name: 'Play', program: '/old/path', type: 'coreclr' },
                { name: 'Other', type: 'node', program: 'app.js' },
            ],
        };

        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('launch.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existing),
        );

        const mod = await vi.importActual<
            typeof import('./vscodeProjectConfiguration.js')
        >('./vscodeProjectConfiguration.js');
        await mod.addVSCodeNETLaunchConfig(projectDir, launchPath);

        const launchCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('launch.json'));
        const launchCfg = JSON.parse(launchCall?.[1] as string);

        expect(launchCfg.configurations).toHaveLength(3);
        expect(launchCfg.configurations[0].program).toBe('/old/path');
        expect(launchCfg.configurations[1].program).toBe('app.js');
        expect(launchCfg.configurations[2]).toMatchObject({
            name: 'Godot: Play (VS Code)',
            preLaunchTask: 'Godot: Build (VS Code)',
            program: expect.stringContaining('godot'),
        });
    });

    test('migrates only the exact legacy launcher profile', async () => {
        const existing = {
            version: '0.2.0',
            configurations: [
                {
                    name: 'Play',
                    type: 'coreclr',
                    request: 'launch',
                    preLaunchTask: 'build',
                    program: '/old/path',
                    args: [],
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: editor workspace variable
                    cwd: '${workspaceFolder}',
                    stopAtEntry: false,
                },
                { name: 'User', type: 'node', program: 'app.js' },
            ],
        };
        vi.mocked(fs.existsSync).mockImplementation((target) =>
            target.toString().endsWith('launch.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existing),
        );

        const mod = await vi.importActual<
            typeof import('./vscodeProjectConfiguration.js')
        >('./vscodeProjectConfiguration.js');
        await mod.addVSCodeNETLaunchConfig(projectDir, launchPath);

        const launchCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((call) =>
                call[0].toString().endsWith('launch.json'),
            );
        const launchCfg = JSON.parse(launchCall?.[1] as string);
        expect(launchCfg.configurations).toHaveLength(2);
        expect(launchCfg.configurations[0]).toMatchObject({
            name: 'Godot: Play (VS Code)',
            preLaunchTask: 'Godot: Build (VS Code)',
            program: expect.stringContaining('godot'),
        });
        expect(launchCfg.configurations[1]).toEqual(existing.configurations[1]);
    });

    test('handles corrupted launch.json by writing a fresh one', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('launch.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue('{ invalid json }');
        const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1712345678903);
        const launchFile = path.resolve(projectDir, '.vscode', 'launch.json');
        const backupFile = `${launchFile}.1712345678903.bad`;

        const mod = await vi.importActual<
            typeof import('./vscodeProjectConfiguration.js')
        >('./vscodeProjectConfiguration.js');
        const recoveredFiles = await mod.addVSCodeNETLaunchConfig(
            projectDir,
            launchPath,
        );

        expect(recoveredFiles).toEqual([backupFile]);
        expect(fs.promises.rename).toHaveBeenCalledWith(launchFile, backupFile);
        const launchCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('launch.json'));
        expect(launchCall).toBeDefined();
        const launchCfg = JSON.parse(launchCall?.[1] as string);
        expect(launchCfg.configurations[0].type).toBe('coreclr');
        dateNowSpy.mockRestore();
    });

    test('preserves existing tasks and adds a managed build task', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
            if (p.toString().endsWith('launch.json')) return false;
            if (p.toString().endsWith('tasks.json')) return true;
            return false;
        });
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify({ version: '2.0.0', tasks: [{ label: 'custom' }] }),
        );

        const mod = await vi.importActual<
            typeof import('./vscodeProjectConfiguration.js')
        >('./vscodeProjectConfiguration.js');
        await mod.addVSCodeNETLaunchConfig(projectDir, launchPath);

        const tasksCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('tasks.json'));
        expect(tasksCall).toBeDefined();
        const tasks = JSON.parse(tasksCall?.[1] as string).tasks;
        expect(tasks).toEqual([
            { label: 'custom' },
            expect.objectContaining({
                label: 'Godot: Build (VS Code)',
                command: 'dotnet',
            }),
        ]);
    });

    test('removes only VSCodium-managed entries during an explicit switch', async () => {
        const userLaunch = {
            name: 'User profile',
            type: 'coreclr',
            request: 'launch',
            program: '/user/program',
        };
        const userTask = { label: 'user-task', command: 'custom-build' };
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockImplementation(async (target) => {
            if (target.toString().endsWith('launch.json')) {
                return JSON.stringify({
                    version: '0.2.0',
                    configurations: [
                        {
                            name: 'Godot: Play (VSCodium)',
                            type: 'coreclr',
                            request: 'attach',
                            preLaunchTask: 'Godot: Build (VSCodium)',
                            processPath: '/godot',
                            // biome-ignore lint/suspicious/noTemplateCurlyInString: editor workspace variable
                            cwd: '${workspaceFolder}',
                        },
                        userLaunch,
                    ],
                });
            }
            if (target.toString().endsWith('tasks.json')) {
                return JSON.stringify({
                    version: '2.0.0',
                    tasks: [
                        {
                            label: 'Godot: Build (VSCodium)',
                            command: 'dotnet',
                            type: 'process',
                            args: ['build'],
                            problemMatcher: '$msCompile',
                        },
                        userTask,
                    ],
                });
            }
            return '{}';
        });

        const mod = await vi.importActual<
            typeof import('./vscodeProjectConfiguration.js')
        >('./vscodeProjectConfiguration.js');
        await mod.addVSCodeNETLaunchConfig(projectDir, launchPath, true);

        const launchCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((call) =>
                call[0].toString().endsWith('launch.json'),
            );
        const tasksCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((call) =>
                call[0].toString().endsWith('tasks.json'),
            );
        const launch = JSON.parse(launchCall?.[1] as string);
        const tasks = JSON.parse(tasksCall?.[1] as string);
        expect(launch.configurations).toEqual([
            userLaunch,
            expect.objectContaining({ name: 'Godot: Play (VS Code)' }),
        ]);
        expect(tasks.tasks).toEqual([
            userTask,
            expect.objectContaining({ label: 'Godot: Build (VS Code)' }),
        ]);
    });
});
