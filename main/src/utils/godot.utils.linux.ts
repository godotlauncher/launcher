import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    InstalledRelease,
    LaunchPath,
    ProjectDetails,
} from '@shared/contracts';
import logger from 'electron-log';

/**
 * Removes a project's editor targets, including links to a deleted install.
 *
 * @param project - Project whose editor targets should be removed.
 */
export async function removeProjectEditorLinux(
    project: ProjectDetails,
): Promise<void> {
    if (!project.launch_path) {
        logger.debug('Skipping Linux project editor removal: missing path');
        return;
    }

    await fs.promises.rm(project.launch_path, { force: true });
    if (project.release.mono) {
        const sharpDir = path.resolve(
            path.dirname(project.launch_path),
            'GodotSharp',
        );
        await fs.promises.rm(sharpDir, { force: true });
    }
}

export async function setProjectEditorReleaseLinux(
    projectEditorPath: string,
    release: InstalledRelease,
    previousRelease?: InstalledRelease,
): Promise<LaunchPath> {
    // remove previous editor
    if (previousRelease?.editor_path) {
        const baseFileName = path.basename(previousRelease.editor_path);
        const binPath = path.resolve(projectEditorPath, baseFileName);
        if (fs.existsSync(binPath)) {
            await fs.promises.unlink(binPath);
        }

        if (previousRelease.mono) {
            const sharpDir = path.resolve(projectEditorPath, 'GodotSharp');
            if (fs.existsSync(sharpDir)) {
                await fs.promises.unlink(sharpDir);
            }
        }
    }

    // create new editor
    const baseFileName = path.basename(release.editor_path);
    const srcBinPath = path.resolve(release.editor_path);
    const dstBinPath = path.resolve(projectEditorPath, baseFileName);

    if (!fs.existsSync(dstBinPath)) {
        if (fs.existsSync(srcBinPath)) {
            try {
                await fs.promises.link(srcBinPath, dstBinPath);
            } catch {
                try {
                    await fs.promises.symlink(srcBinPath, dstBinPath, 'file');
                } catch {
                    await fs.promises.copyFile(srcBinPath, dstBinPath);
                }
            }
        }
    }

    if (release.mono) {
        const srcSharpDir = path.resolve(release.install_path, 'GodotSharp');
        const dstSharpDir = path.resolve(projectEditorPath, 'GodotSharp');

        if (!fs.existsSync(dstSharpDir)) {
            if (fs.existsSync(srcSharpDir)) {
                await fs.promises.symlink(srcSharpDir, dstSharpDir, 'dir');
            }
        }
    }

    return dstBinPath;
}
