import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InstalledRelease, LaunchPath, ProjectDetails } from '@shared';
import logger from 'electron-log';

async function removeExistingEditorTarget(targetPath: string): Promise<void> {
    try {
        const stats = await fs.promises.lstat(targetPath);
        if (stats.isSymbolicLink()) {
            await fs.promises.unlink(targetPath);
            return;
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return;
        }
        throw error;
    }

    await fs.promises.rm(targetPath, {
        recursive: true,
        force: true,
    });
}

export async function removeProjectEditorDarwin(
    project: ProjectDetails,
): Promise<void> {
    if (!project.launch_path) {
        logger.debug('Skipping macOS project editor removal: missing path');
        return;
    }

    // remove editor files
    await removeExistingEditorTarget(project.launch_path);
}

export async function setProjectEditorReleaseDarwin(
    projectEditorPath: string,
    release: InstalledRelease,
    previousRelease?: InstalledRelease,
): Promise<LaunchPath> {
    // remove previous editor
    if (previousRelease?.editor_path) {
        const appPath = path.resolve(
            projectEditorPath,
            path.basename(previousRelease.editor_path),
        );
        logger.debug(`Previous editor at ${appPath}`);
        logger.debug(`Removing previous editor at ${appPath}`);
        await removeExistingEditorTarget(appPath);
    }

    // create new editor
    const srcEditorPath = path.resolve(release.editor_path);
    const dstEditorPath = path.resolve(
        projectEditorPath,
        path.basename(release.editor_path),
    );

    logger.debug(`Copying editor from ${srcEditorPath} to ${dstEditorPath}`);
    if (fs.existsSync(srcEditorPath)) {
        await removeExistingEditorTarget(dstEditorPath);
        await fs.promises.cp(srcEditorPath, dstEditorPath, {
            recursive: true,
            mode: fs.constants.COPYFILE_FICLONE,
        });
        logger.debug(`Copied editor from ${srcEditorPath} to ${dstEditorPath}`);
    }

    return dstEditorPath;
}
