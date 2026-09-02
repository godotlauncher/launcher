import path from 'node:path';

const UNSAFE_ALTERNATE_OBJECT_PATH_PATTERN = /[\0\r\n]/u;

/**
 * Formats one absolute Git object directory for an alternates file.
 *
 * @param objectsDirectory - Absolute project Git object directory.
 * @param platform - Platform whose path rules should be applied.
 * @returns A safe single-line filesystem path.
 */
export function formatGitAlternateObjectPath(
    objectsDirectory: string,
    platform: NodeJS.Platform = process.platform,
): string {
    const pathModule = platform === 'win32' ? path.win32 : path.posix;
    if (
        !pathModule.isAbsolute(objectsDirectory) ||
        UNSAFE_ALTERNATE_OBJECT_PATH_PATTERN.test(objectsDirectory)
    ) {
        throw new Error('Git alternate object path is invalid');
    }
    return platform === 'win32'
        ? objectsDirectory.replaceAll('\\', '/')
        : objectsDirectory;
}
