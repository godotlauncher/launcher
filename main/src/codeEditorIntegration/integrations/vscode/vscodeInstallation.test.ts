import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { findExecutable } from '../../../utils/platform.utils.js';

const childProcessMocks = vi.hoisted(() => ({
    execFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
    execFile: childProcessMocks.execFile,
}));

vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../../utils/platform.utils.js', () => ({
    findExecutable: vi.fn(),
}));

vi.mock('node:fs', () => ({
    default: {
        accessSync: vi.fn(),
        constants: {
            X_OK: 1,
        },
        existsSync: vi.fn(),
        statSync: vi.fn(),
    },
    accessSync: vi.fn(),
    constants: {
        X_OK: 1,
    },
    existsSync: vi.fn(),
    statSync: vi.fn(),
}));

describe('getVSCodeInstallPath', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        childProcessMocks.execFile.mockImplementation(
            (
                _file: string,
                _args: string[],
                _options: object,
                callback: (
                    error: Error | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => {
                callback(
                    null,
                    JSON.stringify({
                        CFBundleIdentifier: 'com.microsoft.VSCode',
                        CFBundleExecutable: 'Code',
                    }),
                    '',
                );
            },
        );
        vi.mocked(findExecutable).mockResolvedValue(null);
        vi.mocked(fs.accessSync).mockReturnValue(undefined);
        vi.mocked(fs.statSync).mockReturnValue({
            isFile: () => true,
        } as fs.Stats);
    });

    test('returns null on unsupported platform', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'sunos',
            configurable: true,
        });

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        const res = await mod.getVSCodeInstallPath();
        expect(res).toBeNull();

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test('returns a supported custom executable', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        vi.mocked(fs.existsSync).mockImplementation(
            (p) => p === '/custom/code',
        );
        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        const res = await mod.getVSCodeInstallPath('/custom/code');
        expect(res).toBe('/custom/code');

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test('rejects an unrelated custom executable without falling back', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');

        await expect(
            mod.getVSCodeInstallPath('/custom/editor'),
        ).resolves.toBeNull();
        expect(findExecutable).not.toHaveBeenCalled();

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test('rejects a directory named like the supported executable', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue({
            isFile: () => false,
        } as fs.Stats);
        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');

        await expect(
            mod.getVSCodeInstallPath('/custom/code'),
        ).resolves.toBeNull();

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
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

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        const res = await mod.getVSCodeInstallPath();
        expect(res).toBe(
            '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
        );
        expect(childProcessMocks.execFile).toHaveBeenCalledWith(
            '/usr/bin/plutil',
            [
                '-convert',
                'json',
                '-o',
                '-',
                '/Applications/Visual Studio Code.app/Contents/Info.plist',
            ],
            { encoding: 'utf8', timeout: 3000 },
            expect.any(Function),
        );

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test('supports the legacy macOS executable declared by the bundle', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'darwin',
            configurable: true,
        });
        childProcessMocks.execFile.mockImplementation(
            (
                _file: string,
                _args: string[],
                _options: object,
                callback: (
                    error: Error | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => {
                callback(
                    null,
                    JSON.stringify({
                        CFBundleIdentifier: 'com.microsoft.VSCode',
                        CFBundleExecutable: 'Electron',
                    }),
                    '',
                );
            },
        );
        vi.mocked(fs.existsSync).mockImplementation((candidate) =>
            String(candidate).includes('Visual Studio Code.app'),
        );

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        await expect(mod.getVSCodeInstallPath()).resolves.toBe(
            '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
        );

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test.each([
        [
            'an unexpected bundle identifier',
            {
                CFBundleIdentifier: 'com.example.NotVSCode',
                CFBundleExecutable: 'Code',
            },
        ],
        [
            'an unsafe executable name',
            {
                CFBundleIdentifier: 'com.microsoft.VSCode',
                CFBundleExecutable: '../Code',
            },
        ],
    ])('rejects a macOS bundle with %s', async (_description, bundleInfo) => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'darwin',
            configurable: true,
        });
        childProcessMocks.execFile.mockImplementation(
            (
                _file: string,
                _args: string[],
                _options: object,
                callback: (
                    error: Error | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => {
                callback(null, JSON.stringify(bundleInfo), '');
            },
        );
        vi.mocked(fs.existsSync).mockReturnValue(true);

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        await expect(mod.getVSCodeInstallPath()).resolves.toBeNull();

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test('rejects a macOS bundle when its metadata cannot be read', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'darwin',
            configurable: true,
        });
        childProcessMocks.execFile.mockImplementation(
            (
                _file: string,
                _args: string[],
                _options: object,
                callback: (
                    error: Error | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => {
                callback(new Error('plist unavailable'), '', '');
            },
        );
        vi.mocked(fs.existsSync).mockReturnValue(true);

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        await expect(mod.getVSCodeInstallPath()).resolves.toBeNull();

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

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        const res = await mod.getVSCodeInstallPath();
        expect(res).toBeTruthy();
        expect(String(res)).toMatch(/Code\.exe$/i);
        expect(findExecutable).not.toHaveBeenCalled();

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
        process.env.LOCALAPPDATA = originalLocal;
    });

    test('prefers the Linux VS Code executable found on PATH', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        vi.mocked(findExecutable).mockResolvedValue('/opt/vscode/bin/code');
        vi.mocked(fs.existsSync).mockImplementation((candidate) =>
            ['/opt/vscode/bin/code', '/usr/bin/code'].includes(
                String(candidate),
            ),
        );

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        await expect(mod.getVSCodeInstallPath()).resolves.toBe(
            '/opt/vscode/bin/code',
        );
        expect(findExecutable).toHaveBeenCalledWith('code');

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test.each(['/usr/bin/code', '/snap/bin/code'])(
        'finds the Linux VS Code executable at %s when PATH lookup fails',
        async (executablePath) => {
            const original = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                configurable: true,
            });
            vi.mocked(fs.existsSync).mockImplementation(
                (candidate) => candidate === executablePath,
            );

            const mod = await vi.importActual<
                typeof import('./vscodeInstallation.js')
            >('./vscodeInstallation.js');
            await expect(mod.getVSCodeInstallPath()).resolves.toBe(
                executablePath,
            );
            expect(findExecutable).toHaveBeenCalledWith('code');

            Object.defineProperty(process, 'platform', {
                value: original,
                configurable: true,
            });
        },
    );

    test('does not detect the internal Linux VS Code Electron binary', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        vi.mocked(fs.existsSync).mockImplementation(
            (candidate) => candidate === '/usr/share/code/code',
        );

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        await expect(mod.getVSCodeInstallPath()).resolves.toBeNull();

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test('rejects a Linux VS Code launcher without execute permission', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        vi.mocked(fs.existsSync).mockImplementation(
            (candidate) => candidate === '/usr/bin/code',
        );
        vi.mocked(fs.accessSync).mockImplementation(() => {
            throw new Error('permission denied');
        });

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        await expect(mod.getVSCodeInstallPath()).resolves.toBeNull();

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test.each([
        ['win32', 'C:\\Portable\\VS Code\\bin\\code.cmd'],
        ['darwin', '/usr/local/bin/code'],
        ['linux', '/opt/vscode/bin/code'],
    ] as const)(
        'finds a %s VS Code executable on PATH',
        async (platform, executablePath) => {
            const original = process.platform;
            Object.defineProperty(process, 'platform', {
                value: platform,
                configurable: true,
            });
            vi.mocked(fs.existsSync).mockImplementation(
                (candidate) => candidate === executablePath,
            );
            vi.mocked(findExecutable).mockResolvedValue(executablePath);

            const mod = await vi.importActual<
                typeof import('./vscodeInstallation.js')
            >('./vscodeInstallation.js');
            await expect(mod.getVSCodeInstallPath()).resolves.toBe(
                executablePath,
            );
            expect(findExecutable).toHaveBeenCalledWith('code');

            Object.defineProperty(process, 'platform', {
                value: original,
                configurable: true,
            });
        },
    );

    test('rejects a nonexistent executable found on PATH', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(findExecutable).mockResolvedValue('/missing/code');

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        await expect(mod.getVSCodeInstallPath()).resolves.toBeNull();

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });

    test('returns null when default locations and PATH lookup fail', async () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');
        await expect(mod.getVSCodeInstallPath()).resolves.toBeNull();
        expect(findExecutable).toHaveBeenCalledWith('code');

        Object.defineProperty(process, 'platform', {
            value: original,
            configurable: true,
        });
    });
});

describe('resolveVSCodeGodotExecPath', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test.each(['darwin', 'linux'] as const)(
        'passes the installation path through on %s',
        async (platform) => {
            vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
            const installationPath = path.resolve('tools', 'code');
            const mod = await vi.importActual<
                typeof import('./vscodeInstallation.js')
            >('./vscodeInstallation.js');

            expect(mod.resolveVSCodeGodotExecPath(installationPath)).toBe(
                installationPath,
            );
        },
    );

    test('uses an existing code.cmd path directly on Windows', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        const installationPath = path.resolve('tools', 'code.cmd');
        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');

        expect(mod.resolveVSCodeGodotExecPath(installationPath)).toBe(
            installationPath,
        );
        expect(fs.existsSync).not.toHaveBeenCalled();
    });

    test('resolves Code.exe to the adjacent command script on Windows', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const installationPath = path.resolve('tools', 'Code.exe');
        const commandPath = path.resolve('tools', 'bin', 'code.cmd');
        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');

        expect(mod.resolveVSCodeGodotExecPath(installationPath)).toBe(
            commandPath,
        );
        expect(fs.existsSync).toHaveBeenCalledWith(commandPath);
    });

    test('keeps the Windows installation path when code.cmd is unavailable', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        const installationPath = path.resolve('tools', 'Code.exe');
        const mod = await vi.importActual<
            typeof import('./vscodeInstallation.js')
        >('./vscodeInstallation.js');

        expect(mod.resolveVSCodeGodotExecPath(installationPath)).toBe(
            installationPath,
        );
    });
});
