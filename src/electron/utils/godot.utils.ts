import * as fs from 'node:fs';
import * as path from 'node:path';
import mst from 'mustache';
import logger from 'electron-log';

// Default project definitions for different editor versions
export const DEFAULT_PROJECT_DEFINITION: ProjectDefinition = new Map([
    [4.3, {
        configVersion: 5,
        defaultRenderer: 'FORWARD_PLUS',
        resources: [{
            src: 'icon.svg',
            dst: 'assets/icon.svg'
        }],
        projectFilename: 'project.godot',
        editorConfigFilename: (editor_version: number) => `editor_settings-${editor_version.toString()}.tres`,
        editorConfigFormat: 3,
    }],
    [4.0, {
        configVersion: 5,
        defaultRenderer: 'FORWARD_PLUS',
        resources: [{
            src: 'icon.svg',
            dst: 'assets/icon.svg'
        }],
        projectFilename: 'project.godot',
        editorConfigFilename: (editor_version: number) => `editor_settings-${parseInt(editor_version.toString())}.tres`,
        editorConfigFormat: 3,
    }],

]);


/**
 * Gets the project configuration definition for a specified editor version.
 * 
 * This function searches for the most appropriate project configuration based on the provided
 * editor version number. It iterates through available definition keys in descending order
 * and returns the configuration associated with the first key that is less than or equal to
 * the specified editor version.
 * 
 * @param editorVersion - The editor version number to match against.
 * @param definitions - A map of version numbers to project configurations. Defaults to DEFAULT_PROJECT_DEFINITION.
 * @returns The matching project configuration or null if no suitable configuration is found.
 */
export function getProjectDefinition(
    editorVersion: number,
    definitions: ProjectDefinition = DEFAULT_PROJECT_DEFINITION
): ProjectConfig | null {


    const keys = Array.from(definitions.keys());

    // get key that is >= editorVersion 
    // keys are descending order

    for (const key of keys) {
        if (editorVersion >= key) {
            return definitions.get(key) || null;
        }
    }

    return null;
}

/**
 * Creates a Godot project file based on the specified configuration parameters.
 * 
 * @template version - The key type from RendererType indicating the Godot configuration version
 * @param templateDir - The directory where template files are stored
 * @param configVersion - The configuration version of Godot
 * @param editorVersion - The version number of the Godot editor
 * @param projectName - The name of the project to create
 * @param renderer - The renderer type to use for the project, specific to the configuration version
 * @returns A Promise that resolves to the rendered project file content
 * @throws Error if the specified configuration version is not supported
 */
export async function createProjectFile<version extends keyof RendererType>(templateDir: string, configVersion: version, editorVersion: number, projectName: string, renderer: RendererType[version]) {

    const template = await fs.promises.readFile(path.resolve(templateDir, `project.godot_v${configVersion}.template.mst`), 'utf-8');

    switch (configVersion) {
        // Godot 4.x
        case 5:
            {
                const rendered = mst.render(template, {
                    configVersion,
                    editorVersion,
                    projectName,
                    compatible: renderer === 'COMPATIBLE',
                    mobile: renderer === 'MOBILE',
                });

                return rendered;
            }

        default:
            throw new Error(`Invalid config version ${configVersion}`);
    }
}

export async function removeEditorSymlink(launchPath: string): Promise<void> {

    if (fs.existsSync(launchPath)) {
        if (process.platform === 'win32') {
            await fs.promises.unlink(launchPath);
        }
        if (process.platform === 'darwin') {
            await fs.promises.rm(launchPath, { recursive: true, force: true });
        }

    }
}

export async function removeProjectEditor(project: ProjectDetails): Promise<void> {

    // remove editor files
    if (fs.existsSync(project.launch_path)) {
        if (process.platform === 'darwin') {
            await fs.promises.rm(project.launch_path, { recursive: true, force: true });
        }
        if (process.platform === 'win32') {
            // remove all files based on mono or not
            const baseFileName = path.basename(project.launch_path);
            const projectEditorPath = path.dirname(project.launch_path);
            const exePath = path.resolve(projectEditorPath, baseFileName);
            const consolePath = path.resolve(projectEditorPath, baseFileName.replace('.exe', '_console.exe'));

            if (fs.existsSync(exePath) && fs.existsSync(consolePath)) {
                await fs.promises.rm(exePath);
                await fs.promises.rm(consolePath);
            }

            if (project.release.mono) {

                const sharpDir = path.resolve(projectEditorPath, 'GodotSharp');

                if (fs.existsSync(sharpDir)) {
                    await fs.promises.rm(sharpDir, { recursive: true });
                }
            }
        }

        if (process.platform === 'linux') {
            const baseFileName = path.basename(project.launch_path);
            const projectEditorPath = path.dirname(project.launch_path);

            const binPath = path.resolve(projectEditorPath, baseFileName);
            if (fs.existsSync(binPath)) {
                await fs.promises.unlink(binPath);
            }

            if (project.release.mono) {
                const sharpDir = path.resolve(projectEditorPath, 'GodotSharp');
                if (fs.existsSync(sharpDir)) {
                    await fs.promises.unlink(sharpDir);
                }
            }
        }

    }

}

export async function SetProjectEditorRelease(projectEditorPath: string, release: InstalledRelease, previousRelease?: InstalledRelease): Promise<LaunchPath> {

    const scFilePath = path.resolve(projectEditorPath, '._sc_');

    if (!fs.existsSync(projectEditorPath)) {
        await fs.promises.mkdir(projectEditorPath, { recursive: true });
    }

    if (!fs.existsSync(scFilePath)) {
        await fs.promises.writeFile(scFilePath, '', 'utf-8');
    }

    // remove previous editor
    if (previousRelease) {

        if (process.platform === 'darwin') {
            const appPath = path.resolve(projectEditorPath, previousRelease.mono ? 'Godot_mono.app' : 'Godot.app');
            logger.debug(`Previous editor at ${appPath}`);
            if (fs.existsSync(appPath)) {
                logger.debug(`Removing previous editor at ${appPath}`);
                await fs.promises.rm(appPath, { recursive: true });
            }
        }
        else if (process.platform === 'win32') {
            if (previousRelease.mono) {
                // remove exe, console.exe and GodotSharp folder
                const baseFileName = path.basename(previousRelease.editor_path);
                const exePath = path.resolve(projectEditorPath, baseFileName);
                const consolePath = path.resolve(projectEditorPath, baseFileName.replace('.exe', '_console.exe'));
                const sharpDir = path.resolve(projectEditorPath, 'GodotSharp');

                if (fs.existsSync(exePath) && fs.existsSync(consolePath) && fs.existsSync(sharpDir)) {
                    await fs.promises.rm(exePath);
                    await fs.promises.rm(consolePath);
                    await fs.promises.rm(sharpDir, { recursive: true });
                }
            }
            else {
                // remove exe and console.exe
                const baseFileName = path.basename(previousRelease.editor_path);
                const exePath = path.resolve(projectEditorPath, baseFileName);
                const consolePath = path.resolve(projectEditorPath, baseFileName.replace('.exe', '_console.exe'));

                if (fs.existsSync(exePath) && fs.existsSync(consolePath)) {
                    await fs.promises.rm(exePath);
                    await fs.promises.rm(consolePath);
                }

            }
        }

        if (process.platform === 'linux') {
            // remove previous editor
            const baseFileName = path.basename(previousRelease.editor_path);
            const binPath = path.resolve(projectEditorPath, baseFileName);
            if (fs.existsSync(binPath)) {
                await fs.promises.rm(binPath);
            }

            if (previousRelease.mono) {
                const sharpDir = path.resolve(projectEditorPath, 'GodotSharp');
                if (fs.existsSync(sharpDir)) {
                    await fs.promises.unlink(sharpDir);
                }
            }
        }
    }

    // create new editor
    if (process.platform === 'darwin') {

        const srcEditorPath = path.resolve(release.editor_path);
        const dstEditorPath = path.resolve(projectEditorPath, path.basename(release.editor_path));

        logger.debug(`Copying editor from ${srcEditorPath} to ${dstEditorPath}`);
        if (fs.existsSync(srcEditorPath)) {
            await fs.promises.cp(srcEditorPath, dstEditorPath, { recursive: true });
            logger.debug(`Copied editor from ${srcEditorPath} to ${dstEditorPath}`);
        }

        return dstEditorPath;
    }

    if (process.platform === 'win32') {

        if (release.mono) {

            const baseFileName = path.basename(release.editor_path);
            const dstExePath = path.resolve(projectEditorPath, baseFileName);
            const dstConsolePath = path.resolve(projectEditorPath, baseFileName.replace('.exe', '_console.exe'));
            const dstSharpDir = path.resolve(projectEditorPath, 'GodotSharp');

            const srcExePath = path.resolve(release.install_path, baseFileName);
            const srcConsolePath = path.resolve(release.install_path, baseFileName.replace('.exe', '_console.exe'));
            const srcSharpDir = path.resolve(release.install_path, 'GodotSharp');

            if (fs.existsSync(srcExePath) && fs.existsSync(srcConsolePath) && fs.existsSync(srcSharpDir)) {
                await fs.promises.cp(srcExePath, dstExePath);
                await fs.promises.cp(srcConsolePath, dstConsolePath);
                await fs.promises.cp(srcSharpDir, dstSharpDir, { recursive: true });
            }

            return dstExePath;
        }
        else {

            const baseFileName = path.basename(release.editor_path);

            const srcExePath = path.resolve(release.install_path, baseFileName);
            const srcConsolePath = path.resolve(release.install_path, baseFileName.replace('.exe', '_console.exe'));

            const dstExePath = path.resolve(projectEditorPath, baseFileName);
            const dstConsolePath = path.resolve(projectEditorPath, baseFileName.replace('.exe', '_console.exe'));

            if (fs.existsSync(srcExePath) && fs.existsSync(srcConsolePath)) {
                await fs.promises.cp(srcExePath, dstExePath);
                await fs.promises.cp(srcConsolePath, dstConsolePath);
            }

            return dstExePath;

        }
    }

    if (process.platform === 'linux') {

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


    throw new Error(`Unsupported platform ${process.platform}`);


}

export async function setEditorSymlink(projectEditorPath: string, editorPath: string, previousLaunchPath?: string): Promise<string> {

    const scFilePath = path.resolve(projectEditorPath, '._sc_');

    if (!fs.existsSync(projectEditorPath)) {
        await fs.promises.mkdir(projectEditorPath, { recursive: true });
    }

    if (!fs.existsSync(scFilePath)) {
        await fs.promises.writeFile(scFilePath, '', 'utf-8');
    }

    let godotSrcPath = path.resolve(editorPath);

    let projectLinkPath = path.resolve(projectEditorPath, path.basename(editorPath));

    if (process.platform === 'darwin') {
        godotSrcPath = path.resolve(editorPath, 'Contents', 'MacOS', 'Godot');
        projectLinkPath = path.resolve(projectEditorPath, 'Godot');
    }

    if (previousLaunchPath && previousLaunchPath.length > 0 && fs.existsSync(previousLaunchPath)) {
        // make sure the path to delete is within the project directory
        if (previousLaunchPath.startsWith(projectEditorPath)) {
            await fs.promises.unlink(previousLaunchPath);
        }
        else {
            logger.warn(`Previous launch path is not within the project directory: ${previousLaunchPath}`);
        }
    }

    // remove existing symlink if it exists
    if (fs.existsSync(projectLinkPath)) {
        await fs.promises.unlink(projectLinkPath);
    }

    // create new symlink
    await fs.promises.symlink(godotSrcPath, projectLinkPath);

    // return the path to the symlink (the new launch path)
    return projectLinkPath;
}