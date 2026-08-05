import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import logger from 'electron-log';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    findWindowsVSCodium,
    resolveWindowsRegistryExecutablePath,
} from './vscodiumInstallation.windows.js';

const platformMocks = vi.hoisted(() => ({
    findExecutable: vi.fn(),
}));

vi.mock('../../../utils/platform.utils.js', () => platformMocks);
vi.mock('electron-log', () => ({ default: { debug: vi.fn() } }));
vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
vi.mock('node:fs', () => ({
    constants: { X_OK: 1 },
    readFileSync: vi.fn(),
    realpathSync: vi.fn((value: string) => value),
    statSync: vi.fn(),
}));

const stableProduct = JSON.stringify({
    applicationName: 'codium',
    nameShort: 'VSCodium',
    quality: 'stable',
    version: '1.99.0',
});
const registryExecutable = path.win32.resolve(
    'C:\\Windows',
    'System32',
    'reg.exe',
);
const existingFiles = new Set<string>();
const validInstallations = new Set<string>();
const environmentKeys = [
    'SystemRoot',
    'WINDIR',
    'LOCALAPPDATA',
    'APPDATA',
    'ProgramW6432',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'USERPROFILE',
    'SCOOP',
    'SCOOP_GLOBAL',
    'ProgramData',
    'ChocolateyToolsLocation',
] as const;

function normalize(candidatePath: string): string {
    return path.win32.normalize(candidatePath).toLowerCase();
}

function addExistingFile(candidatePath: string): void {
    existingFiles.add(normalize(candidatePath));
}

function addValidInstallation(executablePath: string): void {
    addExistingFile(executablePath);
    validInstallations.add(normalize(executablePath));
}

function registryOutput(valueName: string, value: string): string {
    return `    ${valueName}    REG_SZ    ${value}\r\n`;
}

function setRegistryResponder(
    responder: (args: string[]) => string | null,
): void {
    vi.mocked(execFile).mockImplementation(((
        _file,
        args,
        _options,
        callback,
    ) => {
        const output = responder(args);
        if (output === null) {
            const error = Object.assign(new Error('Registry value not found'), {
                code: 1,
            });
            callback?.(error, '', '');
        } else {
            callback?.(null, output, '');
        }
        return undefined;
    }) as typeof execFile);
}

describe('Windows VSCodium installation detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        existingFiles.clear();
        validInstallations.clear();
        platformMocks.findExecutable.mockResolvedValue(null);
        for (const key of environmentKeys) {
            vi.stubEnv(key, '');
        }
        vi.stubEnv('SystemRoot', 'C:\\Windows');
        addExistingFile(registryExecutable);
        vi.mocked(fs.statSync).mockImplementation((candidatePath) => {
            if (existingFiles.has(normalize(candidatePath.toString()))) {
                return { isFile: () => true } as fs.Stats;
            }
            throw Object.assign(new Error('File not found'), {
                code: 'ENOENT',
            });
        });
        vi.mocked(fs.readFileSync).mockImplementation((candidatePath) => {
            const productPath = normalize(candidatePath.toString());
            for (const executablePath of validInstallations) {
                const expectedProductPath = normalize(
                    path.win32.resolve(
                        path.win32.dirname(executablePath),
                        'resources',
                        'app',
                        'product.json',
                    ),
                );
                if (productPath === expectedProductPath) {
                    return stableProduct;
                }
            }
            throw Object.assign(new Error('File not found'), {
                code: 'ENOENT',
            });
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('treats missing registry values as an unavailable installation', async () => {
        setRegistryResponder(() => null);

        await expect(findWindowsVSCodium()).resolves.toBeNull();

        expect(execFile).toHaveBeenCalled();
        expect(
            vi
                .mocked(execFile)
                .mock.calls.every(
                    ([executablePath]) => executablePath === registryExecutable,
                ),
        ).toBe(true);
        const registryViews = new Set(
            vi.mocked(execFile).mock.calls.map(([, args]) => args.at(-1)),
        );
        expect(registryViews).toEqual(new Set(['/reg:64', '/reg:32']));
        expect(logger.debug).not.toHaveBeenCalled();
    });

    it('uses a validated current-user Inno installation first', async () => {
        const installationRoot = 'D:\\Apps\\VSCodium User';
        const executablePath = path.win32.resolve(
            installationRoot,
            'VSCodium.exe',
        );
        addValidInstallation(executablePath);
        setRegistryResponder((args) =>
            args[1]?.includes('2E1F05D1-C245-4562-81EE-28188DB6FD17') &&
            args.at(-1) === '/reg:64'
                ? registryOutput('InstallLocation', installationRoot)
                : null,
        );

        await expect(findWindowsVSCodium()).resolves.toEqual({
            path: executablePath,
            version: '1.99.0',
        });

        expect(
            vi
                .mocked(execFile)
                .mock.calls.every(([, args]) => args[1]?.startsWith('HKCU\\')),
        ).toBe(true);
    });

    it('accepts an MSI vendor path with spaces and non-ASCII characters', async () => {
        const installationRoot = 'D:\\Éditeurs\\VSCodium Custom';
        const executablePath = path.win32.resolve(
            installationRoot,
            'VSCodium.exe',
        );
        addValidInstallation(executablePath);
        setRegistryResponder((args) =>
            args[1] === 'HKLM\\SOFTWARE\\VSCodium\\VSCodium' &&
            args.at(-1) === '/reg:64'
                ? registryOutput('Path', installationRoot)
                : null,
        );

        await expect(findWindowsVSCodium()).resolves.toEqual({
            path: executablePath,
            version: '1.99.0',
        });
    });

    it('rejects a stale registry entry and uses the conventional user path', async () => {
        const staleRoot = 'D:\\Stale VSCodium';
        addExistingFile(path.win32.resolve(staleRoot, 'VSCodium.exe'));
        const localAppData = 'C:\\Users\\Tester\\AppData\\Local';
        vi.stubEnv('LOCALAPPDATA', localAppData);
        const executablePath = path.win32.resolve(
            localAppData,
            'Programs',
            'VSCodium',
            'VSCodium.exe',
        );
        addValidInstallation(executablePath);
        setRegistryResponder((args) =>
            args[1]?.includes('2E1F05D1-C245-4562-81EE-28188DB6FD17')
                ? registryOutput('InstallLocation', staleRoot)
                : null,
        );

        await expect(findWindowsVSCodium()).resolves.toEqual({
            path: executablePath,
            version: '1.99.0',
        });
    });

    it('skips registry commands when the Windows directory is unavailable', async () => {
        expect(
            resolveWindowsRegistryExecutablePath({
                SystemRoot: 'C:\\Windows',
            }),
        ).toBe(registryExecutable);
        expect(
            resolveWindowsRegistryExecutablePath({
                WINDIR: 'D:\\Windows',
            }),
        ).toBe(path.win32.resolve('D:\\Windows', 'System32', 'reg.exe'));

        vi.stubEnv('SystemRoot', '');
        vi.stubEnv('WINDIR', '');
        const localAppData = 'C:\\Users\\Tester\\AppData\\Local';
        vi.stubEnv('LOCALAPPDATA', localAppData);
        const executablePath = path.win32.resolve(
            localAppData,
            'Programs',
            'VSCodium',
            'VSCodium.exe',
        );
        addValidInstallation(executablePath);

        await expect(findWindowsVSCodium()).resolves.toEqual({
            path: executablePath,
            version: '1.99.0',
        });
        expect(execFile).not.toHaveBeenCalled();
    });
});
