import * as fs from 'node:fs';
import * as path from 'node:path';

function resolveAbsolutePath(
    methodName: 'pathExists' | 'fileExists' | 'ensureDirectory',
    pathToCheck: string,
): string {
    if (typeof pathToCheck !== 'string' || pathToCheck.trim().length === 0) {
        throw new Error(`${methodName} requires a non-empty string path`);
    }

    if (!path.isAbsolute(pathToCheck)) {
        throw new Error(`${methodName} requires an absolute path`);
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

const ENSURE_DIRECTORY_CONFLICT_ERROR =
    'ensureDirectory target exists and is not a directory';

export async function pathExists(pathToCheck: string): Promise<boolean> {
    const absolutePath = resolveAbsolutePath('pathExists', pathToCheck);

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
    const absolutePath = resolveAbsolutePath('fileExists', pathToCheck);

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
    const absolutePath = resolveAbsolutePath('ensureDirectory', pathToCheck);

    try {
        const stats = await fs.promises.stat(absolutePath);
        if (!stats.isDirectory()) {
            throw new Error(ENSURE_DIRECTORY_CONFLICT_ERROR);
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
        throw new Error(ENSURE_DIRECTORY_CONFLICT_ERROR);
    }

    return true;
}
