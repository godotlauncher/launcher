import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from 'electron-log';
import mst from 'mustache';
import {
    removeProjectEditorDarwin,
    setProjectEditorReleaseDarwin,
} from './godot.utils.darwin.js';
import {
    removeProjectEditorLinux,
    setProjectEditorReleaseLinux,
} from './godot.utils.linux.js';
import {
    removeProjectEditorWindows,
    setProjectEditorReleaseWindows,
} from './godot.utils.windows.js';

// Default project definitions for different editor versions
export const DEFAULT_PROJECT_DEFINITION: ProjectDefinition = new Map([
    [
        4.3,
        {
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
            resources: [
                {
                    src: 'icon.svg',
                    dst: 'assets/icon.svg',
                },
            ],
            projectFilename: 'project.godot',
            editorConfigFilename: (editor_version: number) =>
                `editor_settings-${editor_version.toString()}.tres`,
            editorConfigFormat: 3,
        },
    ],
    [
        4.0,
        {
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
            resources: [
                {
                    src: 'icon.svg',
                    dst: 'assets/icon.svg',
                },
            ],
            projectFilename: 'project.godot',
            editorConfigFilename: (editor_version: number) =>
                `editor_settings-${parseInt(editor_version.toString())}.tres`,
            editorConfigFormat: 3,
        },
    ],
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
    definitions: ProjectDefinition = DEFAULT_PROJECT_DEFINITION,
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
export async function createProjectFile<version extends keyof RendererType>(
    templateDir: string,
    configVersion: version,
    editorVersion: number,
    projectName: string,
    renderer: RendererType[version],
) {
    const template = await fs.promises.readFile(
        path.resolve(
            templateDir,
            `project.godot_v${configVersion}.template.mst`,
        ),
        'utf-8',
    );

    switch (configVersion) {
        // Godot 4.x
        case 5: {
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

export async function removeProjectEditor(
    project: ProjectDetails,
): Promise<void> {
    if (process.platform === 'darwin') {
        await removeProjectEditorDarwin(project);
    } else if (process.platform === 'win32') {
        await removeProjectEditorWindows(project);
    } else if (process.platform === 'linux') {
        await removeProjectEditorLinux(project);
    }
}

export async function SetProjectEditorRelease(
    projectEditorPath: string,
    release: InstalledRelease,
    previousRelease?: InstalledRelease,
): Promise<LaunchPath> {
    const scFilePath = path.resolve(projectEditorPath, '._sc_');

    if (!fs.existsSync(projectEditorPath)) {
        await fs.promises.mkdir(projectEditorPath, { recursive: true });
    }

    if (!fs.existsSync(scFilePath)) {
        await fs.promises.writeFile(scFilePath, '', 'utf-8');
    }

    if (process.platform === 'darwin') {
        return await setProjectEditorReleaseDarwin(
            projectEditorPath,
            release,
            previousRelease,
        );
    } else if (process.platform === 'win32') {
        logger.log('Setting project editor release for Windows');
        logger.log('Project editor path:', projectEditorPath);
        logger.log('Release path:', release.editor_path);
        logger.log('Previous release path:', previousRelease?.editor_path);
        return await setProjectEditorReleaseWindows(
            projectEditorPath,
            release,
            previousRelease,
        );
    } else if (process.platform === 'linux') {
        return await setProjectEditorReleaseLinux(
            projectEditorPath,
            release,
            previousRelease,
        );
    }

    throw new Error(`Unsupported platform ${process.platform}`);
}

// export async function setEditorSymlink(
//   projectEditorPath: string,
//   editorPath: string,
//   previousLaunchPath?: string
// ): Promise<string> {
//   const scFilePath = path.resolve(projectEditorPath, "._sc_");

//   if (!fs.existsSync(projectEditorPath)) {
//     await fs.promises.mkdir(projectEditorPath, { recursive: true });
//   }

//   if (!fs.existsSync(scFilePath)) {
//     await fs.promises.writeFile(scFilePath, "", "utf-8");
//   }

//   let godotSrcPath = path.resolve(editorPath);

//   let projectLinkPath = path.resolve(
//     projectEditorPath,
//     path.basename(editorPath)
//   );

//   if (process.platform === "darwin") {
//     godotSrcPath = path.resolve(editorPath, "Contents", "MacOS", "Godot");
//     projectLinkPath = path.resolve(projectEditorPath, "Godot");
//   }

//   if (
//     previousLaunchPath &&
//     previousLaunchPath.length > 0 &&
//     fs.existsSync(previousLaunchPath)
//   ) {
//     // make sure the path to delete is within the project directory
//     if (previousLaunchPath.startsWith(projectEditorPath)) {
//       await fs.promises.unlink(previousLaunchPath);
//     } else {
//       logger.warn(
//         `Previous launch path is not within the project directory: ${previousLaunchPath}`
//       );
//     }
//   }

//   // remove existing symlink if it exists
//   if (fs.existsSync(projectLinkPath)) {
//     await fs.promises.unlink(projectLinkPath);
//   }

//   // create new symlink
//   await fs.promises.symlink(godotSrcPath, projectLinkPath);

//   // return the path to the symlink (the new launch path)
//   return projectLinkPath;
// }
