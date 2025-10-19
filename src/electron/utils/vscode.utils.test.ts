import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { updateVSCodeSettings, addVSCodeNETLaunchConfig } from './vscode.utils.js';

// Mock electron-log to suppress expected warnings in tests
vi.mock('electron-log', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
}));

// Mock the fs module
vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
        promises: {
            mkdir: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
        }
    },
    existsSync: vi.fn(),
    promises: {
        mkdir: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
    }
}));

// Mock addVSCodeNETLaunchConfig
vi.mock('./vscode.utils.js', async () => {
    const actual = await vi.importActual<typeof import('./vscode.utils.js')>('./vscode.utils.js');
    return {
        ...actual,
        addVSCodeNETLaunchConfig: vi.fn(),
    };
});

describe('updateVSCodeSettings', () => {
    const testProjectDir = '/test/project';
    const vscodePath = '/test/project/.vscode';
    const settingsFile = '/test/project/.vscode/settings.json';

    beforeEach(() => {
        // Reset all mocks before each test
        vi.clearAllMocks();
        
        // Default mock behavior
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('should create new settings.json when file does not exist', async () => {
        // Mock: .vscode directory doesn't exist, settings.json doesn't exist
        vi.mocked(fs.existsSync).mockImplementation((path) => false);

        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        // Verify mkdir was called
        expect(fs.promises.mkdir).toHaveBeenCalledWith(
            expect.stringContaining('.vscode'),
            { recursive: true }
        );

        // Verify settings were written
        expect(fs.promises.writeFile).toHaveBeenCalledOnce();
        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);
        
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe('/path/to/godot');
        expect(writtenSettings['editor.tabSize']).toBe(4);
        expect(writtenSettings['editor.insertSpaces']).toBe(false);
        expect(writtenSettings['files.eol']).toBe('\n');
        expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
    });

    test('should merge with existing settings without overwriting user settings', async () => {
        const existingSettings = {
            'editor.fontSize': 14,
            'editor.fontFamily': 'Consolas',
            'files.exclude': {
                '**/.git': true,
                '**/node_modules': true
            },
            'myCustom.setting': 'value'
        };

        vi.mocked(fs.existsSync).mockImplementation((p) => 
            p.toString().endsWith('settings.json')
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existingSettings, null, 4)
        );

        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Check that user settings are preserved
        expect(writtenSettings['editor.fontSize']).toBe(14);
        expect(writtenSettings['editor.fontFamily']).toBe('Consolas');
        expect(writtenSettings['myCustom.setting']).toBe('value');

        // Check that launcher settings are added
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe('/path/to/godot');
        expect(writtenSettings['editor.tabSize']).toBe(4);

        // Check that files.exclude is deep merged
        expect(writtenSettings['files.exclude']['**/.git']).toBe(true);
        expect(writtenSettings['files.exclude']['**/node_modules']).toBe(true);
        expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
    });

    test('should update existing Godot path when settings exist', async () => {
        const existingSettings = {
            'godotTools.editorPath.godot4': '/old/path/to/godot',
            'editor.tabSize': 2
        };

        vi.mocked(fs.existsSync).mockImplementation((p) => 
            p.toString().endsWith('settings.json')
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existingSettings, null, 4)
        );

        await updateVSCodeSettings(testProjectDir, '/new/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Check that Godot path is updated
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe('/new/path/to/godot');
        // Check that other settings are updated to launcher defaults
        expect(writtenSettings['editor.tabSize']).toBe(4);
    });

    test('should handle different Godot versions correctly', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        // Test Godot 3
        await updateVSCodeSettings(testProjectDir, '/path/to/godot3', 3, false);
        let writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        let writtenSettings = JSON.parse(writeCall[1] as string);
        expect(writtenSettings['godotTools.editorPath.godot3']).toBe('/path/to/godot3');

        // Test Godot 4.3
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(false);
        await updateVSCodeSettings(testProjectDir, '/path/to/godot4', 4.3, false);
        writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        writtenSettings = JSON.parse(writeCall[1] as string);
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe('/path/to/godot4');

        // Test Godot 5
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(false);
        await updateVSCodeSettings(testProjectDir, '/path/to/godot5', 5.0, false);
        writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        writtenSettings = JSON.parse(writeCall[1] as string);
        expect(writtenSettings['godotTools.editorPath.godot5']).toBe('/path/to/godot5');
    });

    test('should preserve user file excludes when merging', async () => {
        const existingSettings = {
            'files.exclude': {
                '**/.DS_Store': true,
                '**/Thumbs.db': true,
                '**/*.tmp': true
            }
        };

        vi.mocked(fs.existsSync).mockImplementation((p) => 
            p.toString().endsWith('settings.json')
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existingSettings, null, 4)
        );

        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // All user excludes should be preserved
        expect(writtenSettings['files.exclude']['**/.DS_Store']).toBe(true);
        expect(writtenSettings['files.exclude']['**/Thumbs.db']).toBe(true);
        expect(writtenSettings['files.exclude']['**/*.tmp']).toBe(true);
        // Launcher exclude should be added
        expect(writtenSettings['files.exclude']['**/*.gd.uid']).toBe(true);
    });

    test('should handle corrupted JSON gracefully and create new file', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => 
            p.toString().endsWith('settings.json')
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue('{ invalid json content }');

        // Should not throw, should create new settings
        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Should have fresh launcher settings
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe('/path/to/godot');
        expect(writtenSettings['editor.tabSize']).toBe(4);
    });

    test('should handle empty settings.json file', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => 
            p.toString().endsWith('settings.json')
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue('{}');

        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        expect(writtenSettings['godotTools.editorPath.godot4']).toBe('/path/to/godot');
        expect(writtenSettings['editor.tabSize']).toBe(4);
    });

    test('should handle settings with comments (JSONC) gracefully', async () => {
        const jsoncContent = `{
    // This is a comment
    "editor.fontSize": 14,
    /* Multi-line
       comment */
    "files.exclude": {
        "**/.git": true
    }
}`;

        vi.mocked(fs.existsSync).mockImplementation((p) => 
            p.toString().endsWith('settings.json')
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(jsoncContent);

        // Should handle gracefully (JSON.parse will fail, but function should continue)
        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Should have fresh launcher settings (fallback behavior)
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe('/path/to/godot');
    });

    test('should overwrite launcher-managed keys but preserve others', async () => {
        const existingSettings = {
            'godotTools.editorPath.godot4': '/old/path',
            'editor.tabSize': 2,
            'editor.insertSpaces': true,
            'files.eol': '\r\n',
            'editor.fontSize': 14,
            'workbench.colorTheme': 'Dark+'
        };

        vi.mocked(fs.existsSync).mockImplementation((p) => 
            p.toString().endsWith('settings.json')
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existingSettings, null, 4)
        );

        await updateVSCodeSettings(testProjectDir, '/new/path', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Launcher-managed keys should be overwritten
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe('/new/path');
        expect(writtenSettings['editor.tabSize']).toBe(4);
        expect(writtenSettings['editor.insertSpaces']).toBe(false);
        expect(writtenSettings['files.eol']).toBe('\n');

        // User settings should be preserved
        expect(writtenSettings['editor.fontSize']).toBe(14);
        expect(writtenSettings['workbench.colorTheme']).toBe('Dark+');
    });

    test('should handle nested objects in existing settings', async () => {
        const existingSettings = {
            '[gdscript]': {
                'editor.defaultFormatter': 'geequlim.godot-tools'
            },
            'files.associations': {
                '*.gd': 'gdscript',
                '*.tres': 'gdresource'
            }
        };

        vi.mocked(fs.existsSync).mockImplementation((p) => 
            p.toString().endsWith('settings.json')
        );
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existingSettings, null, 4)
        );

        await updateVSCodeSettings(testProjectDir, '/path/to/godot', 4, false);

        const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
        const writtenSettings = JSON.parse(writeCall[1] as string);

        // Nested objects should be preserved
        expect(writtenSettings['[gdscript]']['editor.defaultFormatter']).toBe('geequlim.godot-tools');
        expect(writtenSettings['files.associations']['*.gd']).toBe('gdscript');
        expect(writtenSettings['files.associations']['*.tres']).toBe('gdresource');

        // New settings should be added
        expect(writtenSettings['godotTools.editorPath.godot4']).toBe('/path/to/godot');
    });
});

