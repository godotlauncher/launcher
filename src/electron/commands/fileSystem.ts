import * as fs from 'node:fs';
import * as path from 'node:path';

function resolveAbsolutePath(
    methodName: 'pathExists' | 'fileExists',
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
