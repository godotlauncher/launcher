// Mocked tests for updateEditorSettings

import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { updateEditorSettings } from '../../../electron/utils/godotProject.utils.js';

// Mock the fs module
vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
        promises: {
            readFile: vi.fn(),
            writeFile: vi.fn(),
            rename: vi.fn(),
        },
    },
    existsSync: vi.fn(),
    promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        rename: vi.fn(),
    },
}));

// Sample editor settings content similar to actual Godot editor_settings-*.tres file
const sampleEditorSettings = `[gd_resource type="EditorSettings" load_steps=2 format=3]

[sub_resource type="InputEventKey" id="InputEventKey_2t1hh"]
keycode = 4194326

[resource]
interface/theme/preset = "Breeze Dark"
interface/theme/base_color = Color(0.24, 0.26, 0.28, 1)
interface/theme/accent_color = Color(0.26, 0.76, 1, 1)
text_editor/theme/highlighting/symbol_color = Color(0.67, 0.79, 1, 1)
text_editor/theme/highlighting/keyword_color = Color(1, 0.44, 0.52, 1)
text_editor/external/exec_path = "C:\\\\Old\\\\Path\\\\Code.exe"
text_editor/external/exec_flags = "{project} --goto {file}:{line}:{col}"
text_editor/external/use_external_editor = true
export/android/debug_keystore = "G:/Godot/keystores/debug.keystore"
export/android/debug_keystore_pass = "android"
export/web/http_port = 8060
`;

// Sample editor settings WITHOUT external editor settings (fresh install)
const sampleEditorSettingsWithoutExternalEditor = `[gd_resource type="EditorSettings" load_steps=2 format=3]

[sub_resource type="InputEventKey" id="InputEventKey_2t1hh"]
keycode = 4194326

[resource]
interface/theme/preset = "Breeze Dark"
interface/theme/base_color = Color(0.24, 0.26, 0.28, 1)
interface/theme/accent_color = Color(0.26, 0.76, 1, 1)
text_editor/theme/highlighting/symbol_color = Color(0.67, 0.79, 1, 1)
text_editor/theme/highlighting/keyword_color = Color(1, 0.44, 0.52, 1)
export/android/debug_keystore = "G:/Godot/keystores/debug.keystore"
export/android/debug_keystore_pass = "android"
export/web/http_port = 8060
`;

// Sample editor settings with mono/.NET settings already present
const sampleEditorSettingsWithMono = `[gd_resource type="EditorSettings" load_steps=2 format=3]

[sub_resource type="InputEventKey" id="InputEventKey_2t1hh"]
keycode = 4194326

[resource]
interface/theme/preset = "Breeze Dark"
interface/theme/base_color = Color(0.24, 0.26, 0.28, 1)
interface/theme/accent_color = Color(0.26, 0.76, 1, 1)
text_editor/theme/highlighting/symbol_color = Color(0.67, 0.79, 1, 1)
text_editor/theme/highlighting/keyword_color = Color(1, 0.44, 0.52, 1)
text_editor/external/exec_path = "C:\\\\Old\\\\Path\\\\Code.exe"
text_editor/external/exec_flags = "{project} --goto {file}:{line}:{col}"
text_editor/external/use_external_editor = true
dotnet/editor/external_editor = 2
dotnet/editor/custom_exec_path_args = "{file}:{line}"
export/android/debug_keystore = "G:/Godot/keystores/debug.keystore"
export/android/debug_keystore_pass = "android"
export/web/http_port = 8060
`;

describe('updateEditorSettings (mocked)', () => {
    const editorSettingsPath = '/test/editor_settings-4.5.tres';

    beforeEach(() => {
        // Reset all mocks before each test
        vi.clearAllMocks();

        // Default mock behavior - file exists and can be read
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(sampleEditorSettings);
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('should update exec_path while preserving all other settings', async () => {
        await updateEditorSettings(editorSettingsPath, {
            execPath: 'C:\\New\\Path\\VSCode\\Code.exe',
        });

        const writeFileCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const content = writeFileCall[1] as string;

        if (process.platform === 'win32') {
            expect(content).toContain(
                'text_editor/external/exec_path = "C:\\\\New\\\\Path\\\\VSCode\\\\Code.exe"',
            );
        }
        expect(content).toContain('interface/theme/preset = "Breeze Dark"');
        expect(content).toContain('[gd_resource type="EditorSettings"');

        // Verify atomic write
        expect(fs.promises.rename).toHaveBeenCalled();
    });

    test('should add mono settings when isMono is true', async () => {
        await updateEditorSettings(editorSettingsPath, {
            execPath: 'C:\\VSCode\\Code.exe',
            isMono: true,
        });

        const writeFileCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const content = writeFileCall[1] as string;

        expect(content).toContain('dotnet/editor/external_editor = 4');
        expect(content).toContain(
            'dotnet/editor/custom_exec_path_args = "{file}"',
        );
    });

    test('should throw error when file does not exist', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await expect(
            updateEditorSettings(editorSettingsPath, {
                execPath: 'C:\\Code.exe',
            }),
        ).rejects.toThrow('Editor settings file not found');
    });

    // Case 1: Update existing settings
    describe('Case 1: Update existing settings that need to change', () => {
        test('should update execPath in existing settings', async () => {
            await updateEditorSettings(editorSettingsPath, {
                execPath: 'C:\\New\\Path\\VSCode\\Code.exe',
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify the old path is replaced with new path
            expect(content).not.toContain('C:\\\\Old\\\\Path\\\\Code.exe');
            if (process.platform === 'win32') {
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\\\New\\\\Path\\\\VSCode\\\\Code.exe"',
                );
            } else {
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\New\\Path\\VSCode\\Code.exe"',
                );
            }

            // Verify all other settings are preserved
            expect(content).toContain('interface/theme/preset = "Breeze Dark"');
            expect(content).toContain(
                'interface/theme/base_color = Color(0.24, 0.26, 0.28, 1)',
            );
            expect(content).toContain(
                'text_editor/external/exec_flags = "{project} --goto {file}:{line}:{col}"',
            );
            expect(content).toContain(
                'text_editor/external/use_external_editor = true',
            );
            expect(content).toContain(
                'export/android/debug_keystore = "G:/Godot/keystores/debug.keystore"',
            );
            expect(content).toContain('[gd_resource type="EditorSettings"');
            expect(content).toContain('[sub_resource type="InputEventKey"');
        });

        test('should update execFlags in existing settings', async () => {
            await updateEditorSettings(editorSettingsPath, {
                execFlags: '{file}:{line}:{col}',
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify the flags are updated
            expect(content).toContain(
                'text_editor/external/exec_flags = "{file}:{line}:{col}"',
            );
            expect(content).not.toContain('{project} --goto');

            // Verify all other settings are preserved
            expect(content).toContain(
                'text_editor/external/exec_path = "C:\\\\Old\\\\Path\\\\Code.exe"',
            );
            expect(content).toContain('interface/theme/preset = "Breeze Dark"');
        });

        test('should update useExternalEditor in existing settings', async () => {
            await updateEditorSettings(editorSettingsPath, {
                useExternalEditor: false,
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify the flag is updated
            expect(content).toContain(
                'text_editor/external/use_external_editor = false',
            );
            expect(content).not.toContain('use_external_editor = true');

            // Verify all other settings are preserved
            expect(content).toContain(
                'text_editor/external/exec_path = "C:\\\\Old\\\\Path\\\\Code.exe"',
            );
        });

        test('should update multiple existing settings at once', async () => {
            await updateEditorSettings(editorSettingsPath, {
                execPath: 'C:\\Updated\\VSCode.exe',
                execFlags: '{file}',
                useExternalEditor: false,
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify all three are updated
            if (process.platform === 'win32') {
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\\\Updated\\\\VSCode.exe"',
                );
            } else {
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\Updated\\VSCode.exe"',
                );
            }
            expect(content).toContain(
                'text_editor/external/exec_flags = "{file}"',
            );
            expect(content).toContain(
                'text_editor/external/use_external_editor = false',
            );

            // Verify old values are gone
            expect(content).not.toContain('C:\\\\Old\\\\Path\\\\Code.exe');
            expect(content).not.toContain('{project} --goto');
            expect(content).not.toContain('use_external_editor = true');
        });

        test('should update existing mono settings when isMono is true', async () => {
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                sampleEditorSettingsWithMono,
            );

            await updateEditorSettings(editorSettingsPath, {
                isMono: true,
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify mono settings are updated to correct values
            expect(content).toContain('dotnet/editor/external_editor = 4');
            expect(content).toContain(
                'dotnet/editor/custom_exec_path_args = "{file}"',
            );

            // Verify old mono values are replaced (external_editor was 2, now should be 4)
            expect(content).not.toContain('dotnet/editor/external_editor = 2');
            // Old custom_exec_path_args was "{file}:{line}", new one is "{file}"
            expect(content).not.toContain(
                'custom_exec_path_args = "{file}:{line}"',
            );
        });
    });

    // Case 2: Add missing settings while preserving existing ones
    describe('Case 2: Add missing settings while preserving all existing ones', () => {
        beforeEach(() => {
            // Use settings file without external editor config
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                sampleEditorSettingsWithoutExternalEditor,
            );
        });

        test('should add execPath when it does not exist', async () => {
            await updateEditorSettings(editorSettingsPath, {
                execPath: 'C:\\VSCode\\Code.exe',
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify execPath is added
            if (process.platform === 'win32') {
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\\\VSCode\\\\Code.exe"',
                );
            } else {
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\VSCode\\Code.exe"',
                );
            }

            // Verify all existing settings are preserved
            expect(content).toContain('interface/theme/preset = "Breeze Dark"');
            expect(content).toContain(
                'interface/theme/base_color = Color(0.24, 0.26, 0.28, 1)',
            );
            expect(content).toContain(
                'export/android/debug_keystore = "G:/Godot/keystores/debug.keystore"',
            );
            expect(content).toContain('[gd_resource type="EditorSettings"');

            // Verify the settings are added in the [resource] section
            expect(content).toMatch(
                /\[resource\][\s\S]*text_editor\/external\/exec_path/,
            );
        });

        test('should add execFlags when it does not exist', async () => {
            await updateEditorSettings(editorSettingsPath, {
                execFlags: '{project} --goto {file}:{line}:{col}',
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify execFlags is added
            expect(content).toContain(
                'text_editor/external/exec_flags = "{project} --goto {file}:{line}:{col}"',
            );

            // Verify all existing settings are preserved
            expect(content).toContain('interface/theme/preset = "Breeze Dark"');
            expect(content).toContain('export/web/http_port = 8060');
        });

        test('should add useExternalEditor when it does not exist', async () => {
            await updateEditorSettings(editorSettingsPath, {
                useExternalEditor: true,
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify useExternalEditor is added
            expect(content).toContain(
                'text_editor/external/use_external_editor = true',
            );

            // Verify all existing settings are preserved
            expect(content).toContain('interface/theme/preset = "Breeze Dark"');
        });

        test('should add all external editor settings when none exist', async () => {
            await updateEditorSettings(editorSettingsPath, {
                execPath: 'C:\\VSCode\\Code.exe',
                execFlags: '{project} --goto {file}:{line}:{col}',
                useExternalEditor: true,
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify all external editor settings are added
            if (process.platform === 'win32') {
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\\\VSCode\\\\Code.exe"',
                );
            } else {
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\VSCode\\Code.exe"',
                );
            }
            expect(content).toContain(
                'text_editor/external/exec_flags = "{project} --goto {file}:{line}:{col}"',
            );
            expect(content).toContain(
                'text_editor/external/use_external_editor = true',
            );

            // Verify all existing settings are preserved
            expect(content).toContain('interface/theme/preset = "Breeze Dark"');
            expect(content).toContain(
                'interface/theme/base_color = Color(0.24, 0.26, 0.28, 1)',
            );
            expect(content).toContain(
                'text_editor/theme/highlighting/symbol_color',
            );
            expect(content).toContain(
                'export/android/debug_keystore = "G:/Godot/keystores/debug.keystore"',
            );
            expect(content).toContain('export/web/http_port = 8060');
        });

        test('should add mono settings when they do not exist', async () => {
            await updateEditorSettings(editorSettingsPath, {
                isMono: true,
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify mono settings are added
            expect(content).toContain('dotnet/editor/external_editor = 4');
            expect(content).toContain(
                'dotnet/editor/custom_exec_path_args = "{file}"',
            );

            // Verify all existing settings are preserved
            expect(content).toContain('interface/theme/preset = "Breeze Dark"');
            expect(content).toContain(
                'export/android/debug_keystore = "G:/Godot/keystores/debug.keystore"',
            );
        });

        test('should add complete VSCode + mono setup when nothing exists', async () => {
            await updateEditorSettings(editorSettingsPath, {
                execPath: 'C:\\Program Files\\VSCode\\Code.exe',
                execFlags: '{project} --goto {file}:{line}:{col}',
                useExternalEditor: true,
                isMono: true,
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify all VSCode settings are added
            if (process.platform === 'win32') {
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\\\Program Files\\\\VSCode\\\\Code.exe"',
                );
            }
            expect(content).toContain(
                'text_editor/external/exec_flags = "{project} --goto {file}:{line}:{col}"',
            );
            expect(content).toContain(
                'text_editor/external/use_external_editor = true',
            );

            // Verify mono settings are added
            expect(content).toContain('dotnet/editor/external_editor = 4');
            expect(content).toContain(
                'dotnet/editor/custom_exec_path_args = "{file}"',
            );

            // Verify NO existing settings are lost
            expect(content).toContain('interface/theme/preset = "Breeze Dark"');
            expect(content).toContain(
                'interface/theme/base_color = Color(0.24, 0.26, 0.28, 1)',
            );
            expect(content).toContain(
                'interface/theme/accent_color = Color(0.26, 0.76, 1, 1)',
            );
            expect(content).toContain(
                'text_editor/theme/highlighting/symbol_color',
            );
            expect(content).toContain(
                'text_editor/theme/highlighting/keyword_color',
            );
            expect(content).toContain('export/android/debug_keystore');
            expect(content).toContain('export/android/debug_keystore_pass');
            expect(content).toContain('export/web/http_port');
        });
    });

    // Additional edge cases
    describe('Edge cases and validation', () => {
        test('should perform atomic write using temp file', async () => {
            await updateEditorSettings(editorSettingsPath, {
                execPath: 'C:\\Code.exe',
            });

            // Verify temp file is created and then renamed
            expect(fs.promises.writeFile).toHaveBeenCalledWith(
                editorSettingsPath + '.tmp',
                expect.any(String),
                'utf-8',
            );
            expect(fs.promises.rename).toHaveBeenCalledWith(
                editorSettingsPath + '.tmp',
                editorSettingsPath,
            );
        });

        test('should preserve formatting and structure of file', async () => {
            await updateEditorSettings(editorSettingsPath, {
                execPath: 'C:\\Code.exe',
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify sections are preserved
            expect(content).toContain('[gd_resource type="EditorSettings"');
            expect(content).toContain('[sub_resource type="InputEventKey"');
            expect(content).toContain('[resource]');

            // Verify resource attributes are preserved
            expect(content).toContain('load_steps=2');
            expect(content).toContain('format=3');
        });

        test('should handle paths with special characters correctly on Windows', async () => {
            if (process.platform === 'win32') {
                await updateEditorSettings(editorSettingsPath, {
                    execPath: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
                });

                const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                    .calls[0];
                const content = writeFileCall[1] as string;

                // Verify backslashes are properly escaped
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\\\Program Files\\\\Microsoft VS Code\\\\Code.exe"',
                );
            }
        });

        test('should only update specified settings, leaving others untouched', async () => {
            await updateEditorSettings(editorSettingsPath, {
                execPath: 'C:\\NewPath\\Code.exe',
                // Note: NOT updating execFlags or useExternalEditor
            });

            const writeFileCall = vi.mocked(fs.promises.writeFile).mock
                .calls[0];
            const content = writeFileCall[1] as string;

            // Verify only execPath is updated
            if (process.platform === 'win32') {
                expect(content).toContain(
                    'text_editor/external/exec_path = "C:\\\\NewPath\\\\Code.exe"',
                );
            }

            // Verify other external editor settings remain unchanged
            expect(content).toContain(
                'text_editor/external/exec_flags = "{project} --goto {file}:{line}:{col}"',
            );
            expect(content).toContain(
                'text_editor/external/use_external_editor = true',
            );
        });
    });
});
