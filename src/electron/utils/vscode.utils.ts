import * as fs from 'node:fs';
import path from 'node:path';
import logger from 'electron-log';


/**
 * Adds or updates VSCode settings for a Godot project.
 *
 * This function creates or updates the `.vscode/settings.json` file in the specified project directory
 * with the provided Godot editor path and other editor configurations.
 *
 * @param projectDir - The directory of the Godot project where the VSCode settings will be added or updated.
 * @param launchPath - The path to the Godot editor executable.
 * @param editorVersion - The version of the Godot editor (either 3 or 4).
 *
 * @returns A promise that resolves when the settings have been successfully added or updated.
 */
export async function addVSCodeSettings(
    projectDir: string,
    launchPath: string,
    editorVersion: number,
    isMono: boolean
) {
    const godot_version = Math.floor(editorVersion);

    const vsCodeConfig = {
        [`godotTools.editorPath.godot${godot_version}`]: launchPath,
        'editor.tabSize': 4,
        'editor.insertSpaces': false,
        'files.eol': '\n',
        'files.exclude': {
            '**/*.gd.uid': true // Exclude Godot's autogenerated UID files
        }
    };

    const settingsPath = path.resolve(projectDir, '.vscode');

    if (!fs.existsSync(settingsPath)) {
        await fs.promises.mkdir(settingsPath, { recursive: true });
    }

    const settingsFile = path.resolve(settingsPath, 'settings.json');

    if (fs.existsSync(settingsFile)) {
        const existingSettings = await fs.promises.readFile(settingsFile, 'utf-8');
        const parsed = JSON.parse(existingSettings);
        Object.assign(parsed, vsCodeConfig);
        await fs.promises.writeFile(
            settingsFile,
            JSON.stringify(parsed, null, 4),
            'utf-8'
        );
    } else {
        await fs.promises.writeFile(
            settingsFile,
            JSON.stringify(vsCodeConfig, null, 4),
            'utf-8'
        );
    }

    if (isMono) {
        await addVSCodeNETLaunchConfig(projectDir, launchPath);
    }
}


/**
 * Adds or updates VS Code launch configurations for .NET projects.
 * 
 * This function creates or modifies the VS Code launch.json and tasks.json files
 * to support launching .NET applications from VS Code. If the configuration files
 * already exist, it updates the program path in the launch configuration.
 * 
 * @param projectDir - The directory path of the .NET project
 * @param launchPath - The path to the application executable that should be launched
 * 
 * @remarks
 * The function performs the following operations:
 * - Creates the .vscode directory if it doesn't exist
 * - Creates or updates launch.json with a .NET Core launch configuration
 * - Creates tasks.json with a build task if it doesn't exist
 * 
 * @throws If file operations fail (reading/writing config files)
 */
export async function addVSCodeNETLaunchConfig(
    projectDir: string,
    launchPath: string,
) {

    const lanchJsonPath = path.resolve(projectDir, '.vscode', 'launch.json');
    const preLaunchTaskPath = path.resolve(projectDir, '.vscode', 'tasks.json');

    // if there is already a launch config file update the program path
    // if not create a new launch config file

    if (!fs.existsSync(path.resolve(projectDir, '.vscode'))) {
        await fs.promises.mkdir(path.resolve(projectDir, '.vscode'), { recursive: true });
    }

    let programPath = launchPath;
    if (process.platform === 'darwin') {
        programPath = path.resolve(launchPath, 'Contents', 'MacOS', 'Godot');
    }

    let launchConfig = {
        'version': '0.2.0',
        'configurations': [
            {
                'name': 'Play',
                'type': 'coreclr',
                'request': 'launch',
                'preLaunchTask': 'build',
                'program': path.resolve(programPath),
                'args': [],
                'cwd': '${workspaceFolder}',
                'stopAtEntry': false,
            }
        ]
    };

    if (fs.existsSync(lanchJsonPath)) {
        const existingLaunchConfig = await fs.promises.readFile(lanchJsonPath, 'utf-8');

        try {

            const parsed = JSON.parse(existingLaunchConfig);
            // update the program path
            parsed.configurations = parsed.configurations.map((config: { program?: string; }) => {
                if (config.program) {
                    config.program = path.resolve(programPath);
                }
                return config;
            });

            launchConfig = parsed;

        } catch (error) {
            logger.error('Failed to parse existing launch config', error);
            logger.info('Creating new launch config file');
        }
    }
    await fs.promises.writeFile(
        lanchJsonPath,
        JSON.stringify(launchConfig, null, 4)
    );


    const preLaunchTask = {
        'version': '2.0.0',
        'tasks': [
            {
                'label': 'build',
                'command': 'dotnet',
                'type': 'process',
                'args': [
                    'build'
                ],
                'problemMatcher': '$msCompile'
            }
        ]
    };

    // same as launch.json check if there is not a prelaunch task create new one
    if (!fs.existsSync(preLaunchTaskPath)) {
        await fs.promises.writeFile(
            preLaunchTaskPath,
            JSON.stringify(preLaunchTask, null, 4)
        );
    }
}


/**
 * Adds recommended VSCode extensions to the specified project directory.
 *
 * This function creates a `.vscode` folder in the given project directory if it doesn't already exist,
 * and then writes or merges the `extensions.json` file with a list of recommended extensions.
 *
 * @param projectDir - The path to the project directory where the `.vscode` folder will be created.
 * @returns A promise that resolves when the operation is complete.
 */
export async function addOrUpdateVSCodeRecommendedExtensions(projectDir: string, isMono: boolean) {
    // create vscode settings in project folder
    const settingsPath = path.resolve(projectDir, '.vscode');

    if (!fs.existsSync(settingsPath)) {
        await fs.promises.mkdir(settingsPath, { recursive: true });
    }

    // add recommended extensions
    const extensions = {
        recommendations: [
            'geequlim.godot-tools',
            'mariodebono.godot-4-vscode-theme',
            'eamodio.gitlens',
        ],
    };

    if (isMono) {
        extensions.recommendations.push('ms-dotnettools.csharp');
    }

    const settingsFile = path.resolve(settingsPath, 'extensions.json');

    // check if file exists and merge with existing extensions
    if (fs.existsSync(settingsFile)) {
        const existingExtensions = await fs.promises.readFile(settingsFile, 'utf-8');
        const parsed = JSON.parse(existingExtensions);
        parsed.recommendations = [...new Set([...parsed.recommendations, ...extensions.recommendations])];
        await fs.promises.writeFile(
            settingsFile,
            JSON.stringify(parsed, null, 4)
        );

    }
    else {
        await fs.promises.writeFile(
            settingsFile,
            JSON.stringify(extensions, null, 4)
        );
    }
}

/**
 * Retrieves the installation path of Visual Studio Code.
 * 
 * This function checks for the installation path of Visual Studio Code based on the current platform.
 * It supports Windows (win32), macOS (darwin), and Linux (linux). If a specific path is provided and exists,
 * it returns that path. Otherwise, it checks the default installation locations for the respective platform.
 * 
 * @param path - An optional path to check for the Visual Studio Code installation.
 * @returns A promise that resolves to the installation path of Visual Studio Code if found, or null if not found.
 */
export async function getVSCodeInstallPath(path?: string): Promise<string | null> {

    // only support win32, darwin, linux
    if (!['win32', 'darwin', 'linux'].includes(process.platform)) {
        return null;
    }

    // check if specified path exists and return it as is (user preference)
    if (path && fs.existsSync(path)) {
        return path;
    }

    const platform = process.platform as 'win32' | 'darwin' | 'linux';

    // default locations for vscode for each platform
    const defaultLocations = {
        darwin: [
            '/Applications/Visual Studio Code.app'
        ],
        win32: [
            'C:\\Program Files\\Microsoft VS Code\\Code.exe',
            'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe',
            process.env.LOCALAPPDATA + '\\Programs\\Microsoft VS Code\\Code.exe',
        ],
        linux: [
            '/usr/share/code/code',
            '/usr/bin/code',
            '/snap/bin/code',

        ],
    };

    const locations: string[] | undefined = defaultLocations[platform];

    // check default locations for file exist and return first one found
    if (locations) {
        for (const location of locations) {
            if (fs.existsSync(location)) {
                return location;
            }
        }
    }
    return null;
}
