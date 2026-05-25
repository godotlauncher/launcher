// Comprehensive tests for updateVSCodeSettings

import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { updateVSCodeSettings } from './vscode.utils.js';

// Mock electron-log to suppress expected warnings in tests
vi.mock('electron-log', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock the fs module
vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
        promises: {
            mkdir: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
        },
    },
    existsSync: vi.fn(),
    promises: {
        mkdir: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
    },
}));

// Sample VSCode settings without Godot configuration (fresh project)
const sampleSettingsWithoutGodot = `{
    "editor.fontSize": 14,
    "editor.fontFamily": "Consolas, 'Courier New', monospace",
    "workbench.colorTheme": "Default Dark+",
    "files.exclude": {
        "**/.git": true,
        "**/node_modules": true,
        "**/.DS_Store": true
    },
    "editor.minimap.enabled": true,
    "[javascript]": {
        "editor.defaultFormatter": "esbenp.prettier-vscode"
    }
}`;

// Sample VSCode settings with existing Godot configuration
const sampleSettingsWithGodot = `{
    "godotTools.editorPath.godot4": "/old/path/to/godot",
    "editor.tabSize": 2,
    "editor.insertSpaces": true,
    "files.eol": "\\r\\n",
    "editor.fontSize": 14,
    "workbench.colorTheme": "Default Dark+",
    "files.exclude": {
        "**/.git": true,
        "**/node_modules": true,
        "**/*.gd.uid": true
    }
}`;

// Sample VSCode settings with Godot 3 configuration
const sampleSettingsWithGodot3 = `{
    "godotTools.editorPath.godot3": "/path/to/godot3",
    "editor.tabSize": 4,
    "editor.insertSpaces": false,
    "files.eol": "\\n",
    "editor.fontSize": 12
}`;

// Sample VSCode settings with multiple user customizations
const sampleSettingsComplex = `{
    "godotTools.editorPath.godot4": "/old/godot/path",
    "editor.fontSize": 16,
    "editor.fontFamily": "Fira Code",
    "editor.fontLigatures": true,
    "workbench.colorTheme": "Monokai",
    "[gdscript]": {
        "editor.defaultFormatter": "geequlim.godot-tools",
        "editor.tabSize": 4
    },
    "files.associations": {
        "*.gd": "gdscript",
        "*.tres": "gdresource",
        "*.tscn": "gdscene"
    },
    "files.exclude": {
        "**/.git": true,
        "**/node_modules": true,
        "**/.import": true,
        "**/*.translation": true,
        "**/Thumbs.db": true
    },
    "search.exclude": {
        "**/.godot": true
    }
}`;

describe('updateVSCodeSettings (comprehensive)', () => {
    const projectDir = '/test/project';
    const _settingsPath = '/test/project/.vscode/settings.json';

    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock behavior
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.promises.readFile).mockResolvedValue('{}');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // Case 1: No existing settings at all
    describe('Case 1: No existing settings (fresh project setup)', () => {
        beforeEach(() => {
            // Mock: No .vscode directory, no settings.json
            vi.mocked(fs.existsSync).mockReturnValue(false);
        });

        test('should create .vscode directory when it does not exist', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            expect(fs.promises.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('.vscode'),
                { recursive: true },
            );
        });

        test('should create new settings.json with Godot 4 configuration', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot4', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            expect(writeCall[0]).toContain('settings.json');

            const writtenSettings = JSON.parse(writeCall[1] as string);

            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/path/to/godot4',
            );
            expect(writtenSettings['editor.tabSize']).toBe(4);
            expect(writtenSettings['editor.insertSpaces']).toBe(false);
            expect(writtenSettings['files.eol']).toBe('\n');
            expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
        });

        test('should create new settings.json with Godot 3 configuration', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot3', 3, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            expect(writtenSettings['godotTools.editorPath.godot3']).toBe(
                '/path/to/godot3',
            );
            expect(writtenSettings).not.toHaveProperty(
                'godotTools.editorPath.godot4',
            );
        });

        test('should create new settings.json with Godot 5 configuration', async () => {
            await updateVSCodeSettings(
                projectDir,
                '/path/to/godot5',
                5.0,
                false,
            );

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            expect(writtenSettings['godotTools.editorPath.godot5']).toBe(
                '/path/to/godot5',
            );
        });

        test('should handle fractional version numbers correctly (4.3 -> godot4)', async () => {
            await updateVSCodeSettings(
                projectDir,
                '/path/to/godot',
                4.3,
                false,
            );

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/path/to/godot',
            );
        });

        test('should write settings with proper formatting (4 spaces)', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const content = writeCall[1] as string;

            // Check for 4-space indentation
            expect(content).toContain('{\n    "godotTools');
        });
    });

    // Case 2: Existing settings without Godot configuration
    describe('Case 2: Existing user settings without Godot configuration', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockImplementation((p) =>
                p.toString().endsWith('settings.json'),
            );
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                sampleSettingsWithoutGodot,
            );
        });

        test('should add Godot configuration while preserving all user settings', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // Verify Godot settings are added
            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/path/to/godot',
            );
            expect(writtenSettings['editor.tabSize']).toBe(4);
            expect(writtenSettings['editor.insertSpaces']).toBe(false);
            expect(writtenSettings['files.eol']).toBe('\n');

            // Verify all user settings are preserved
            expect(writtenSettings['editor.fontSize']).toBe(14);
            expect(writtenSettings['editor.fontFamily']).toBe(
                "Consolas, 'Courier New', monospace",
            );
            expect(writtenSettings['workbench.colorTheme']).toBe(
                'Default Dark+',
            );
            expect(writtenSettings['editor.minimap.enabled']).toBe(true);

            // Verify nested user settings are preserved
            expect(
                writtenSettings['[javascript]']['editor.defaultFormatter'],
            ).toBe('esbenp.prettier-vscode');
        });

        test('should deep merge files.exclude preserving user excludes', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // User excludes should be preserved
            expect(writtenSettings['files.exclude']['**/.git']).toBe(true);
            expect(writtenSettings['files.exclude']['**/node_modules']).toBe(
                true,
            );
            expect(writtenSettings['files.exclude']['**/.DS_Store']).toBe(true);

            // Godot exclude should be added
            expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
        });

        test('should not create duplicate keys in files.exclude', async () => {
            // Modify fixture to already have the Godot UID exclude
            const settingsWithGodotExclude = JSON.parse(
                sampleSettingsWithoutGodot,
            );
            settingsWithGodotExclude['files.exclude']['**/*.gd.uid'] = true;
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(settingsWithGodotExclude, null, 4),
            );

            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const _writtenSettings = JSON.parse(writeCall[1] as string);
            const content = writeCall[1] as string;

            // Count occurrences of the UID exclude pattern
            const matches = content.match(/\*\*\/\*\.gd\.uid/g);
            expect(matches?.length).toBe(1); // Should appear only once
        });
    });

    // Case 3: Existing settings with Godot configuration that needs updating
    describe('Case 3: Existing Godot settings that need to be updated', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockImplementation((p) =>
                p.toString().endsWith('settings.json'),
            );
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                sampleSettingsWithGodot,
            );
        });

        test('should update Godot editor path', async () => {
            await updateVSCodeSettings(
                projectDir,
                '/new/path/to/godot',
                4,
                false,
            );

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // Verify path is updated
            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/new/path/to/godot',
            );

            // Verify it's not the old path
            expect(writtenSettings['godotTools.editorPath.godot4']).not.toBe(
                '/old/path/to/godot',
            );
        });

        test('should update launcher-managed settings (tabSize, insertSpaces, eol)', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // Verify launcher settings override user settings
            expect(writtenSettings['editor.tabSize']).toBe(4); // was 2
            expect(writtenSettings['editor.insertSpaces']).toBe(false); // was true
            expect(writtenSettings['files.eol']).toBe('\n'); // was \r\n
        });

        test('should preserve user settings not managed by launcher', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // Verify non-launcher settings are preserved
            expect(writtenSettings['editor.fontSize']).toBe(14);
            expect(writtenSettings['workbench.colorTheme']).toBe(
                'Default Dark+',
            );
        });

        test('should preserve existing files.exclude and add Godot exclude if missing', async () => {
            // Use settings without the *.gd.uid exclude
            const settingsWithoutUIDExclude = JSON.parse(
                sampleSettingsWithGodot,
            );
            delete settingsWithoutUIDExclude['files.exclude']['**/*.gd.uid'];
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(settingsWithoutUIDExclude, null, 4),
            );

            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // All existing excludes preserved
            expect(writtenSettings['files.exclude']['**/.git']).toBe(true);
            expect(writtenSettings['files.exclude']['**/node_modules']).toBe(
                true,
            );

            // Godot exclude added
            expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
        });

        test('should update Godot version key when switching versions (3 -> 4)', async () => {
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                sampleSettingsWithGodot3,
            );

            await updateVSCodeSettings(projectDir, '/path/to/godot4', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // New version key should be present
            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/path/to/godot4',
            );

            // Old version key should still exist (not our responsibility to remove)
            expect(writtenSettings['godotTools.editorPath.godot3']).toBe(
                '/path/to/godot3',
            );
        });
    });

    // Case 4: Complex existing settings with extensive user customizations
    describe('Case 4: Complex settings with extensive user customizations', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockImplementation((p) =>
                p.toString().endsWith('settings.json'),
            );
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                sampleSettingsComplex,
            );
        });

        test('should update Godot path while preserving all user customizations', async () => {
            await updateVSCodeSettings(projectDir, '/new/godot/path', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // Updated Godot path
            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/new/godot/path',
            );

            // All user customizations preserved
            expect(writtenSettings['editor.fontSize']).toBe(16);
            expect(writtenSettings['editor.fontFamily']).toBe('Fira Code');
            expect(writtenSettings['editor.fontLigatures']).toBe(true);
            expect(writtenSettings['workbench.colorTheme']).toBe('Monokai');
        });

        test('should preserve language-specific settings', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // Language-specific settings preserved
            expect(
                writtenSettings['[gdscript]']['editor.defaultFormatter'],
            ).toBe('geequlim.godot-tools');
            expect(writtenSettings['[gdscript]']['editor.tabSize']).toBe(4);
        });

        test('should preserve file associations', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // File associations preserved
            expect(writtenSettings['files.associations']['*.gd']).toBe(
                'gdscript',
            );
            expect(writtenSettings['files.associations']['*.tres']).toBe(
                'gdresource',
            );
            expect(writtenSettings['files.associations']['*.tscn']).toBe(
                'gdscene',
            );
        });

        test('should deep merge files.exclude preserving all user excludes', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // All user excludes preserved
            expect(writtenSettings['files.exclude']['**/.git']).toBe(true);
            expect(writtenSettings['files.exclude']['**/node_modules']).toBe(
                true,
            );
            expect(writtenSettings['files.exclude']['**/.import']).toBe(true);
            expect(writtenSettings['files.exclude']['**/*.translation']).toBe(
                true,
            );
            expect(writtenSettings['files.exclude']['**/Thumbs.db']).toBe(true);

            // Godot exclude ensured
            expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
        });

        test('should preserve non-files.exclude nested objects (search.exclude)', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // search.exclude should be untouched
            expect(writtenSettings['search.exclude']['**/.godot']).toBe(true);
        });
    });

    // Edge cases and error handling
    describe('Edge cases and error handling', () => {
        test('should handle corrupted JSON gracefully', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p) =>
                p.toString().endsWith('settings.json'),
            );
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                '{ invalid json }',
            );

            // Should not throw
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // Should create fresh settings
            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/path/to/godot',
            );
        });

        test('should handle empty settings.json file', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p) =>
                p.toString().endsWith('settings.json'),
            );
            vi.mocked(fs.promises.readFile).mockResolvedValue('{}');

            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/path/to/godot',
            );
        });

        test('should handle settings.json with only whitespace', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p) =>
                p.toString().endsWith('settings.json'),
            );
            vi.mocked(fs.promises.readFile).mockResolvedValue('   \n  \t  ');

            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/path/to/godot',
            );
        });

        test('should handle settings.json with JSONC comments', async () => {
            const jsoncContent = `{
    // This is a comment
    "editor.fontSize": 14,
    /* Multi-line comment */
    "files.exclude": {
        "**/.git": true
    }
}`;
            vi.mocked(fs.existsSync).mockImplementation((p) =>
                p.toString().endsWith('settings.json'),
            );
            vi.mocked(fs.promises.readFile).mockResolvedValue(jsoncContent);

            // Should handle gracefully (JSON.parse will fail on comments)
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // Should create fresh settings
            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/path/to/godot',
            );
        });

        test('should handle settings with null files.exclude gracefully', async () => {
            const settingsWithNullExclude = {
                'editor.fontSize': 14,
                'files.exclude': null,
            };
            vi.mocked(fs.existsSync).mockImplementation((p) =>
                p.toString().endsWith('settings.json'),
            );
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(settingsWithNullExclude),
            );

            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            // Should still add Godot exclude
            expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
            expect(writtenSettings['editor.fontSize']).toBe(14);
        });

        test('should not call mkdir if .vscode directory exists', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.promises.readFile).mockResolvedValue('{}');

            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            // mkdir should not be called since directory exists
            expect(fs.promises.mkdir).not.toHaveBeenCalled();
        });

        test('should handle paths with special characters', async () => {
            const specialPath = '/path/to/My Godot (4.3)/bin/godot';

            await updateVSCodeSettings(projectDir, specialPath, 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                specialPath,
            );
        });

        test('should handle very long editor paths', async () => {
            const longPath =
                '/very/long/path/with/many/directories/levels/deep/into/the/filesystem/godot';

            await updateVSCodeSettings(projectDir, longPath, 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);

            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                longPath,
            );
        });
    });

    // Mono/.NET specific behavior
    describe('Mono/.NET integration', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
        });

        test('should write settings.json when isMono is true', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, true);

            const writeCall = vi
                .mocked(fs.promises.writeFile)
                .mock.calls.find((c) =>
                    c[0].toString().endsWith('settings.json'),
                );

            expect(writeCall).toBeDefined();
            const writtenSettings = JSON.parse(writeCall?.[1] as string);
            expect(writtenSettings['godotTools.editorPath.godot4']).toBe(
                '/path/to/godot',
            );
        });

        test('should not write settings.json when isMono is false', async () => {
            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const settingsWriteCalls = vi
                .mocked(fs.promises.writeFile)
                .mock.calls.filter((c) =>
                    c[0].toString().endsWith('settings.json'),
                );

            expect(settingsWriteCalls.length).toBe(1);
        });
    });

    // Format and structure validation
    describe('Format and structure validation', () => {
        test('should maintain consistent JSON formatting (4-space indent)', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const content = writeCall[1] as string;

            // Check for 4-space indentation
            expect(content).toMatch(/\{\n {4}"/);
            expect(content).not.toMatch(/\{\n {2}"/); // Not 2 spaces
            expect(content).not.toMatch(/\{\n\t/); // Not tabs
        });

        test('should write valid JSON that can be parsed', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const content = writeCall[1] as string;

            // Should not throw
            expect(() => JSON.parse(content)).not.toThrow();
        });

        test('should preserve existing keys and add new Godot settings', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p) =>
                p.toString().endsWith('settings.json'),
            );
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                sampleSettingsWithoutGodot,
            );

            await updateVSCodeSettings(projectDir, '/path/to/godot', 4, false);

            const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
            const writtenSettings = JSON.parse(writeCall[1] as string);
            const keys = Object.keys(writtenSettings);

            // Verify both Godot and user keys are present
            expect(keys).toContain('godotTools.editorPath.godot4');
            expect(keys).toContain('editor.fontSize');
            expect(keys).toContain('workbench.colorTheme');

            // Verify we have all expected keys
            expect(keys.length).toBeGreaterThan(5);
        });
    });
});
