import { promises as fs } from 'node:fs';
import path from 'node:path';

const HELPER_FILE_NAME = 'godot-launcher-git-askpass.exe';

export type GitAskPassExecutableLocation = {
    architecture: NodeJS.Architecture;
    isPackaged: boolean;
    appPath: string;
    resourcesPath: string;
};

/**
 * Resolves and verifies the Windows askpass executable.
 *
 * @param location - Runtime paths and target Windows architecture.
 * @returns The verified regular, non-symlink helper path.
 */
export async function resolveWindowsGitAskPassExecutable(
    location: GitAskPassExecutableLocation,
): Promise<string> {
    if (location.architecture !== 'x64' && location.architecture !== 'arm64') {
        throw new Error('Unsupported Windows askpass architecture');
    }
    const executablePath = location.isPackaged
        ? path.join(
              location.resourcesPath,
              'git-credentials-helper',
              HELPER_FILE_NAME,
          )
        : path.join(
              location.appPath,
              'native',
              'git-credentials-helper',
              'windows-askpass',
              'out',
              `win32-${location.architecture}`,
              HELPER_FILE_NAME,
          );
    const stats = await fs.lstat(executablePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error('Windows askpass executable is not a regular file');
    }
    return executablePath;
}
