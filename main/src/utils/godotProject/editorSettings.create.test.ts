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
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.promises.readFile).mockResolvedValue('template');
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.promises.writeFile).mockResolvedValue();
        vi.mocked(mustache.render).mockReturnValue('rendered settings');
    });

    test('renders and writes a new editor settings file', async () => {
        const templatePath = path.resolve('templates');
        const launchPath = path.resolve('editor', 'godot');
        const editorConfigFilename = 'editor_settings-4.7.tres';
        const execPath = path.resolve('tools', 'code');
        const editorDataPath = path.resolve(
            path.dirname(launchPath),
            'editor_data',
        );
        const editorSettingsPath = path.resolve(
            editorDataPath,
            editorConfigFilename,
        );
        const expectedExecPath =
            process.platform === 'win32'
                ? execPath.replaceAll('\\', '\\\\')
                : execPath;

        await expect(
            createNewEditorSettings(
                templatePath,
                launchPath,
                editorConfigFilename,
                5,
                true,
                execPath,
                '{project} --goto {file}:{line}:{col}',
                true,
            ),
        ).resolves.toBe(editorSettingsPath);

        expect(fs.promises.readFile).toHaveBeenCalledWith(
            path.resolve(templatePath, EDITOR_SETTINGS_TEMPLATE_FILENAME),
            'utf-8',
        );
        expect(mustache.render).toHaveBeenCalledWith('template', {
            editorConfigFormat: 5,
            useExternalEditor: true,
            execPath: expectedExecPath,
            execFlags: '{project} --goto {file}:{line}:{col}',
            isMono: true,
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

    test('uses an existing editor_data directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);

        await createNewEditorSettings(
            path.resolve('templates'),
            path.resolve('editor', 'godot'),
            'editor_settings-4.7.tres',
            5,
            false,
            '',
            '',
            false,
        );

        expect(fs.promises.mkdir).not.toHaveBeenCalled();
        expect(fs.promises.writeFile).toHaveBeenCalledOnce();
    });
});
