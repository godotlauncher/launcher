import * as fs from 'node:fs';
import path from 'node:path';
import logger from 'electron-log';
import { applyEdits, modify, type ParseError, parse } from 'jsonc-parser';

type JSONObject = Record<string, unknown>;

type VSCodeConfigReadResult<T extends JSONObject> = {
    parsed: T | null;
    raw: string | null;
    recoveredFiles: string[];
};

function isJSONObject(value: unknown): value is JSONObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
    return (
        Array.isArray(value) &&
        value.every((entry) => typeof entry === 'string')
    );
}

function isSettingsJSONObject(value: unknown): value is JSONObject {
    return isJSONObject(value);
}

function isExtensionsJSONObject(
    value: unknown,
): value is JSONObject & { recommendations?: string[] } {
    return (
        isJSONObject(value) &&
        (value.recommendations === undefined ||
            isStringArray(value.recommendations))
    );
}

function isLaunchJSONObject(
    value: unknown,
): value is JSONObject & { configurations: JSONObject[] } {
    return (
        isJSONObject(value) &&
        Array.isArray(value.configurations) &&
        value.configurations.every(isJSONObject)
    );
}

function dedupeRecoveredFiles(paths: string[]): string[] {
    return [...new Set(paths)];
}

async function preserveInvalidVSCodeConfig(filePath: string): Promise<string> {
    const backupPath = `${filePath}.${Date.now()}.bad`;
    await fs.promises.rename(filePath, backupPath);
    return backupPath;
}

async function readRecoverableVSCodeConfig<T extends JSONObject>(
    filePath: string,
    validator: (value: unknown) => value is T,
    description: string,
): Promise<VSCodeConfigReadResult<T>> {
    if (!fs.existsSync(filePath)) {
        return { parsed: null, raw: null, recoveredFiles: [] };
    }

    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const errors: ParseError[] = [];
    const parsed = parse(raw, errors, {
        allowTrailingComma: true,
        disallowComments: false,
    });

    if (errors.length === 0 && validator(parsed)) {
        return { parsed, raw, recoveredFiles: [] };
    }

    logger.warn(`Recovering invalid VS Code ${description}`, {
        filePath,
        parseErrors: errors.length,
    });
    const backupPath = await preserveInvalidVSCodeConfig(filePath);
    return { parsed: null, raw: null, recoveredFiles: [backupPath] };
}

function updateJSONCProperty(
    text: string,
    keyPath: (string | number)[],
    value: unknown,
): string {
    return applyEdits(
        text,
        modify(text, keyPath, value, {
            formattingOptions: {
                insertSpaces: true,
                tabSize: 4,
                eol: '\n',
            },
        }),
    );
}

function updateJSONCProperties(text: string, values: JSONObject): string {
    return Object.entries(values).reduce(
        (updatedText, [key, value]) =>
            updateJSONCProperty(updatedText, [key], value),
        text,
    );
}

function valuesEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function updateChangedJSONCProperties(
    text: string,
    existing: JSONObject,
    values: JSONObject,
): string {
    return Object.entries(values).reduce((updatedText, [key, value]) => {
        if (valuesEqual(existing[key], value)) {
            return updatedText;
        }

        return updateJSONCProperty(updatedText, [key], value);
    }, text);
}

function updateJSONCObjectEntries(
    text: string,
    key: string,
    existingValue: unknown,
    entries: JSONObject,
): string {
    if (!isJSONObject(existingValue)) {
        return updateJSONCProperty(text, [key], entries);
    }

    return Object.entries(entries).reduce((updatedText, [entryKey, value]) => {
        if (valuesEqual(existingValue[entryKey], value)) {
            return updatedText;
        }

        return updateJSONCProperty(updatedText, [key, entryKey], value);
    }, text);
}

function insertJSONCArrayItems(
    text: string,
    keyPath: (string | number)[],
    startIndex: number,
    values: string[],
): string {
    return values.reduce(
        (updatedText, value, index) =>
            applyEdits(
                updatedText,
                modify(updatedText, [...keyPath, startIndex + index], value, {
                    formattingOptions: {
                        insertSpaces: true,
                        tabSize: 4,
                        eol: '\n',
                    },
                    isArrayInsertion: true,
                }),
            ),
        text,
    );
}

function createVSCodeSettings(
    launchPath: string,
    editorVersion: number,
): JSONObject & { 'files.exclude': JSONObject } {
    const godot_version = Math.floor(editorVersion);

    return {
        [`godotTools.editorPath.godot${godot_version}`]: launchPath,
        'editor.tabSize': 4,
        'editor.insertSpaces': false,
        'files.eol': '\n',
        'files.exclude': {
            '**/*.gd.uid': true,
            '**/*.cs.uid': true
        },
    };
}

function createVSCodeExtensions(isMono: boolean): {
    recommendations: string[];
} {
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

    return extensions;
}

function createVSCodeLaunchConfig(programPath: string): JSONObject {
    return {
        version: '0.2.0',
        configurations: [
            {
                name: 'Play',
                type: 'coreclr',
                request: 'launch',
                preLaunchTask: 'build',
                program: path.resolve(programPath),
                args: [],
                // biome-ignore lint/suspicious/noTemplateCurlyInString: it is the template for the vscode config
                cwd: '${workspaceFolder}',
                stopAtEntry: false,
            },
        ],
    };
}

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
    isMono: boolean,
): Promise<string[]> {
    const vsCodeConfig = createVSCodeSettings(launchPath, editorVersion);
    const settingsPath = path.resolve(projectDir, '.vscode');

    if (!fs.existsSync(settingsPath)) {
        await fs.promises.mkdir(settingsPath, { recursive: true });
    }

    const settingsFile = path.resolve(settingsPath, 'settings.json');
    let settingsText = JSON.stringify(vsCodeConfig, null, 4);
    const { parsed, raw, recoveredFiles } = await readRecoverableVSCodeConfig(
        settingsFile,
        isSettingsJSONObject,
        'settings.json',
    );

    if (parsed && raw !== null) {
        const { 'files.exclude': filesExclude, ...topLevelConfig } =
            vsCodeConfig;

        settingsText = updateChangedJSONCProperties(
            raw,
            parsed,
            topLevelConfig,
        );
        settingsText = updateJSONCObjectEntries(
            settingsText,
            'files.exclude',
            parsed['files.exclude'],
            filesExclude,
        );
    }

    if (settingsText !== raw) {
        await fs.promises.writeFile(settingsFile, settingsText, 'utf-8');
    }

    if (isMono) {
        recoveredFiles.push(
            ...((await addVSCodeNETLaunchConfig(projectDir, launchPath)) ?? []),
        );
    }

    return dedupeRecoveredFiles(recoveredFiles);
}

/**
 * Updates VSCode settings for a Godot project (merges with existing settings, preserving user customizations).
 *
 * This function updates only the launcher-managed keys in an existing `.vscode/settings.json` file,
 * performing a deep merge to preserve all user settings and customizations. If the file doesn't exist,
 * it creates a new one.
 *
 * @param projectDir - The directory of the Godot project where the VSCode settings will be updated.
 * @param launchPath - The path to the Godot editor executable.
 * @param editorVersion - The version of the Godot editor (either 3 or 4).
 * @param isMono - Whether this is a mono/.NET build.
 *
 * @returns A promise that resolves when the settings have been successfully updated.
 */
export async function updateVSCodeSettings(
    projectDir: string,
    launchPath: string,
    editorVersion: number,
    isMono: boolean,
): Promise<string[]> {
    const vsCodeConfig = createVSCodeSettings(launchPath, editorVersion);
    const settingsPath = path.resolve(projectDir, '.vscode');

    if (!fs.existsSync(settingsPath)) {
        await fs.promises.mkdir(settingsPath, { recursive: true });
    }

    const settingsFile = path.resolve(settingsPath, 'settings.json');
    let settingsText = JSON.stringify(vsCodeConfig, null, 4);
    const { parsed, raw, recoveredFiles } = await readRecoverableVSCodeConfig(
        settingsFile,
        isSettingsJSONObject,
        'settings.json',
    );

    if (parsed && raw !== null) {
        const mergedExcludes =
            isJSONObject(parsed['files.exclude']) &&
            isJSONObject(vsCodeConfig['files.exclude'])
                ? {
                      ...parsed['files.exclude'],
                      ...vsCodeConfig['files.exclude'],
                  }
                : vsCodeConfig['files.exclude'];

        const { 'files.exclude': _filesExclude, ...topLevelConfig } =
            vsCodeConfig;

        settingsText = updateChangedJSONCProperties(
            raw,
            parsed,
            topLevelConfig,
        );
        settingsText = updateJSONCObjectEntries(
            settingsText,
            'files.exclude',
            parsed['files.exclude'],
            mergedExcludes,
        );
    }

    if (settingsText !== raw) {
        await fs.promises.writeFile(settingsFile, settingsText, 'utf-8');
    }

    if (isMono) {
        recoveredFiles.push(
            ...((await addVSCodeNETLaunchConfig(projectDir, launchPath)) ?? []),
        );
    }

    return dedupeRecoveredFiles(recoveredFiles);
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
): Promise<string[]> {
    const lanchJsonPath = path.resolve(projectDir, '.vscode', 'launch.json');
    const preLaunchTaskPath = path.resolve(projectDir, '.vscode', 'tasks.json');

    if (!fs.existsSync(path.resolve(projectDir, '.vscode'))) {
        await fs.promises.mkdir(path.resolve(projectDir, '.vscode'), {
            recursive: true,
        });
    }

    let programPath = launchPath;
    if (process.platform === 'darwin') {
        programPath = path.resolve(launchPath, 'Contents', 'MacOS', 'Godot');
    }

    const { parsed, raw, recoveredFiles } = await readRecoverableVSCodeConfig(
        lanchJsonPath,
        isLaunchJSONObject,
        'launch.json',
    );

    let launchConfigText = JSON.stringify(
        createVSCodeLaunchConfig(programPath),
        null,
        4,
    );
    if (parsed && raw !== null) {
        launchConfigText = parsed.configurations.reduce(
            (updatedText, config, index) => {
                if ('program' in config) {
                    return updateJSONCProperty(
                        updatedText,
                        ['configurations', index, 'program'],
                        path.resolve(programPath),
                    );
                }

                return updatedText;
            },
            raw,
        );
    }

    await fs.promises.writeFile(lanchJsonPath, launchConfigText);

    const preLaunchTask = {
        version: '2.0.0',
        tasks: [
            {
                label: 'build',
                command: 'dotnet',
                type: 'process',
                args: ['build'],
                problemMatcher: '$msCompile',
            },
        ],
    };

    // same as launch.json check if there is not a prelaunch task create new one
    if (!fs.existsSync(preLaunchTaskPath)) {
        await fs.promises.writeFile(
            preLaunchTaskPath,
            JSON.stringify(preLaunchTask, null, 4),
        );
    }

    return dedupeRecoveredFiles(recoveredFiles);
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
export async function addOrUpdateVSCodeRecommendedExtensions(
    projectDir: string,
    isMono: boolean,
): Promise<string[]> {
    const settingsPath = path.resolve(projectDir, '.vscode');

    if (!fs.existsSync(settingsPath)) {
        await fs.promises.mkdir(settingsPath, { recursive: true });
    }

    const extensions = createVSCodeExtensions(isMono);
    const settingsFile = path.resolve(settingsPath, 'extensions.json');
    const { parsed, raw, recoveredFiles } = await readRecoverableVSCodeConfig(
        settingsFile,
        isExtensionsJSONObject,
        'extensions.json',
    );

    if (parsed && raw !== null) {
        const existingRecommendations = parsed.recommendations ?? [];
        const missingRecommendations = extensions.recommendations.filter(
            (recommendation) =>
                !existingRecommendations.includes(recommendation),
        );

        if (missingRecommendations.length > 0) {
            const updatedExtensions =
                parsed.recommendations === undefined
                    ? updateJSONCProperty(
                          raw,
                          ['recommendations'],
                          missingRecommendations,
                      )
                    : insertJSONCArrayItems(
                          raw,
                          ['recommendations'],
                          existingRecommendations.length,
                          missingRecommendations,
                      );

            await fs.promises.writeFile(settingsFile, updatedExtensions);
        }
    } else {
        await fs.promises.writeFile(
            settingsFile,
            JSON.stringify(extensions, null, 4),
        );
    }

    return dedupeRecoveredFiles(recoveredFiles);
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
export async function getVSCodeInstallPath(
    path?: string,
): Promise<string | null> {
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
        darwin: ['/Applications/Visual Studio Code.app'],
        win32: [
            'C:\\Program Files\\Microsoft VS Code\\Code.exe',
            'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe',
            process.env.LOCALAPPDATA +
                '\\Programs\\Microsoft VS Code\\Code.exe',
        ],
        linux: ['/usr/share/code/code', '/usr/bin/code', '/snap/bin/code'],
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
