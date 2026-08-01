import * as fs from 'node:fs';
import * as path from 'node:path';
import mustache from 'mustache';

import { EDITOR_SETTINGS_TEMPLATE_FILENAME } from '../../constants.js';

type GodotEditorLaunchConfiguration = {
    execPath: string;
    execFlags: string;
};

type GodotDotNetEditorSettings = {
    externalEditorId: number;
    customLaunchConfiguration?: GodotEditorLaunchConfiguration;
};

export type GodotCodeEditorSettingsUpdate = {
    textEditor: {
        enabled: boolean;
        execPath?: string;
        execFlags?: string;
    };
    dotnet?: GodotDotNetEditorSettings | null;
};

export type CreateNewEditorSettingsOptions = {
    templatePath: string;
    launchPath: string;
    editorConfigFilename: string;
    editorConfigFormat: number;
    codeEditorSettings: GodotCodeEditorSettingsUpdate;
};

const GODOT_DOTNET_DISABLED_EDITOR_ID = 0;

function serializeGodotString(value: string): string {
    return JSON.stringify(value);
}

function toTemplateDotNetSettings(
    dotnet: GodotCodeEditorSettingsUpdate['dotnet'],
):
    | {
          externalEditorId: number;
          customLaunchConfiguration?: GodotEditorLaunchConfiguration;
      }
    | undefined {
    if (dotnet === undefined) {
        return undefined;
    }

    const resolvedDotNet = dotnet ?? {
        externalEditorId: GODOT_DOTNET_DISABLED_EDITOR_ID,
    };

    return {
        externalEditorId: resolvedDotNet.externalEditorId,
        ...(resolvedDotNet.customLaunchConfiguration
            ? {
                  customLaunchConfiguration: {
                      execPath: serializeGodotString(
                          resolvedDotNet.customLaunchConfiguration.execPath,
                      ),
                      execFlags: serializeGodotString(
                          resolvedDotNet.customLaunchConfiguration.execFlags,
                      ),
                  },
              }
            : {}),
    };
}

export async function createNewEditorSettings({
    templatePath,
    launchPath,
    editorConfigFilename,
    editorConfigFormat,
    codeEditorSettings,
}: CreateNewEditorSettingsOptions): Promise<string> {
    const settingsTemplatePath = path.resolve(
        templatePath,
        EDITOR_SETTINGS_TEMPLATE_FILENAME,
    );
    const template = await fs.promises.readFile(settingsTemplatePath, 'utf-8');

    const editorSettings = mustache.render(template, {
        editorConfigFormat,
        textEditor: {
            enabled: codeEditorSettings.textEditor.enabled,
            execPath: serializeGodotString(
                codeEditorSettings.textEditor.execPath ?? '',
            ),
            execFlags: serializeGodotString(
                codeEditorSettings.textEditor.execFlags ?? '',
            ),
        },
        dotnet: toTemplateDotNetSettings(codeEditorSettings.dotnet),
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
    updates: GodotCodeEditorSettingsUpdate,
): Promise<void> {
    if (!fs.existsSync(editorSettingsPath)) {
        throw new Error(
            `Editor settings file not found: ${editorSettingsPath}`,
        );
    }

    let content = await fs.promises.readFile(editorSettingsPath, 'utf-8');
    const settingsMap: Record<string, string> = {};

    if (updates.textEditor.execPath !== undefined) {
        settingsMap['text_editor/external/exec_path'] = serializeGodotString(
            updates.textEditor.execPath,
        );
    }
    if (updates.textEditor.execFlags !== undefined) {
        settingsMap['text_editor/external/exec_flags'] = serializeGodotString(
            updates.textEditor.execFlags,
        );
    }
    settingsMap['text_editor/external/use_external_editor'] =
        updates.textEditor.enabled.toString();

    if (updates.dotnet !== undefined) {
        const dotnet = updates.dotnet ?? {
            externalEditorId: GODOT_DOTNET_DISABLED_EDITOR_ID,
        };
        settingsMap['dotnet/editor/external_editor'] =
            dotnet.externalEditorId.toString();

        if (dotnet.customLaunchConfiguration) {
            settingsMap['dotnet/editor/custom_exec_path'] =
                serializeGodotString(dotnet.customLaunchConfiguration.execPath);
            settingsMap['dotnet/editor/custom_exec_path_args'] =
                serializeGodotString(
                    dotnet.customLaunchConfiguration.execFlags,
                );
        }
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
