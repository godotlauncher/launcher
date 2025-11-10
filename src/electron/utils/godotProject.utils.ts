import * as fs from 'node:fs';
import * as path from 'node:path';
import mustache from 'mustache';
import type { RendererType } from '../../types/index.js';

import { EDITOR_SETTINGS_TEMPLATE_FILENAME } from '../constants.js';

export type GodotProjectFile = Map<string, Map<string, string>>;

/**
 *  Parses a Godot project file into a structured object.
 *
 * @param fileContent - The content of the Godot project file as a string
 * @returns A Map object where keys are section names and values are Maps of key-value pairs in that section
 */
export function parseGodotProjectFile(
    fileContent: string,
): Map<string, Map<string, string>> {
    const sections: GodotProjectFile = new Map<string, Map<string, string>>();

    let current_section: string = 'ROOT';
    sections.set('ROOT', new Map<string, string>());

    fileContent
        .replaceAll('\r', '')
        .split('\n')
        .forEach((line) => {
            if (
                line.trim().startsWith(';') ||
                line.trim().startsWith('#') ||
                line.trim().length === 0
            ) {
                return;
            }
            if (line.trim().startsWith('[')) {
                const section = line
                    .trim()
                    .replaceAll('[', '')
                    .replaceAll(']', '')
                    .trim();
                current_section = section;
                if (!sections.has(section)) {
                    sections.set(section, new Map<string, string>());
                }
            } else {
                const [key, value] = line.split('=');
                if (key && value) {
                    sections
                        .get(current_section)
                        ?.set(key.trim(), value.trim());
                }
            }
        });

    return sections;
}

/**
 * Serializes a parsed GodotProjectFile object back into a string format.
 *
 * The serialization follows the format of Godot project files where each section
 * is denoted by a header `[section_name]` followed by key-value pairs.
 * The special 'ROOT' section is serialized without a section header.
 *
 * @param parsedProjectFile - The GodotProjectFile object to serialize. It's a Map where
 * keys are section names and values are Maps of key-value pairs in that section.
 * @returns A string representation of the Godot project file.
 *
 * @example
 * const projectFile = new Map();
 * const rootSection = new Map();
 * rootSection.set('config_version', '4');
 * projectFile.set('ROOT', rootSection);
 *
 * const result = serializeGodotProjectFile(projectFile);
 * // result: "\nconfig_version=4\n"
 */
export function serializeGodotProjectFile(
    parsedProjectFile: GodotProjectFile,
): string {
    let serialized = '';
    parsedProjectFile.forEach((section, section_name) => {
        if (section_name !== 'ROOT') {
            serialized += `\n[${section_name}]\n`;
        } else {
            serialized += '\n';
        }
        section.forEach((value, key) => {
            serialized += `${key}=${value}\n`;
        });
    });

    return serialized;
}

/**
 * Writes a parsed Godot project file to disk.
 *
 * @param projectPath - The path where the project file will be written
 * @param parsedProjectFile - The Godot project file data to serialize and write
 * @returns A Promise that resolves when the file has been written
 * @throws Will throw an error if the file cannot be written
 */
export async function writeProjectFile(
    projectPath: string,
    parsedProjectFile: GodotProjectFile,
): Promise<void> {
    const serialized = serializeGodotProjectFile(parsedProjectFile);
    await fs.promises.writeFile(projectPath, serialized, 'utf-8');
}

/**
 * Retrieves the name of a Godot project from a specified project file path.
 *
 * @param projectPath - The file path to the Godot project file (.godot or .project)
 * @returns A promise that resolves to the name of the Godot project as a string
 * @throws Will throw an error if the file cannot be read or if the project name is not found
 *
 * @example
 * ```typescript
 * const projectName = await getProjectNameFromPath('/path/to/project.godot');
 * console.log(projectName); // "My Godot Game"
 * ```
 */
export async function getProjectRendererFromPath(
    projectPath: string,
): Promise<RendererType[5] | 'Unknown'> {
    const projectFile = await fs.promises.readFile(projectPath, 'utf-8');
    const sections = parseGodotProjectFile(projectFile);

    return getProjectRendererFromParsed(sections);
}

/**
 * Extracts the renderer type from a parsed Godot project file.
 *
 * @param parsedProject - The parsed Godot project file data
 * @returns A promise that resolves to the renderer type or 'Unknown' if it cannot be determined
 *
 * The function checks the project's config version and for Godot 5 projects, it extracts
 * the rendering method from the 'rendering/renderer/rendering_method' property.
 *
 * Converts the following raw rendering method values to their corresponding enum values:
 * - Default/Unknown: 'FORWARD_PLUS'
 * - "mobile": 'MOBILE'
 * - "gl_compatibility": 'COMPATIBLE'
 * - Any other value: 'Unknown'
 *
 * For projects with config versions other than 5, returns 'Unknown'.
 */
export async function getProjectRendererFromParsed(
    parsedProject: GodotProjectFile,
): Promise<RendererType[5] | 'Unknown'> {
    // get based on the version of the project file
    const version = parsedProject.get('ROOT')?.get('config_version');

    if (version === '5') {
        const rawMethod =
            parsedProject.get('rendering')?.get('renderer/rendering_method') ??
            'Unknown';

        // clean up the method name to match the enum
        const method = rawMethod.replaceAll('"', '').trim();

        switch (method) {
            case 'Unknown':
                return 'FORWARD_PLUS';
            case 'mobile':
                return 'MOBILE';
            case 'gl_compatibility':
                return 'COMPATIBLE';
            default:
                return 'Unknown';
        }
    } else {
        return 'Unknown';
    }
}

/**
 *  Extracts the renderer type from a parsed Godot project file.
 *
 * @param parsedProject The parsed Godot project file object
 * @returns A promise that resolves to the renderer type
 */
export async function getProjectConfigVersionFromParsed(
    parsedProject: GodotProjectFile,
): Promise<number> {
    const version = +(parsedProject.get('ROOT')?.get('config_version') || '0');
    return version;
}

/**
 * Extracts the project name from a parsed Godot project file.
 *
 * @param parsedProject - The parsed Godot project file object
 * @returns A promise that resolves to the clean project name
 * @description The function retrieves the 'config/name' property from the 'application' section
 *              of the Godot project file. It then removes any quotes and trims whitespace
 *              from the name. If no name is found, 'Unknown' is returned.
 */
export async function getProjectNameFromParsed(
    parsedProject: GodotProjectFile,
): Promise<string> {
    const rawName =
        parsedProject.get('application')?.get('config/name') ?? 'Unknown';

    // remove quotes and trim ends from rawName
    const cleanName = rawName.replaceAll('"', '').trim();

    return cleanName;
}

/**
 * Creates a new editor settings file from a template.
 *
 * @param templatePath - The path to the directory containing the editor settings template file.
 * @param launchPath - The path where the Godot project will be launched from.
 * @param editorConfigFilename - The filename for the editor configuration file.
 * @param editorConfigFormat - The format version of the editor configuration.
 * @param useExternalEditor - Whether to use an external editor.
 * @param execPath - The executable path for the external editor.
 * @param execFlags - The command line flags to pass to the external editor.
 *
 * @returns A Promise that resolves to the settings filename.
 *
 * @throws Will throw an error if file operations fail.
 */
export async function createNewEditorSettings(
    templatePath: string,
    launchPath: string,
    editorConfigFilename: string,
    editorConfigFormat: number,
    useExternalEditor: boolean,
    execPath: string,
    execFlags: string,
    isMono: boolean,
): Promise<string> {
    const settingsTemplatePath = path.resolve(
        templatePath,
        EDITOR_SETTINGS_TEMPLATE_FILENAME,
    );
    const template = await fs.promises.readFile(settingsTemplatePath, 'utf-8');

    let platformExecPath = execPath;

    if (process.platform === 'win32') {
        platformExecPath = execPath.replaceAll('\\', '\\\\');
    }

    const editorSettings = mustache.render(template, {
        editorConfigFormat,
        useExternalEditor,
        execPath: platformExecPath,
        execFlags,
        isMono,
    });

    // create folders if they don't exist
    const editorDataPath = path.resolve(
        path.dirname(launchPath),
        'editor_data',
    );
    if (!fs.existsSync(editorDataPath)) {
        await fs.promises.mkdir(editorDataPath, { recursive: true });
    }

    // write the new editor settings file
    const editorSettingsPath = path.resolve(
        editorDataPath,
        editorConfigFilename,
    );
    await fs.promises.writeFile(editorSettingsPath, editorSettings, 'utf-8');

    return editorSettingsPath;
}

/**
 * Updates specific keys in an existing Godot editor settings file (.tres format).
 * Preserves all other settings, comments, and resource definitions.
 *
 * This function performs targeted updates on the editor settings file without
 * replacing the entire file, which preserves user customizations and theme settings.
 *
 * @param editorSettingsPath - Full path to the editor settings file (.tres)
 * @param updates - Object containing the keys to update
 * @param updates.execPath - The executable path for the external editor (optional)
 * @param updates.execFlags - The command line flags to pass to the external editor (optional)
 * @param updates.useExternalEditor - Whether to enable external editor (optional)
 * @param updates.isMono - Whether this is a mono/.NET project (adds dotnet editor settings) (optional)
 *
 * @returns A Promise that resolves when the update is complete
 * @throws Will throw an error if the file doesn't exist or cannot be read/written
 *
 * @example
 * ```typescript
 * await updateEditorSettings('/path/to/editor_settings-4.5.tres', {
 *   execPath: 'C:\\Program Files\\VSCode\\Code.exe',
 *   execFlags: '{project} --goto {file}:{line}:{col}',
 *   useExternalEditor: true,
 *   isMono: true
 * });
 * ```
 */
export async function updateEditorSettings(
    editorSettingsPath: string,
    updates: {
        execPath?: string;
        execFlags?: string;
        useExternalEditor?: boolean;
        isMono?: boolean;
    },
): Promise<void> {
    if (!fs.existsSync(editorSettingsPath)) {
        throw new Error(
            `Editor settings file not found: ${editorSettingsPath}`,
        );
    }

    let content = await fs.promises.readFile(editorSettingsPath, 'utf-8');

    // normalize Windows paths (double backslashes for Godot .tres format)
    const normalizedExecPath =
        updates.execPath && process.platform === 'win32'
            ? updates.execPath.replace(/\\/g, '\\\\')
            : updates.execPath;

    // build the settings map with proper formatting
    const settingsMap: Record<string, string> = {};

    if (normalizedExecPath !== undefined) {
        settingsMap['text_editor/external/exec_path'] =
            `"${normalizedExecPath}"`;
    }
    if (updates.execFlags !== undefined) {
        settingsMap['text_editor/external/exec_flags'] =
            `"${updates.execFlags}"`;
    }
    if (updates.useExternalEditor !== undefined) {
        settingsMap['text_editor/external/use_external_editor'] =
            updates.useExternalEditor.toString();
    }

    // add mono/.NET specific settings
    if (updates.isMono !== undefined && updates.isMono === true) {
        settingsMap['dotnet/editor/external_editor'] = '4';
        settingsMap['dotnet/editor/custom_exec_path_args'] = '"{file}"';
    }

    // helper to escape special regex characters
    const escapeRegExp = (str: string) =>
        str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    for (const [key, value] of Object.entries(settingsMap)) {
        const escapedKey = escapeRegExp(key);

        // match line like: text_editor/external/exec_path = "..."
        // captures the entire line including any existing value
        const regex = new RegExp(`^(${escapedKey})\\s*=\\s*(.*)$`, 'm');

        if (regex.test(content)) {
            // update existing key, preserving the key and replacing only the value
            content = content.replace(regex, `$1 = ${value}`);
        } else {
            // key not found, append it in the [resource] section
            // find the [resource] section and append before the next section or end of file
            const resourceSectionRegex = /(\[resource\][\s\S]*?)(\n\[|$)/;
            if (resourceSectionRegex.test(content)) {
                content = content.replace(
                    resourceSectionRegex,
                    (_match, resourceSection, nextPart) => {
                        // append the new key at the end of the resource section
                        return `${resourceSection}${key} = ${value}\n${nextPart}`;
                    },
                );
            } else {
                // fallback: append at end if no [resource] section found (shouldn't happen)
                content = `${content.trimEnd()}\n${key} = ${value}\n`;
            }
        }
    }

    // atomic write: write to temp file then rename
    const tmpPath = `${editorSettingsPath}.tmp`;
    await fs.promises.writeFile(tmpPath, content, 'utf-8');
    await fs.promises.rename(tmpPath, editorSettingsPath);
}
