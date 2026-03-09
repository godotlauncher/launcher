import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureDirectory, fileExists, pathExists } from './fileSystem.js';

const translatedErrors = {
    pathRequired: 'Path must be a non-empty string.',
    pathMustBeAbsolute: 'Path must be absolute.',
    targetNotDirectory: 'Target path exists but is not a directory.',
} as const;

const fsMocks = vi.hoisted(() => ({
    lstat: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
}));

const i18nMocks = vi.hoisted(() => ({
    t: vi.fn((key: string) => {
        switch (key) {
            case 'common:filesystem.errors.pathRequired':
                return 'Path must be a non-empty string.';
            case 'common:filesystem.errors.pathMustBeAbsolute':
                return 'Path must be absolute.';
            case 'common:filesystem.errors.targetNotDirectory':
                return 'Target path exists but is not a directory.';
            default:
                return key;
        }
    }),
}));

vi.mock('node:fs', () => ({
    promises: {
        lstat: fsMocks.lstat,
        stat: fsMocks.stat,
        mkdir: fsMocks.mkdir,
    },
    default: {
        promises: {
            lstat: fsMocks.lstat,
            stat: fsMocks.stat,
            mkdir: fsMocks.mkdir,
        },
    },
}));

vi.mock('../i18n/index.js', () => ({
    t: i18nMocks.t,
}));

const { lstat, stat, mkdir } = fsMocks;

const absoluteDirectoryPath = path.resolve('tmp', 'existing-directory');
const absoluteFilePath = path.resolve('tmp', 'existing-file.txt');
const missingPath = path.resolve('tmp', 'missing');
const invalidNestedPath = path.resolve('tmp', 'existing-file.txt', 'nested');
const relativePath = 'relative/path';
const ensureDirectoryConflictError = translatedErrors.targetNotDirectory;

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
            translatedErrors.pathMustBeAbsolute,
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
            translatedErrors.pathMustBeAbsolute,
        );
    });

    it('fileExists rethrows unexpected fs errors', async () => {
        const accessError = Object.assign(new Error('permission denied'), {
            code: 'EACCES',
        });
        stat.mockRejectedValue(accessError);

        await expect(fileExists(absoluteFilePath)).rejects.toBe(accessError);
    });

    it('ensureDirectory returns true for an existing absolute directory', async () => {
        stat.mockResolvedValue({
            isDirectory: () => true,
        });

        await expect(ensureDirectory(absoluteDirectoryPath)).resolves.toBe(
            true,
        );
    });

    it('ensureDirectory creates missing absolute directory and returns true', async () => {
        const missingError = Object.assign(new Error('missing path'), {
            code: 'ENOENT',
        });

        stat.mockRejectedValueOnce(missingError);
        mkdir.mockResolvedValue(undefined);

        await expect(ensureDirectory(missingPath)).resolves.toBe(true);
        expect(mkdir).toHaveBeenCalledWith(missingPath, { recursive: true });
    });

    it('ensureDirectory throws for a relative path input', async () => {
        await expect(ensureDirectory(relativePath)).rejects.toThrow(
            translatedErrors.pathMustBeAbsolute,
        );
    });

    it('ensureDirectory throws for an empty path input', async () => {
        await expect(ensureDirectory('')).rejects.toThrow(
            translatedErrors.pathRequired,
        );
    });

    it('ensureDirectory throws when target exists as a file', async () => {
        stat.mockResolvedValue({
            isDirectory: () => false,
        });

        await expect(ensureDirectory(absoluteFilePath)).rejects.toThrow(
            ensureDirectoryConflictError,
        );
    });

    it('ensureDirectory rethrows unexpected stat errors', async () => {
        const accessError = Object.assign(new Error('permission denied'), {
            code: 'EACCES',
        });
        stat.mockRejectedValue(accessError);

        await expect(ensureDirectory(absoluteDirectoryPath)).rejects.toBe(
            accessError,
        );
    });

    it('ensureDirectory rethrows unexpected mkdir errors', async () => {
        const missingError = Object.assign(new Error('missing path'), {
            code: 'ENOENT',
        });
        const accessError = Object.assign(new Error('permission denied'), {
            code: 'EACCES',
        });

        stat.mockRejectedValueOnce(missingError);
        mkdir.mockRejectedValueOnce(accessError);

        await expect(ensureDirectory(missingPath)).rejects.toBe(accessError);
    });

    it('ensureDirectory handles EEXIST race by rechecking directory', async () => {
        const missingError = Object.assign(new Error('missing path'), {
            code: 'ENOENT',
        });
        const alreadyExistsError = Object.assign(new Error('already exists'), {
            code: 'EEXIST',
        });

        stat.mockRejectedValueOnce(missingError).mockResolvedValueOnce({
            isDirectory: () => true,
        });
        mkdir.mockRejectedValueOnce(alreadyExistsError);

        await expect(ensureDirectory(missingPath)).resolves.toBe(true);
    });

    it('ensureDirectory throws conflict when EEXIST recheck is not a directory', async () => {
        const missingError = Object.assign(new Error('missing path'), {
            code: 'ENOENT',
        });
        const alreadyExistsError = Object.assign(new Error('already exists'), {
            code: 'EEXIST',
        });

        stat.mockRejectedValueOnce(missingError).mockResolvedValueOnce({
            isDirectory: () => false,
        });
        mkdir.mockRejectedValueOnce(alreadyExistsError);

        await expect(ensureDirectory(missingPath)).rejects.toThrow(
            ensureDirectoryConflictError,
        );
    });
});
