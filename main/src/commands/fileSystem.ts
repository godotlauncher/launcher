import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from '../i18n/index.js';

const FILESYSTEM_ERROR_KEYS = {
    pathRequired: 'common:filesystem.errors.pathRequired',
    pathMustBeAbsolute: 'common:filesystem.errors.pathMustBeAbsolute',
    targetNotDirectory: 'common:filesystem.errors.targetNotDirectory',
} as const;

function resolveAbsolutePath(pathToCheck: string): string {
    if (typeof pathToCheck !== 'string' || pathToCheck.trim().length === 0) {
        throw new Error(t(FILESYSTEM_ERROR_KEYS.pathRequired));
    }

    if (!path.isAbsolute(pathToCheck)) {
        throw new Error(t(FILESYSTEM_ERROR_KEYS.pathMustBeAbsolute));
    }

    return path.resolve(pathToCheck);
}

function isNotFoundError(error: unknown): boolean {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    return errorCode === 'ENOENT' || errorCode === 'ENOTDIR';
}

function isAlreadyExistsError(error: unknown): boolean {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    return errorCode === 'EEXIST';
}

export async function pathExists(pathToCheck: string): Promise<boolean> {
    const absolutePath = resolveAbsolutePath(pathToCheck);

    try {
        await fs.promises.lstat(absolutePath);
        return true;
    } catch (error) {
        if (isNotFoundError(error)) {
            return false;
        }
        throw error;
    }
}

export async function fileExists(pathToCheck: string): Promise<boolean> {
    const absolutePath = resolveAbsolutePath(pathToCheck);

    try {
        const stats = await fs.promises.stat(absolutePath);
        return stats.isFile();
    } catch (error) {
        if (isNotFoundError(error)) {
            return false;
        }
        throw error;
    }
}

export async function ensureDirectory(pathToCheck: string): Promise<boolean> {
    const absolutePath = resolveAbsolutePath(pathToCheck);

    try {
        const stats = await fs.promises.stat(absolutePath);
        if (!stats.isDirectory()) {
            throw new Error(t(FILESYSTEM_ERROR_KEYS.targetNotDirectory));
        }
        return true;
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }
    }

    try {
        await fs.promises.mkdir(absolutePath, { recursive: true });
        return true;
    } catch (error) {
        if (!isAlreadyExistsError(error)) {
            throw error;
        }
    }

    const stats = await fs.promises.stat(absolutePath);
    if (!stats.isDirectory()) {
        throw new Error(t(FILESYSTEM_ERROR_KEYS.targetNotDirectory));
    }

    return true;
}
