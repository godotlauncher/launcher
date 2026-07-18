import * as fs from 'node:fs';
import * as path from 'node:path';
import mustache from 'mustache';

import { EDITOR_SETTINGS_TEMPLATE_FILENAME } from '../../constants.js';

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

    const platformExecPath =
        process.platform === 'win32'
            ? execPath.replaceAll('\\', '\\\\')
            : execPath;

    const editorSettings = mustache.render(template, {
        editorConfigFormat,
        useExternalEditor,
        execPath: platformExecPath,
        execFlags,
        isMono,
    });

    const editorDataPath = path.resolve(
        path.dirname(launchPath),
        'editor_data',
    );
    if (!fs.existsSync(editorDataPath)) {
        await fs.promises.mkdir(editorDataPath, { recursive: true });
    }

    const editorSettingsPath = path.resolve(
        editorDataPath,
        editorConfigFilename,
    );
    await fs.promises.writeFile(editorSettingsPath, editorSettings, 'utf-8');

    return editorSettingsPath;
}

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
    const normalizedExecPath =
        updates.execPath && process.platform === 'win32'
            ? updates.execPath.replace(/\\/g, '\\\\')
            : updates.execPath;
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
    if (updates.isMono === true) {
        settingsMap['dotnet/editor/external_editor'] = '4';
        settingsMap['dotnet/editor/custom_exec_path_args'] = '"{file}"';
    }

    const escapeRegExp = (value: string) =>
        value.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');

    for (const [key, value] of Object.entries(settingsMap)) {
        const escapedKey = escapeRegExp(key);
        const regex = new RegExp(`^(${escapedKey})\\s*=\\s*(.*)$`, 'm');

        if (regex.test(content)) {
            content = content.replace(regex, `$1 = ${value}`);
            continue;
        }

        const resourceSectionRegex = /(\[resource\][\s\S]*?)(\n\[|$)/;
        if (resourceSectionRegex.test(content)) {
            content = content.replace(
                resourceSectionRegex,
                (_match, resourceSection, nextPart) =>
                    `${resourceSection + key} = ${value}\n${nextPart}`,
            );
        } else {
            content = `${content.trimEnd()}\n${key} = ${value}\n`;
        }
    }

    const tmpPath = `${editorSettingsPath}.tmp`;
    await fs.promises.writeFile(tmpPath, content, 'utf-8');
    await fs.promises.rename(tmpPath, editorSettingsPath);
}
