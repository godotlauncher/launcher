import * as fs from 'node:fs';
import * as path from 'node:path';
import mustache from 'mustache';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { EDITOR_SETTINGS_TEMPLATE_FILENAME } from '../../constants.js';
import { createNewEditorSettings } from './editorSettings.utils.js';

vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    promises: {
        mkdir: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
    },
}));

vi.mock('mustache', () => ({
    default: {
        render: vi.fn(),
    },
}));

describe('createNewEditorSettings', () => {
    const templatePath = path.resolve('templates');
    const launchPath = path.resolve('editor', 'godot');
    const editorConfigFilename = 'editor_settings-4.7.tres';
    const editorDataPath = path.resolve(
        path.dirname(launchPath),
        'editor_data',
    );
    const editorSettingsPath = path.resolve(
        editorDataPath,
        editorConfigFilename,
    );

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.promises.readFile).mockResolvedValue('template');
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.promises.writeFile).mockResolvedValue();
        vi.mocked(mustache.render).mockReturnValue('rendered settings');
    });

    test('renders standard editor settings with Godot-safe strings', async () => {
        const execPath = path.resolve('tools', 'Code "Preview"');
        const execFlags = '{project} --goto "{file}"\\tail';

        await expect(
            createNewEditorSettings({
                templatePath,
                launchPath,
                editorConfigFilename,
                editorConfigFormat: 5,
                codeEditorSettings: {
                    textEditor: {
                        enabled: true,
                        execPath,
                        execFlags,
                    },
                },
            }),
        ).resolves.toBe(editorSettingsPath);

        expect(fs.promises.readFile).toHaveBeenCalledWith(
            path.resolve(templatePath, EDITOR_SETTINGS_TEMPLATE_FILENAME),
            'utf-8',
        );
        expect(mustache.render).toHaveBeenCalledWith('template', {
            editorConfigFormat: 5,
            textEditor: {
                enabled: true,
                execPath: JSON.stringify(execPath),
                execFlags: JSON.stringify(execFlags),
            },
            dotnet: undefined,
        });
        expect(fs.promises.mkdir).toHaveBeenCalledWith(editorDataPath, {
            recursive: true,
        });
        expect(fs.promises.writeFile).toHaveBeenCalledWith(
            editorSettingsPath,
            'rendered settings',
            'utf-8',
        );
    });

    test('renders an integration-owned custom .NET launch configuration atomically', async () => {
        const customExecPath = path.resolve('tools', 'custom "editor"');
        const customExecFlags = '--line "{line}"\\tail';

        await createNewEditorSettings({
            templatePath,
            launchPath,
            editorConfigFilename,
            editorConfigFormat: 5,
            codeEditorSettings: {
                textEditor: {
                    enabled: true,
                    execPath: path.resolve('tools', 'editor'),
                    execFlags: '{file}',
                },
                dotnet: {
                    externalEditorId: 9,
                    customLaunchConfiguration: {
                        execPath: customExecPath,
                        execFlags: customExecFlags,
                    },
                },
            },
        });

        expect(mustache.render).toHaveBeenCalledWith(
            'template',
            expect.objectContaining({
                dotnet: {
                    externalEditorId: 9,
                    customLaunchConfiguration: {
                        execPath: JSON.stringify(customExecPath),
                        execFlags: JSON.stringify(customExecFlags),
                    },
                },
            }),
        );
    });

    test('renders the generic disabled .NET editor and reuses editor_data', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);

        await createNewEditorSettings({
            templatePath,
            launchPath,
            editorConfigFilename,
            editorConfigFormat: 5,
            codeEditorSettings: {
                textEditor: { enabled: false },
                dotnet: null,
            },
        });

        expect(mustache.render).toHaveBeenCalledWith(
            'template',
            expect.objectContaining({
                textEditor: {
                    enabled: false,
                    execPath: '""',
                    execFlags: '""',
                },
                dotnet: { externalEditorId: 0 },
            }),
        );
        expect(fs.promises.mkdir).not.toHaveBeenCalled();
    });
});
