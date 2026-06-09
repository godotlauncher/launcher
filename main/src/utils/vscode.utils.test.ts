import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseJSONC } from 'jsonc-parser';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { addVSCodeSettings, updateVSCodeSettings } from './vscode.utils.js';

type LaunchConfiguration = {
    program: unknown;
    type?: string;
    [key: string]: unknown;
};

// Mock electron-log to suppress expected warnings in tests
vi.mock('electron-log', () => ({
    default: {
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

// Mock addVSCodeNETLaunchConfig
vi.mock('./vscode.utils.js', async () => {
    const actual =
        await vi.importActual<typeof import('./vscode.utils.js')>(
            './vscode.utils.js',
        );
    return {
        ...actual,
        addVSCodeNETLaunchConfig: vi.fn(),
    };
});

describe('addVSCodeSettings', () => {
    const projectDir = '/some/project';
    const launchPath = '/path/to/godot';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.promises.readFile).mockResolvedValue('{}');
        // default to no existing files
        vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    test('creates .vscode and settings.json when none exist', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await addVSCodeSettings(projectDir, launchPath, 4, false);

        // Ensure .vscode dir created
        expect(fs.promises.mkdir).toHaveBeenCalledWith(
            expect.stringContaining('.vscode'),
            { recursive: true },
        );

        // Find written settings.json call
        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('settings.json'));
        expect(writeCall).toBeDefined();
        const settings = JSON.parse(writeCall?.[1] as string);
        expect(settings['godotTools.editorPath.godot4']).toBe(launchPath);
        expect(settings['files.exclude']['**/*.gd.uid']).toBe(true);
    });

    test('merges with existing settings.json', async () => {
        const existing = { 'editor.fontSize': 12, 'some.key': 'value' };
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existing),
        );

        await addVSCodeSettings(projectDir, launchPath, 4, false);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('settings.json'));
        expect(writeCall).toBeDefined();
        const settings = JSON.parse(writeCall?.[1] as string);
        expect(settings['editor.fontSize']).toBe(12);
        expect(settings['some.key']).toBe('value');
        expect(settings['godotTools.editorPath.godot4']).toBe(launchPath);
    });

    test('uses godot3 key for Godot 3.x', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await addVSCodeSettings(projectDir, launchPath, 3.5, false);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('settings.json'));
        const settings = JSON.parse(writeCall?.[1] as string);
        expect(settings['godotTools.editorPath.godot3']).toBe(launchPath);
    });

    test('when isMono is true, settings.json is still written (launch config handled separately)', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await addVSCodeSettings(projectDir, launchPath, 4, true);

        // ensure settings.json was written
        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('settings.json'));
        expect(writeCall).toBeDefined();
        const settings = JSON.parse(writeCall?.[1] as string);
        expect(settings['godotTools.editorPath.godot4']).toBe(launchPath);
    });
});

describe('addOrUpdateVSCodeRecommendedExtensions', () => {
    const projectDir = '/some/ext-project';
    const settingsPath = path.join(projectDir, '.vscode');
    const _settingsFile = path.join(settingsPath, 'extensions.json');

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.promises.readFile).mockResolvedValue('{}');
        vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    test('creates extensions.json with recommended extensions', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await (
            await import('./vscode.utils.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, false);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        expect(writeCall).toBeDefined();
        const payload = JSON.parse(writeCall?.[1] as string);
        expect(payload.recommendations).toContain('geequlim.godot-tools');
        expect(payload.recommendations).not.toContain('ms-dotnettools.csharp');
    });

    test('adds C# recommendation when isMono=true', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await (
            await import('./vscode.utils.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, true);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        const payload = JSON.parse(writeCall?.[1] as string);
        expect(payload.recommendations).toContain('ms-dotnettools.csharp');
    });

    test('merges with existing extensions and deduplicates', async () => {
        const existing = {
            recommendations: ['dbaeumer.vscode-eslint', 'geequlim.godot-tools'],
        };
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existing),
        );

        await (
            await import('./vscode.utils.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, true);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        expect(writeCall).toBeDefined();
        const payload = JSON.parse(writeCall?.[1] as string);
        // should include eslint, godot-tools, and csharp
        expect(payload.recommendations).toEqual(
            expect.arrayContaining([
                'dbaeumer.vscode-eslint',
                'geequlim.godot-tools',
                'ms-dotnettools.csharp',
            ]),
        );
        // ensure no duplicates
        const unique = new Set(payload.recommendations);
        expect(unique.size).toBe(payload.recommendations.length);
    });

    test('backs up invalid extensions.json and writes a fresh one', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue('{ invalid json }');
        const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1712345678901);
        const extensionsFile = path.resolve(
            projectDir,
            '.vscode',
            'extensions.json',
        );
        const backupFile = `${extensionsFile}.1712345678901.bad`;

        const recoveredFiles = await (
            await import('./vscode.utils.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, false);

        expect(recoveredFiles).toEqual([backupFile]);
        expect(fs.promises.rename).toHaveBeenCalledWith(
            extensionsFile,
            backupFile,
        );
        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        expect(writeCall).toBeDefined();
        dateNowSpy.mockRestore();
    });

    test('parses JSONC extensions without creating a .bad backup', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    // keep this recommendation
    "recommendations": [
        "dbaeumer.vscode-eslint",
    ],
}`);

        const recoveredFiles = await (
            await import('./vscode.utils.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, false);

        expect(recoveredFiles).toEqual([]);
        expect(fs.promises.rename).not.toHaveBeenCalled();
        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        const writtenExtensions = writeCall?.[1] as string;
        expect(writtenExtensions).toContain('// keep this recommendation');
        const payload = parseJSONC(writtenExtensions);
        expect(payload.recommendations).toEqual(
            expect.arrayContaining([
                'dbaeumer.vscode-eslint',
                'geequlim.godot-tools',
            ]),
        );
    });

    test('does not rewrite JSONC extensions when recommendations are current', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    "recommendations": [
        "geequlim.godot-tools",
        "mariodebono.godot-4-vscode-theme",
        "eamodio.gitlens", //this comment
    ]
}`);

        const recoveredFiles = await (
            await import('./vscode.utils.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, false);

        expect(recoveredFiles).toEqual([]);
        expect(fs.promises.rename).not.toHaveBeenCalled();
        expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    test('preserves inline comments when inserting missing JSONC extension recommendations', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    "recommendations": [
        "geequlim.godot-tools",
        "mariodebono.godot-4-vscode-theme",
        "eamodio.gitlens", //this comment
    ]
}`);

        const recoveredFiles = await (
            await import('./vscode.utils.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, true);

        expect(recoveredFiles).toEqual([]);
        expect(fs.promises.rename).not.toHaveBeenCalled();
        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        const writtenExtensions = writeCall?.[1] as string;
        expect(writtenExtensions).toContain('//this comment');
        const payload = parseJSONC(writtenExtensions);
        expect(payload.recommendations).toEqual(
            expect.arrayContaining([
                'geequlim.godot-tools',
                'mariodebono.godot-4-vscode-theme',
                'eamodio.gitlens',
                'ms-dotnettools.csharp',
            ]),
        );
    });

    test('backs up extensions.json with invalid recommendations shape', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    "recommendations": "ms-dotnettools.csharp"
}`);
        const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1712345678902);
        const extensionsFile = path.resolve(
            projectDir,
            '.vscode',
            'extensions.json',
        );
        const backupFile = `${extensionsFile}.1712345678902.bad`;

        const recoveredFiles = await (
            await import('./vscode.utils.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, true);

        expect(recoveredFiles).toEqual([backupFile]);
        expect(fs.promises.rename).toHaveBeenCalledWith(
            extensionsFile,
            backupFile,
        );
        dateNowSpy.mockRestore();
    });

    test('preserves unrelated keys when merging', async () => {
        const existing = {
            unwanted: ['x'],
            recommendations: ['geequlim.godot-tools'],
        };
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existing),
        );

        await (
            await import('./vscode.utils.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, false);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        const payload = JSON.parse(writeCall?.[1] as string);
        expect(payload.unwanted).toEqual(['x']);
    });
});

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

        const mod =
            await vi.importActual<typeof import('./vscode.utils.js')>(
                './vscode.utils.js',
            );
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

        const mod =
            await vi.importActual<typeof import('./vscode.utils.js')>(
                './vscode.utils.js',
            );
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

    test('updates existing launch.json program paths', async () => {
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

        const mod =
            await vi.importActual<typeof import('./vscode.utils.js')>(
                './vscode.utils.js',
            );
        await mod.addVSCodeNETLaunchConfig(projectDir, launchPath);

        const launchCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('launch.json'));
        const launchCfg = JSON.parse(launchCall?.[1] as string);

        expect(launchCfg.configurations).toHaveLength(2);
        // ensure the old program path was replaced and at least one configuration references Godot
        expect(launchCfg.configurations[0].program).not.toBe('/old/path');
        const programs = (
            launchCfg.configurations as LaunchConfiguration[]
        ).map((c) => String(c.program).toLowerCase());
        expect(programs.some((p: string) => p.includes('godot'))).toBe(true);
    });

    test('handles corrupted launch.json by writing a fresh one', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('launch.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue('{ invalid json }');
        const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1712345678903);
        const launchFile = path.resolve(projectDir, '.vscode', 'launch.json');
        const backupFile = `${launchFile}.1712345678903.bad`;

        const mod =
            await vi.importActual<typeof import('./vscode.utils.js')>(
                './vscode.utils.js',
            );
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

    test('does not overwrite existing tasks.json', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
            if (p.toString().endsWith('launch.json')) return false;
            if (p.toString().endsWith('tasks.json')) return true;
            return false;
        });
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify({ version: '2.0.0', tasks: [{ label: 'custom' }] }),
        );

        const mod =
            await vi.importActual<typeof import('./vscode.utils.js')>(
                './vscode.utils.js',
            );
        await mod.addVSCodeNETLaunchConfig(projectDir, launchPath);

        const tasksCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) => c[0].toString().endsWith('tasks.json'));
        expect(tasksCall).toBeUndefined();
    });
});

describe('getVSCodeInstallPath', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('returns null on unsupported platform', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'sunos',
            configurable: true,
        });

        const mod =
            await vi.importActual<typeof import('./vscode.utils.js')>(
                './vscode.utils.js',
            );
        const res = await mod.getVSCodeInstallPath();
        expect(res).toBeNull();

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test('returns provided path if it exists', async () => {
        vi.mocked(fs.existsSync).mockImplementation(
            (p) => p === '/custom/code',
        );
        const mod =
            await vi.importActual<typeof import('./vscode.utils.js')>(
                './vscode.utils.js',
            );
        const res = await mod.getVSCodeInstallPath('/custom/code');
        expect(res).toBe('/custom/code');
    });

    test('finds default darwin location', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'darwin',
            configurable: true,
        });
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            String(p).includes('Visual Studio Code.app'),
        );

        const mod =
            await vi.importActual<typeof import('./vscode.utils.js')>(
                './vscode.utils.js',
            );
        const res = await mod.getVSCodeInstallPath();
        expect(res).toContain('Visual Studio Code.app');

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test('finds default windows location including LOCALAPPDATA', async () => {
        const original = process.platform;
        const originalLocal = process.env.LOCALAPPDATA;
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });
        process.env.LOCALAPPDATA = 'C:\\Users\\Me\\AppData\\Local';

        vi.mocked(fs.existsSync).mockImplementation(
            (p) =>
                String(p).includes('Programs\\Microsoft VS Code') ||
                String(p).includes('Local'),
        );

        const mod =
            await vi.importActual<typeof import('./vscode.utils.js')>(
                './vscode.utils.js',
            );
        const res = await mod.getVSCodeInstallPath();
        expect(res).toBeTruthy();
        expect(String(res)).toMatch(/Code\.exe$/i);

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
        process.env.LOCALAPPDATA = originalLocal;
    });

    test('finds default linux location', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        vi.mocked(fs.existsSync).mockImplementation(
            (p) =>
                String(p).includes('/usr/bin') ||
                String(p).includes('/snap/bin'),
        );

        const mod =
            await vi.importActual<typeof import('./vscode.utils.js')>(
                './vscode.utils.js',
            );
        const res = await mod.getVSCodeInstallPath();
        expect(res).toBeTruthy();
        expect(String(res)).toMatch(/code$/i);

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });
});

describe('updateVSCodeSettings', () => {
    const testProjectDir = '/test/project';
    const _vscodePath = '/test/project/.vscode';
    const _settingsFile = '/test/project/.vscode/settings.json';

    beforeEach(() => {
        // Reset all mocks before each test
        vi.clearAllMocks();

        // Default mock behavior
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('should create new settings.json when file does not exist', async () => {
        // Mock: .vscode directory doesn't exist, settings.json doesn't exist
        vi.mocked(fs.existsSync).mockImplementation((_path) => false);

        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        // Verify mkdir was called
        expect(fs.promises.mkdir).toHaveBeenCalledWith(
            expect.stringContaining('.vscode'),
            { recursive: true },
        );

        // Verify settings were written
        expect(fs.promises.writeFile).toHaveBeenCalledOnce();
        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
            '/path/to/godot',
        );
        expect(writtenSettings['editor.tabSize']).toBe(4);
        expect(writtenSettings['editor.insertSpaces']).toBe(false);
        expect(writtenSettings['files.eol']).toBe('\n');
        expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
    });

    test('should merge with existing settings without overwriting user settings', async () => {
        const existingSettings = {
            'editor.fontSize': 14,
            'editor.fontFamily': 'Consolas',
            'files.exclude': {
                '**/.git': true,
                '**/node_modules': true,
            },
            'myCustom.setting': 'value',
        };

        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existingSettings, null, 4),
        );

        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Check that user settings are preserved
        expect(writtenSettings['editor.fontSize']).toBe(14);
        expect(writtenSettings['editor.fontFamily']).toBe('Consolas');
        expect(writtenSettings['myCustom.setting']).toBe('value');

        // Check that launcher settings are added
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
            '/path/to/godot',
        );
        expect(writtenSettings['editor.tabSize']).toBe(4);

        // Check that files.exclude is deep merged
        expect(writtenSettings['files.exclude']['**/.git']).toBe(true);
        expect(writtenSettings['files.exclude']['**/node_modules']).toBe(true);
        expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
    });

    test('should update existing Godot path when settings exist', async () => {
        const existingSettings = {
            'godotTools.editorPath.godot4': '/old/path/to/godot',
            'editor.tabSize': 2,
        };

        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existingSettings, null, 4),
        );

        await updateVSCodeSettings(
            testProjectDir,
            '/new/path/to/godot',
            4,
            false,
        );

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Check that Godot path is updated
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
            '/new/path/to/godot',
        );
        // Check that other settings are updated to launcher defaults
        expect(writtenSettings['editor.tabSize']).toBe(4);
    });

    test('should handle different Godot versions correctly', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        // Test Godot 3
        await updateVSCodeSettings(testProjectDir, '/path/to/godot3', 3, false);
        let writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        let writtenSettings = JSON.parse(writeCall[1] as string);
        expect(writtenSettings['godotTools.editorPath.godot3']).toBe(
            '/path/to/godot3',
        );

        // Test Godot 4.3
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(false);
        await updateVSCodeSettings(
            testProjectDir,
            '/path/to/godot4',
            4.3,
            false,
        );
        writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        writtenSettings = JSON.parse(writeCall[1] as string);
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
            '/path/to/godot4',
        );

        // Test Godot 5
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(false);
        await updateVSCodeSettings(
            testProjectDir,
            '/path/to/godot5',
            5.0,
            false,
        );
        writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        writtenSettings = JSON.parse(writeCall[1] as string);
        expect(writtenSettings['godotTools.editorPath.godot5']).toBe(
            '/path/to/godot5',
        );
    });

    test('should preserve user file excludes when merging', async () => {
        const existingSettings = {
            'files.exclude': {
                '**/.DS_Store': true,
                '**/Thumbs.db': true,
                '**/*.tmp': true,
            },
        };

        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existingSettings, null, 4),
        );

        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // All user excludes should be preserved
        expect(writtenSettings['files.exclude']['**/.DS_Store']).toBe(true);
        expect(writtenSettings['files.exclude']['**/Thumbs.db']).toBe(true);
        expect(writtenSettings['files.exclude']['**/*.tmp']).toBe(true);
        // Launcher exclude should be added
        expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
    });

    test('should back up corrupted JSON before creating a new file', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            '{ invalid json content }',
        );
        const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1712345678904);

        const recoveredFiles = await updateVSCodeSettings(
            testProjectDir,
            '/path/to/godot',
            4,
            false,
        );

        const settingsFile = path.resolve(
            testProjectDir,
            '.vscode',
            'settings.json',
        );
        const backupFile = `${settingsFile}.1712345678904.bad`;
        expect(recoveredFiles).toEqual([backupFile]);
        expect(fs.promises.rename).toHaveBeenCalledWith(
            settingsFile,
            backupFile,
        );
        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Should have fresh launcher settings
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
            '/path/to/godot',
        );
        expect(writtenSettings['editor.tabSize']).toBe(4);
        dateNowSpy.mockRestore();
    });

    test('should handle empty settings.json file', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue('{}');

        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
            '/path/to/godot',
        );
        expect(writtenSettings['editor.tabSize']).toBe(4);
    });

    test('should parse settings with comments (JSONC) without backup', async () => {
        const jsoncContent = `{
    // This is a comment
    "editor.fontSize": 14,
    /* Multi-line
       comment */
    "files.exclude": {
        "**/.git": true
    }
}`;

        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(jsoncContent);

        const recoveredFiles = await updateVSCodeSettings(
            testProjectDir,
            '/path/to/godot',
            4,
            false,
        );

        expect(recoveredFiles).toEqual([]);
        expect(fs.promises.rename).not.toHaveBeenCalled();
        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettingsText = writeCall[1] as string;
        expect(writtenSettingsText).toContain('// This is a comment');
        expect(writtenSettingsText).toContain('/* Multi-line');
        const writtenSettings = parseJSONC(writtenSettingsText);

        expect(writtenSettings['editor.fontSize']).toBe(14);
        expect(writtenSettings['files.exclude']['**/.git']).toBe(true);
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
            '/path/to/godot',
        );
    });

    test('should parse settings with trailing commas without backup', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    "editor.fontSize": 14,
    "files.exclude": {
        "**/.git": true,
    },
}`);

        const recoveredFiles = await updateVSCodeSettings(
            testProjectDir,
            '/path/to/godot',
            4,
            false,
        );

        expect(recoveredFiles).toEqual([]);
        expect(fs.promises.rename).not.toHaveBeenCalled();
        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = parseJSONC(writeCall[1] as string);
        expect(writtenSettings['editor.fontSize']).toBe(14);
        expect(writtenSettings['files.exclude']['**/.git']).toBe(true);
    });

    test('should preserve comments inside files.exclude when adding launcher exclude', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    "editor.fontSize": 14,
    "files.exclude": {
        "**/.git": true, // keep git hidden
    }
}`);

        const recoveredFiles = await updateVSCodeSettings(
            testProjectDir,
            '/path/to/godot',
            4,
            false,
        );

        expect(recoveredFiles).toEqual([]);
        expect(fs.promises.rename).not.toHaveBeenCalled();
        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettingsText = writeCall[1] as string;
        expect(writtenSettingsText).toContain('// keep git hidden');
        const writtenSettings = parseJSONC(writtenSettingsText);
        expect(writtenSettings['files.exclude']['**/.git']).toBe(true);
        expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
    });

    test('should not rewrite current JSONC settings', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    "godotTools.editorPath.godot4": "/path/to/godot",
    "editor.tabSize": 4,
    "editor.insertSpaces": false,
    "files.eol": "\\n",
    "files.exclude": {
        "**/*.gd.uid": true,
        "**/*.cs.uid": true, // keep launcher exclude
    }
}`);

        const recoveredFiles = await updateVSCodeSettings(
            testProjectDir,
            '/path/to/godot',
            4,
            false,
        );

        expect(recoveredFiles).toEqual([]);
        expect(fs.promises.rename).not.toHaveBeenCalled();
        expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    test('should overwrite launcher-managed keys but preserve others', async () => {
        const existingSettings = {
            'godotTools.editorPath.godot4': '/old/path',
            'editor.tabSize': 2,
            'editor.insertSpaces': true,
            'files.eol': '\r\n',
            'editor.fontSize': 14,
            'workbench.colorTheme': 'Dark+',
        };

        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existingSettings, null, 4),
        );

        await updateVSCodeSettings(testProjectDir, '/new/path', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Launcher-managed keys should be overwritten
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
            '/new/path',
        );
        expect(writtenSettings['editor.tabSize']).toBe(4);
        expect(writtenSettings['editor.insertSpaces']).toBe(false);
        expect(writtenSettings['files.eol']).toBe('\n');

        // User settings should be preserved
        expect(writtenSettings['editor.fontSize']).toBe(14);
        expect(writtenSettings['workbench.colorTheme']).toBe('Dark+');
    });

    test('should handle nested objects in existing settings', async () => {
        const existingSettings = {
            '[gdscript]': {
                'editor.defaultFormatter': 'geequlim.godot-tools',
            },
            'files.associations': {
                '*.gd': 'gdscript',
                '*.tres': 'gdresource',
            },
        };

        vi.mocked(fs.existsSync).mockImplementation((p) =>
            p.toString().endsWith('settings.json'),
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existingSettings, null, 4),
        );

        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Nested objects should be preserved
        expect(writtenSettings['[gdscript]']['editor.defaultFormatter']).toBe(
            'geequlim.godot-tools',
        );
        expect(writtenSettings['files.associations']['*.gd']).toBe('gdscript');
        expect(writtenSettings['files.associations']['*.tres']).toBe(
            'gdresource',
        );

        // New settings should be added
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
            '/path/to/godot',
        );
    });
});
