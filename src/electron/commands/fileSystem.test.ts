import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fileExists, pathExists } from './fileSystem.js';

const fsMocks = vi.hoisted(() => ({
    lstat: vi.fn(),
    stat: vi.fn(),
}));

vi.mock('node:fs', () => ({
    promises: {
        lstat: fsMocks.lstat,
        stat: fsMocks.stat,
    },
    default: {
        promises: {
            lstat: fsMocks.lstat,
            stat: fsMocks.stat,
        },
    },
}));

const { lstat, stat } = fsMocks;

const absoluteDirectoryPath = path.resolve('tmp', 'existing-directory');
const absoluteFilePath = path.resolve('tmp', 'existing-file.txt');
const missingPath = path.resolve('tmp', 'missing');
const invalidNestedPath = path.resolve('tmp', 'existing-file.txt', 'nested');
const relativePath = 'relative/path';

describe('fileSystem command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('pathExists returns true for an existing absolute directory', async () => {
        lstat.mockResolvedValue({});

        await expect(pathExists(absoluteDirectoryPath)).resolves.toBe(true);
    });

    it('pathExists returns true for an existing absolute file', async () => {
        lstat.mockResolvedValue({});

        await expect(pathExists(absoluteFilePath)).resolves.toBe(true);
    });

    it('pathExists returns false for missing absolute path (ENOENT)', async () => {
        const missingError = Object.assign(new Error('missing path'), {
            code: 'ENOENT',
        });
        lstat.mockRejectedValue(missingError);

        await expect(pathExists(missingPath)).resolves.toBe(false);
    });

    it('pathExists returns false for invalid nested path (ENOTDIR)', async () => {
        const invalidNestedError = Object.assign(new Error('invalid nested'), {
            code: 'ENOTDIR',
        });
        lstat.mockRejectedValue(invalidNestedError);

        await expect(pathExists(invalidNestedPath)).resolves.toBe(false);
    });

    it('pathExists throws for a relative path input', async () => {
        await expect(pathExists(relativePath)).rejects.toThrow(
            'pathExists requires an absolute path',
        );
    });

    it('pathExists rethrows unexpected fs errors', async () => {
        const accessError = Object.assign(new Error('permission denied'), {
            code: 'EACCES',
        });
        lstat.mockRejectedValue(accessError);

        await expect(pathExists(absoluteDirectoryPath)).rejects.toBe(
            accessError,
        );
    });

    it('fileExists returns true for an existing absolute file', async () => {
        stat.mockResolvedValue({
            isFile: () => true,
        });

        await expect(fileExists(absoluteFilePath)).resolves.toBe(true);
    });

    it('fileExists returns false for an existing absolute directory', async () => {
        stat.mockResolvedValue({
            isFile: () => false,
        });

        await expect(fileExists(absoluteDirectoryPath)).resolves.toBe(false);
    });

    it('fileExists returns false for missing absolute path (ENOENT)', async () => {
        const missingError = Object.assign(new Error('missing path'), {
            code: 'ENOENT',
        });
        stat.mockRejectedValue(missingError);

        await expect(fileExists(missingPath)).resolves.toBe(false);
    });

    it('fileExists returns false for invalid nested path (ENOTDIR)', async () => {
        const invalidNestedError = Object.assign(new Error('invalid nested'), {
            code: 'ENOTDIR',
        });
        stat.mockRejectedValue(invalidNestedError);

        await expect(fileExists(invalidNestedPath)).resolves.toBe(false);
    });

    it('fileExists throws for a relative path input', async () => {
        await expect(fileExists(relativePath)).rejects.toThrow(
            'fileExists requires an absolute path',
        );
    });

    it('fileExists rethrows unexpected fs errors', async () => {
        const accessError = Object.assign(new Error('permission denied'), {
            code: 'EACCES',
        });
        stat.mockRejectedValue(accessError);

        await expect(fileExists(absoluteFilePath)).rejects.toBe(accessError);
    });
});
