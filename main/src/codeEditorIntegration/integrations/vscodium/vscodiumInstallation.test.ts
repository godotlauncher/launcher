import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platformMocks = vi.hoisted(() => ({
    findExecutable: vi.fn(),
}));

vi.mock('../../../utils/platform.utils.js', () => platformMocks);
vi.mock('electron-log', () => ({ default: { debug: vi.fn() } }));
vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
vi.mock('node:fs', () => ({
    accessSync: vi.fn(),
    closeSync: vi.fn(),
    constants: { X_OK: 1 },
    openSync: vi.fn(),
    readFileSync: vi.fn(),
    readSync: vi.fn(),
    realpathSync: vi.fn((value: string) => value),
    statSync: vi.fn(),
}));

const stableProduct = JSON.stringify({
    applicationName: 'codium',
    nameShort: 'VSCodium',
    quality: 'stable',
    version: '1.99.0',
});

function mockExistingFiles(): void {
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as never);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        return filePath.toString().endsWith('product.json')
            ? stableProduct
            : '';
    });
}

describe('VSCodium installation resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        platformMocks.findExecutable.mockResolvedValue(null);
        mockExistingFiles();
    });

    it('validates a Windows desktop layout and resolves codium.cmd for Godot', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        const { getVSCodiumInstallation, resolveVSCodiumGodotConfiguration } =
            await import('./vscodiumInstallation.js');
        const executablePath = 'C:\\Program Files\\VSCodium\\VSCodium.exe';

        await expect(getVSCodiumInstallation(executablePath)).resolves.toEqual({
            path: executablePath,
            version: '1.99.0',
        });
        expect(
            resolveVSCodiumGodotConfiguration(
                executablePath,
                '{project} --goto {file}:{line}:{col}',
            ),
        ).toEqual({
            execPath: 'C:\\Program Files\\VSCodium\\bin\\codium.cmd',
            execFlags: '{project} --goto {file}:{line}:{col}',
        });
    });

    it('accepts the native macOS bundle ID and declared executable', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        vi.mocked(execFile).mockImplementation(((
            _file,
            _args,
            _options,
            callback,
        ) => {
            callback?.(
                null,
                JSON.stringify({
                    CFBundleIdentifier: 'com.vscodium',
                    CFBundleExecutable: 'VSCodium',
                    CFBundleShortVersionString: '1.99.0',
                }),
                '',
            );
            return undefined;
        }) as typeof execFile);
        const { getVSCodiumInstallation } = await import(
            './vscodiumInstallation.js'
        );

        await expect(
            getVSCodiumInstallation('/Applications/VSCodium.app'),
        ).resolves.toEqual({
            path: '/Applications/VSCodium.app/Contents/MacOS/VSCodium',
            version: '1.99.0',
        });
    });

    it('validates Linux product metadata without executing VSCodium', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        const { getVSCodiumInstallation } = await import(
            './vscodiumInstallation.js'
        );

        await expect(
            getVSCodiumInstallation('/usr/bin/codium'),
        ).resolves.toEqual({
            path: '/usr/bin/codium',
            version: '1.99.0',
        });
        expect(execFile).not.toHaveBeenCalled();
    });

    it('validates the stable Snap from its mounted manifest and product metadata', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
            if (filePath.toString().endsWith('snap.yaml')) {
                return 'name: codium\nversion: 1.99.0\n';
            }
            return stableProduct;
        });
        const { getVSCodiumInstallation } = await import(
            './vscodiumInstallation.js'
        );

        await expect(
            getVSCodiumInstallation('/snap/bin/codium'),
        ).resolves.toEqual({
            path: '/snap/bin/codium',
            version: '1.99.0',
        });
        expect(execFile).not.toHaveBeenCalled();
    });

    it('uses machine-readable Flatpak metadata and preserves the launch prefix', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        vi.mocked(execFile).mockImplementation(((
            _file,
            args,
            _options,
            callback,
        ) => {
            const output = args.includes('--show-ref')
                ? 'app/com.vscodium.codium/x86_64/stable'
                : '1.99.0';
            callback?.(null, output, '');
            return undefined;
        }) as typeof execFile);
        const { resolveVSCodiumGodotConfiguration } = await import(
            './vscodiumInstallation.js'
        );
        const { resolveFlatpakVSCodium } = await import(
            './vscodiumInstallation.linux.js'
        );

        await expect(
            resolveFlatpakVSCodium('/usr/bin/flatpak'),
        ).resolves.toEqual({
            path: '/usr/bin/flatpak',
            version: '1.99.0',
        });
        expect(
            resolveVSCodiumGodotConfiguration(
                '/usr/bin/flatpak',
                '--goto {file}:{line}:{col}',
            ),
        ).toEqual({
            execPath: '/usr/bin/flatpak',
            execFlags: 'run com.vscodium.codium --goto {file}:{line}:{col}',
        });
    });

    it('does not execute a manually selected Flatpak command', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        const { getVSCodiumInstallation } = await import(
            './vscodiumInstallation.js'
        );

        await expect(
            getVSCodiumInstallation('/custom/bin/flatpak'),
        ).resolves.toBeNull();
        expect(execFile).not.toHaveBeenCalled();
    });

    it('rejects unstable or unrelated product metadata', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        vi.mocked(fs.readFileSync).mockReturnValue(
            JSON.stringify({
                applicationName: 'code',
                nameShort: 'Visual Studio Code',
                quality: 'stable',
            }),
        );
        const { getVSCodiumInstallation } = await import(
            './vscodiumInstallation.js'
        );

        await expect(
            getVSCodiumInstallation('/usr/bin/codium'),
        ).resolves.toBeNull();
    });
});
