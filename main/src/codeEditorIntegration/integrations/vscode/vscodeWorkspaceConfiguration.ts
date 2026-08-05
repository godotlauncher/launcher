import * as fs from 'node:fs';
import path from 'node:path';
import logger from 'electron-log';
import {
    insertJSONCValues,
    isJSONObject,
    type JSONObject,
    jsonValuesEqual,
    readJSONCConfig,
    setJSONCValue,
} from '../projectConfigurationJsonc.utils.js';

function isExtensionsFile(
    value: unknown,
): value is JSONObject & { recommendations?: string[] } {
    return (
        isJSONObject(value) &&
        (value.recommendations === undefined ||
            (Array.isArray(value.recommendations) &&
                value.recommendations.every(
                    (recommendation) => typeof recommendation === 'string',
                )))
    );
}

function warnInvalid(filePath: string, description: string) {
    return (parseErrors: number) =>
        logger.warn(`Recovering invalid VS Code ${description}`, {
            filePath,
            parseErrors,
        });
}

export async function updateVSCodeWorkspaceSettings(
    projectDir: string,
    launchPath: string,
    editorVersion: number,
): Promise<string[]> {
    const settings: JSONObject & { 'files.exclude': JSONObject } = {
        [`godotTools.editorPath.godot${Math.floor(editorVersion)}`]: launchPath,
        'editor.tabSize': 4,
        'editor.insertSpaces': false,
        'files.eol': '\n',
        'files.exclude': {
            '**/*.gd.uid': true,
            '**/*.cs.uid': true,
        },
    };
    const configDir = path.resolve(projectDir, '.vscode');
    await fs.promises.mkdir(configDir, { recursive: true });
    const settingsFile = path.resolve(configDir, 'settings.json');
    const result = await readJSONCConfig(
        settingsFile,
        isJSONObject,
        warnInvalid(settingsFile, 'settings.json'),
    );
    let settingsText = JSON.stringify(settings, null, 4);

    if (result.parsed && result.raw !== null) {
        const { 'files.exclude': filesExclude, ...topLevelSettings } = settings;
        settingsText = Object.entries(topLevelSettings).reduce(
            (text, [key, value]) =>
                jsonValuesEqual(result.parsed?.[key], value)
                    ? text
                    : setJSONCValue(text, [key], value),
            result.raw,
        );

        const existingExcludes = result.parsed['files.exclude'];
        settingsText = isJSONObject(existingExcludes)
            ? Object.entries(filesExclude).reduce(
                  (text, [key, value]) =>
                      jsonValuesEqual(existingExcludes[key], value)
                          ? text
                          : setJSONCValue(text, ['files.exclude', key], value),
                  settingsText,
              )
            : setJSONCValue(settingsText, ['files.exclude'], filesExclude);
    }

    if (settingsText !== result.raw) {
        await fs.promises.writeFile(settingsFile, settingsText, 'utf-8');
    }
    return result.recoveredFiles;
}

export async function updateVSCodeRecommendations(
    projectDir: string,
    isMono: boolean,
    removeVSCodiumRecommendation: boolean,
): Promise<string[]> {
    const recommendations = [
        'geequlim.godot-tools',
        'mariodebono.godot-4-vscode-theme',
        ...(isMono ? ['ms-dotnettools.csharp'] : []),
    ];
    const configDir = path.resolve(projectDir, '.vscode');
    await fs.promises.mkdir(configDir, { recursive: true });
    const extensionsFile = path.resolve(configDir, 'extensions.json');
    const result = await readJSONCConfig(
        extensionsFile,
        isExtensionsFile,
        warnInvalid(extensionsFile, 'extensions.json'),
    );

    if (!result.parsed || result.raw === null) {
        await fs.promises.writeFile(
            extensionsFile,
            JSON.stringify({ recommendations }, null, 4),
            'utf-8',
        );
        return result.recoveredFiles;
    }

    const existing = result.parsed.recommendations ?? [];
    const indexesToRemove = removeVSCodiumRecommendation
        ? existing
              .map((recommendation, index) =>
                  recommendation === 'nromanov.dotrush' ? index : -1,
              )
              .filter((index) => index >= 0)
              .sort((left, right) => right - left)
        : [];
    const retained = existing.filter(
        (recommendation) =>
            !removeVSCodiumRecommendation ||
            recommendation !== 'nromanov.dotrush',
    );
    const missing = recommendations.filter(
        (recommendation) => !retained.includes(recommendation),
    );
    let extensionsText = result.raw;

    if (result.parsed.recommendations === undefined) {
        extensionsText = setJSONCValue(
            extensionsText,
            ['recommendations'],
            recommendations,
        );
    } else {
        extensionsText = indexesToRemove.reduce(
            (text, index) =>
                setJSONCValue(text, ['recommendations', index], undefined),
            extensionsText,
        );
        extensionsText = insertJSONCValues(
            extensionsText,
            ['recommendations'],
            retained.length,
            missing,
        );
    }

    if (extensionsText !== result.raw) {
        await fs.promises.writeFile(extensionsFile, extensionsText, 'utf-8');
    }
    return result.recoveredFiles;
}
