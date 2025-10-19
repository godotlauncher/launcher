// Mocked tests for updateEditorSettings
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { updateEditorSettings } from './godotProject.utils.js';

// Mock the fs module
vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
        promises: {
            readFile: vi.fn(),
            writeFile: vi.fn(),
            rename: vi.fn(),
        }
    },
    existsSync: vi.fn(),
    promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        rename: vi.fn(),
    }
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
            execPath: 'C:\\New\\Path\\VSCode\\Code.exe'
        });

        const writeFileCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const content = writeFileCall[1] as string;

        if (process.platform === 'win32') {
            expect(content).toContain('text_editor/external/exec_path = "C:\\\\New\\\\Path\\\\VSCode\\\\Code.exe"');
        }
        expect(content).toContain('interface/theme/preset = "Breeze Dark"');
        expect(content).toContain('[gd_resource type="EditorSettings"');
        
        // Verify atomic write
        expect(fs.promises.rename).toHaveBeenCalled();
    });

    test('should add mono settings when isMono is true', async () => {
        await updateEditorSettings(editorSettingsPath, {
            execPath: 'C:\\VSCode\\Code.exe',
            isMono: true
        });

        const writeFileCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const content = writeFileCall[1] as string;

        expect(content).toContain('dotnet/editor/external_editor = 4');
        expect(content).toContain('dotnet/editor/custom_exec_path_args = "{file}"');
    });

    test('should throw error when file does not exist', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await expect(
            updateEditorSettings(editorSettingsPath, { execPath: 'C:\\Code.exe' })
        ).rejects.toThrow('Editor settings file not found');
    });
});
