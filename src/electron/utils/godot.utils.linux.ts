import * as fs from 'node:fs';
import * as path from 'node:path';
// import { ProjectDetails } from "../types/types.js"; // Removed as ProjectDetails should be globally available

export async function removeProjectEditorLinux(
    project: ProjectDetails
): Promise<void> {
    // remove editor files
    if (fs.existsSync(project.launch_path)) {
        const baseFileName = path.basename(project.launch_path);
        const projectEditorPath = path.dirname(project.launch_path);

        const binPath = path.resolve(projectEditorPath, baseFileName);
        if (fs.existsSync(binPath)) {
            await fs.promises.unlink(binPath);
        }

        if (project.release.mono) {
            const sharpDir = path.resolve(projectEditorPath, 'GodotSharp');
            if (fs.existsSync(sharpDir)) {
                // On Linux, GodotSharp is a symlink to a directory,
                await fs.promises.unlink(sharpDir);
            }
        }
    }
}

export async function setProjectEditorReleaseLinux(
    projectEditorPath: string,
    release: InstalledRelease,
    previousRelease?: InstalledRelease
): Promise<LaunchPath> {
    // remove previous editor
    if (previousRelease) {
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
            await fs.promises.link(srcBinPath, dstBinPath);
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
