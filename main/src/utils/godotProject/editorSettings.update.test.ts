import * as fs from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { updateEditorSettings } from './editorSettings.utils.js';

vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        rename: vi.fn(),
    },
}));

const settingsWithDotNet = `[gd_resource type="EditorSettings" format=3]

[resource]
interface/theme/preset = "Breeze Dark"
text_editor/external/exec_path = "old"
text_editor/external/exec_flags = "{file}"
text_editor/external/use_external_editor = true
dotnet/editor/external_editor = 2
dotnet/editor/custom_exec_path = "old-custom"
dotnet/editor/custom_exec_path_args = "{file}:{line}"
`;

const settingsWithoutCodeEditor = `[gd_resource type="EditorSettings" format=3]

[resource]
interface/theme/preset = "Breeze Dark"
`;

function writtenContent(): string {
    return vi.mocked(fs.promises.writeFile).mock.calls[0][1] as string;
}

describe('updateEditorSettings', () => {
    const editorSettingsPath = '/test/editor_settings-4.5.tres';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(settingsWithDotNet);
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
    });

    test('writes integration-owned text and built-in .NET settings safely', async () => {
        const execPath = 'C:\\Tools\\Code "Preview".exe';
        const execFlags = '--goto "{file}"\\tail';

        await updateEditorSettings(editorSettingsPath, {
            textEditor: {
                enabled: true,
                execPath,
                execFlags,
            },
            dotnet: { externalEditorId: 7 },
        });

        const content = writtenContent();
        expect(content).toContain(
            `text_editor/external/exec_path = ${JSON.stringify(execPath)}`,
        );
        expect(content).toContain(
            `text_editor/external/exec_flags = ${JSON.stringify(execFlags)}`,
        );
        expect(content).toContain(
            'text_editor/external/use_external_editor = true',
        );
        expect(content).toContain('dotnet/editor/external_editor = 7');
        expect(content).toContain(
            'dotnet/editor/custom_exec_path = "old-custom"',
        );
        expect(content).toContain(
            'dotnet/editor/custom_exec_path_args = "{file}:{line}"',
        );
        expect(fs.promises.writeFile).toHaveBeenCalledWith(
            `${editorSettingsPath}.tmp`,
            expect.any(String),
            'utf-8',
        );
        expect(fs.promises.rename).toHaveBeenCalledWith(
            `${editorSettingsPath}.tmp`,
            editorSettingsPath,
        );
    });

    test('writes both custom .NET launch fields as one configuration', async () => {
        const customExecPath = 'C:\\Tools\\Editor "Custom".exe';
        const customExecFlags = '--line "{line}"\\tail';

        await updateEditorSettings(editorSettingsPath, {
            textEditor: { enabled: true },
            dotnet: {
                externalEditorId: 9,
                customLaunchConfiguration: {
                    execPath: customExecPath,
                    execFlags: customExecFlags,
                },
            },
        });

        const content = writtenContent();
        expect(content).toContain('dotnet/editor/external_editor = 9');
        expect(content).toContain(
            `dotnet/editor/custom_exec_path = ${JSON.stringify(customExecPath)}`,
        );
        expect(content).toContain(
            `dotnet/editor/custom_exec_path_args = ${JSON.stringify(customExecFlags)}`,
        );
    });

    test('leaves .NET settings unchanged when the project is standard', async () => {
        await updateEditorSettings(editorSettingsPath, {
            textEditor: { enabled: false },
        });

        const content = writtenContent();
        expect(content).toContain(
            'text_editor/external/use_external_editor = false',
        );
        expect(content).toContain('dotnet/editor/external_editor = 2');
        expect(content).toContain(
            'dotnet/editor/custom_exec_path_args = "{file}:{line}"',
        );
    });

    test('selects generic Disabled for .NET without deleting dormant custom fields', async () => {
        await updateEditorSettings(editorSettingsPath, {
            textEditor: { enabled: false },
            dotnet: null,
        });

        const content = writtenContent();
        expect(content).toContain('dotnet/editor/external_editor = 0');
        expect(content).toContain(
            'dotnet/editor/custom_exec_path = "old-custom"',
        );
        expect(content).toContain(
            'dotnet/editor/custom_exec_path_args = "{file}:{line}"',
        );
    });

    test('adds missing settings inside the resource section', async () => {
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            settingsWithoutCodeEditor,
        );

        await updateEditorSettings(editorSettingsPath, {
            textEditor: {
                enabled: true,
                execPath: '/opt/editor',
                execFlags: '{file}',
            },
            dotnet: { externalEditorId: 6 },
        });

        const content = writtenContent();
        expect(content).toMatch(
            /\[resource\][\s\S]*text_editor\/external\/exec_path = "\/opt\/editor"/,
        );
        expect(content).toContain('dotnet/editor/external_editor = 6');
        expect(content).toContain('interface/theme/preset = "Breeze Dark"');
    });

    test('rejects a missing settings file without writing', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await expect(
            updateEditorSettings(editorSettingsPath, {
                textEditor: { enabled: true },
            }),
        ).rejects.toThrow('Editor settings file not found');
        expect(fs.promises.writeFile).not.toHaveBeenCalled();
        expect(fs.promises.rename).not.toHaveBeenCalled();
    });
});
