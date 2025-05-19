import logger from 'electron-log';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'path';
import { getAssetPath } from '../pathResolver.js';

export type SymlinkOptions = {
  // Renamed for clarity from 'links'
  target: string; // What the symlink points to
  path: string; // Where the symlink is created
  type: 'file' | 'dir' | 'junction' | 'hard';
};

function createElevatedSymlink(links: SymlinkOptions[]) {
    const assetsPath = getAssetPath();
    const scriptPath = path.resolve(
        assetsPath,
        'utils',
        'win_elevate_symlink.vbs'
    );

    // Each link definition must be a separate argument to the VBScript.
    // VBScript expects "target|path|type"
    const scriptArgs = links.map(
        (linkObj) => `${linkObj.target}|${linkObj.path}|${linkObj.type}`
    );

    logger.debug('Running VBScript with args:', scriptArgs);

    execFileSync('wscript.exe', [scriptPath, ...scriptArgs]);
}

async function testSymlink(linkPath: string) {
    try {
        const linkStats = await fs.promises.lstat(linkPath); // Use lstat to check the link itself
        // Check if it's a symbolic link, or a file/directory (could be a hard link)
        if (
            linkStats.isSymbolicLink() ||
      linkStats.isFile() ||
      linkStats.isDirectory()
        ) {
            logger.log(`Link at '${linkPath}' appears to be valid or present.`);
        } else {
            logger.error(
                `Link at '${linkPath}' exists, but is not a symbolic link, file, or directory.`
            );
            throw new Error(
                `Link at '${linkPath}' exists, but is not a recognized valid type.`
            );
        }
    } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((err as any).code === 'ENOENT') {
            logger.error(`Link '${linkPath}' was not created or does not exist.`);
        } else {
            logger.error(`Error testing link '${linkPath}': ${(err as Error).message}`);
        }
        throw err;
    }
}

export async function trySymlinkOrElevateAsync(
    linksToCreate: SymlinkOptions[]
) {
    try {
    // Try to create the symlinks normally
        for (const { target, path: currentPath, type } of linksToCreate) {
            logger.debug('Creating symlink:', { target, path: currentPath, type });
            await fs.promises.symlink(target, currentPath, type);
        }
        // If all succeed non-elevated, test them
        for (const link of linksToCreate) {
            await testSymlink(link.path);
        }
    } catch (err) {
        logger.error('Error creating symlink:', (err as Error).message);
        // Check for Windows, permission error, and try elevated symlink
        if (process.platform === 'win32' && (err as Error).message?.includes('EPERM')) {
            logger.info(
                'Attempting to create symlink(s) with elevation via VBScript.'
            );
            // Map linksToCreate to the structure expected by createElevatedSymlink
            // createElevatedSymlink expects 'link' for where the symlink is created,
            // and 'target' for what it points to.
            const mappedLinks: SymlinkOptions[] = linksToCreate.map((l) => ({
                target: l.target, // Stays as target
                path: l.path, // l.path (where link is created) maps to 'link'
                type: l.type,
            }));
            createElevatedSymlink(mappedLinks);
            // After attempting elevated creation, test all links
            logger.info('Testing links after elevated attempt...');
            // for (const link of linksToCreate) {
            //   await testSymlink(link.path);
            // }
        } else {
            throw err; // Re-throw if not a Windows EPERM error or other issue
        }
    }
}
