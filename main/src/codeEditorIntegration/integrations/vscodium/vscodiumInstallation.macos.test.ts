import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findMacOSVSCodium } from './vscodiumInstallation.macos.js';

const platformMocks = vi.hoisted(() => ({
    findExecutable: vi.fn(),
}));

vi.mock('../../../utils/platform.utils.js', () => platformMocks);
vi.mock('electron-log', () => ({ default: { debug: vi.fn() } }));
vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
vi.mock('node:fs', () => ({
    accessSync: vi.fn(),
    constants: { X_OK: 1 },
    readFileSync: vi.fn(),
    realpathSync: vi.fn((value: string) => value),
    statSync: vi.fn(),
}));

const bundleInfo = {
    CFBundleIdentifier: 'com.vscodium',
    CFBundleExecutable: 'VSCodium',
    CFBundleShortVersionString: '1.99.0',
};
const stableProduct = JSON.stringify({
    applicationName: 'codium',
    nameShort: 'VSCodium',
    quality: 'stable',
    version: '1.99.0',
});

describe('macOS VSCodium automatic detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        platformMocks.findExecutable.mockResolvedValue(null);
        vi.mocked(fs.statSync).mockImplementation(() => {
            throw new Error('File not found');
        });
        vi.mocked(execFile).mockImplementation(((
            _file,
            _args,
            _options,
            callback,
        ) => {
            callback?.(new Error('Bundle not found'), '', '');
            return undefined;
        }) as typeof execFile);
    });

    it('prefers the system application bundle over command-line installations', async () => {
        const executablePath = path.posix.resolve(
            '/Applications/VSCodium.app',
            'Contents',
            'MacOS',
            'VSCodium',
        );
        vi.mocked(fs.statSync).mockImplementation((candidatePath) => {
            if (candidatePath.toString() === executablePath) {
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
            callback?.(null, JSON.stringify(bundleInfo), '');
            return undefined;
        }) as typeof execFile);

        await expect(findMacOSVSCodium()).resolves.toEqual({
            path: executablePath,
            version: '1.99.0',
        });
        expect(platformMocks.findExecutable).not.toHaveBeenCalled();
    });

    it('falls back to a validated command on PATH', async () => {
        const executablePath = '/custom/bin/codium';
        platformMocks.findExecutable.mockImplementation(async (command) =>
            command === 'codium' ? executablePath : null,
        );
        vi.mocked(fs.statSync).mockImplementation((candidatePath) => {
            if (candidatePath.toString() === executablePath) {
                return { isFile: () => true } as fs.Stats;
            }
            throw new Error('File not found');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(stableProduct);

        await expect(findMacOSVSCodium()).resolves.toEqual({
            path: executablePath,
            version: '1.99.0',
        });
        expect(platformMocks.findExecutable).toHaveBeenCalledWith('codium');
    });
});
