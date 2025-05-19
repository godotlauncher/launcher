import * as fs from 'node:fs';
import * as path from 'node:path';
import { SymlinkOptions, trySymlinkOrElevateAsync } from './fs.utils.js';
import logger from 'electron-log';

export async function removeProjectReleaseEditorWindows(
    projectEditorPath: string,
    release: InstalledRelease
) {
    if (fs.existsSync(projectEditorPath)) {
    // remove all files based on mono or not
        const baseFileName = path.basename(release.editor_path);
        const exePath = path.resolve(projectEditorPath, baseFileName);
        const consolePath = path.resolve(
            projectEditorPath,
            baseFileName.replace('.exe', '_console.exe')
        );

        logger.debug('Removing project editor exe and console exe');
        logger.debug('Exe path:', exePath);
        logger.debug('Console path:', consolePath);
        logger.debug('Release mono:', release.mono);
        logger.debug('Release path:', release.editor_path);
        logger.debug('Project editor path:', projectEditorPath);
        logger.debug('base file name:', baseFileName);
        logger.debug(
            'Project editor path exists:',
            fs.existsSync(projectEditorPath)
        );
        logger.debug('Exe path exists:', fs.existsSync(exePath));
        logger.debug('Console path exists:', fs.existsSync(consolePath));

        if (fs.existsSync(exePath) && fs.existsSync(consolePath)) {
            logger.debug('Removing editor exe and console exe');
            await fs.promises.unlink(exePath);
            await fs.promises.unlink(consolePath);
        }

        if (release.mono) {
            const sharpDir = path.resolve(projectEditorPath, 'GodotSharp');

            if (fs.existsSync(sharpDir)) {
                await fs.promises.rmdir(sharpDir, { recursive: true });
            }
        }
    }
}

export async function removeProjectEditorWindows(
    project: ProjectDetails
): Promise<void> {
    await removeProjectReleaseEditorWindows(
        path.dirname(project.launch_path),
        project.release
    );
}

export async function setProjectEditorReleaseWindows(
    projectEditorPath: string,
    release: InstalledRelease,
    previousRelease?: InstalledRelease
): Promise<LaunchPath> {
    // remove previous editor
    if (previousRelease) {
        logger.debug('Removing previous editor');
        // remove exe, console.exe and GodotSharp folder
        await removeProjectReleaseEditorWindows(projectEditorPath, previousRelease);
    }

    logger.debug('Setting new editor');
    // set dstination paths
    const baseFileName = path.basename(release.editor_path);
    const dstExePath = path.resolve(projectEditorPath, baseFileName);
    const dstConsolePath = path.resolve(
        projectEditorPath,
        baseFileName.replace('.exe', '_console.exe')
    );
    const dstSharpDir = path.resolve(projectEditorPath, 'GodotSharp');

    // set source paths
    const srcExePath = path.resolve(release.install_path, baseFileName);
    const srcConsolePath = path.resolve(
        release.install_path,
        baseFileName.replace('.exe', '_console.exe')
    );
    const srcSharpDir = path.resolve(release.install_path, 'GodotSharp');

    // check if source paths exist
    if (fs.existsSync(srcExePath) && fs.existsSync(srcConsolePath)) {
        logger.debug('Source paths exist');

        // combine links
        const links: SymlinkOptions[] = [
            { target: srcExePath, path: dstExePath, type: 'file' },
            { target: srcConsolePath, path: dstConsolePath, type: 'file' },
        ];

        if (release.mono && fs.existsSync(srcSharpDir)) {
            links.push({
                target: srcSharpDir,
                path: dstSharpDir,
                type: 'dir',
            });
        }

        try {
            // try to symlink then use with elevated permissions
            await trySymlinkOrElevateAsync(links);
        } catch (error) {
            // if symlink fails, try to remove any existing files
            if (fs.existsSync(dstExePath)) {
                await fs.promises.unlink(dstExePath);
            }
            if (fs.existsSync(dstConsolePath)) {
                await fs.promises.unlink(dstConsolePath);
            }
            if (fs.existsSync(dstSharpDir)) {
                await fs.promises.unlink(dstSharpDir);
            }
            // then copy the files
            // this is a fallback for when symlinks are not supported
            await fs.promises.cp(srcExePath, dstExePath);
            await fs.promises.cp(srcConsolePath, dstConsolePath);
            if (release.mono && fs.existsSync(srcSharpDir)) {
                // copy the GodotSharp folder
                // this is a fallback for when symlinks are not supported
                await fs.promises.mkdir(dstSharpDir, { recursive: true });
                await fs.promises.cp(srcSharpDir, dstSharpDir, { recursive: true });
            }
        }
    }
    // create new editor

    return dstExePath;
}
