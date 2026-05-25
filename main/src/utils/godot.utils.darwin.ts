import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from 'electron-log';

export async function removeProjectEditorDarwin(
    project: ProjectDetails,
): Promise<void> {
    // remove editor files
    if (fs.existsSync(project.launch_path)) {
        await fs.promises.rm(project.launch_path, {
            recursive: true,
            force: true,
        });
    }
}

export async function setProjectEditorReleaseDarwin(
    projectEditorPath: string,
    release: InstalledRelease,
    previousRelease?: InstalledRelease,
): Promise<LaunchPath> {
    // remove previous editor
    if (previousRelease) {
        const appPath = path.resolve(
            projectEditorPath,
            previousRelease.mono ? 'Godot_mono.app' : 'Godot.app',
        );
        logger.debug(`Previous editor at ${appPath}`);
        if (fs.existsSync(appPath)) {
            logger.debug(`Removing previous editor at ${appPath}`);
            await fs.promises.rm(appPath, { recursive: true });
        }
    }

    // create new editor
    const srcEditorPath = path.resolve(release.editor_path);
    const dstEditorPath = path.resolve(
        projectEditorPath,
        path.basename(release.editor_path),
    );

    logger.debug(`Copying editor from ${srcEditorPath} to ${dstEditorPath}`);
    if (fs.existsSync(srcEditorPath)) {
        await fs.promises.cp(srcEditorPath, dstEditorPath, { recursive: true });
        logger.debug(`Copied editor from ${srcEditorPath} to ${dstEditorPath}`);
    }

    return dstEditorPath;
}
