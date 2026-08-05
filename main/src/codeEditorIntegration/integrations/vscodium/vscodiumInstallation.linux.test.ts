import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findLinuxVSCodium } from './vscodiumInstallation.linux.js';

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

describe('Linux VSCodium automatic detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        platformMocks.findExecutable.mockResolvedValue(null);
        vi.mocked(fs.statSync).mockImplementation(() => {
            throw new Error('File not found');
        });
    });

    it('prefers the native system installation', async () => {
        vi.mocked(fs.statSync).mockImplementation((candidatePath) => {
            if (candidatePath.toString() === '/usr/bin/codium') {
                return { isFile: () => true } as fs.Stats;
            }
            throw new Error('File not found');
        });
        vi.mocked(fs.readFileSync).mockImplementation((candidatePath) => {
            if (
                candidatePath.toString() ===
                '/usr/share/codium/resources/app/product.json'
            ) {
                return stableProduct;
            }
            throw new Error('File not found');
        });

        await expect(findLinuxVSCodium()).resolves.toEqual({
            path: '/usr/bin/codium',
            version: '1.99.0',
        });
        expect(platformMocks.findExecutable).not.toHaveBeenCalled();
        expect(execFile).not.toHaveBeenCalled();
    });

    it('falls back to Flatpak after native and command candidates fail', async () => {
        vi.mocked(fs.statSync).mockImplementation((candidatePath) => {
            if (candidatePath.toString() === '/usr/bin/flatpak') {
                return { isFile: () => true } as fs.Stats;
            }
            throw new Error('File not found');
        });
        vi.mocked(execFile).mockImplementation(((
            _file,
            _args,
            _options,
            callback,
        ) => {
            callback?.(null, 'app/com.vscodium.codium/x86_64/stable', '');
            return undefined;
        }) as typeof execFile);

        await expect(findLinuxVSCodium()).resolves.toEqual({
            path: '/usr/bin/flatpak',
            version: null,
        });
        expect(platformMocks.findExecutable).toHaveBeenCalledWith('codium');
        expect(platformMocks.findExecutable).toHaveBeenCalledWith('vscodium');
        expect(execFile).toHaveBeenCalledWith(
            '/usr/bin/flatpak',
            ['info', '--show-ref', 'com.vscodium.codium'],
            expect.objectContaining({ windowsHide: true }),
            expect.any(Function),
        );
    });
});
