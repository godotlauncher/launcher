import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorProjectContext } from '../../codeEditorIntegration.types.js';
import { VSCodeIntegration } from './vscodeIntegration.js';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    default: { existsSync: fsMocks.existsSync },
}));

const vscodeMocks = vi.hoisted(() => ({
    addOrUpdateVSCodeRecommendedExtensions: vi.fn(),
    addVSCodeSettings: vi.fn(),
    getVSCodeInstallPath: vi.fn(),
    updateVSCodeSettings: vi.fn(),
}));

vi.mock('./vscodeIntegration.utils.js', () => vscodeMocks);

function createContext(
    overrides: Partial<CodeEditorProjectContext> = {},
): CodeEditorProjectContext {
    return {
        projectPath: path.resolve('project'),
        godotLaunchPath: path.resolve('godot', 'Godot'),
        godotVersion: 4.3,
        mono: false,
        editorSettingsFile: path.resolve('editor_settings.tres'),
        editorSettingsFilename: 'editor_settings.tres',
        editorSettingsFormat: 3,
        configurationMode: 'create',
        ...overrides,
    };
}

describe('VSCodeIntegration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.existsSync.mockReturnValue(false);
        vscodeMocks.addVSCodeSettings.mockResolvedValue([]);
        vscodeMocks.updateVSCodeSettings.mockResolvedValue([]);
        vscodeMocks.addOrUpdateVSCodeRecommendedExtensions.mockResolvedValue(
            [],
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('detects installations and validates explicit paths independently', async () => {
        const integration = new VSCodeIntegration();
        const candidatePath = path.resolve('tools', 'code');
        vscodeMocks.getVSCodeInstallPath.mockResolvedValue(candidatePath);

        await expect(
            integration.detectInstallation(candidatePath),
        ).resolves.toEqual({
            path: candidatePath,
            version: null,
        });

        await expect(integration.validatePath('')).resolves.toEqual({
            valid: false,
            reason: 'Path is empty.',
        });
        await expect(integration.validatePath(candidatePath)).resolves.toEqual({
            valid: false,
            reason: 'Path does not exist.',
        });

        fsMocks.existsSync.mockReturnValue(true);
        await expect(
            integration.validatePath(` ${candidatePath} `),
        ).resolves.toEqual({
            valid: true,
            installation: {
                path: candidatePath,
                version: null,
            },
        });
    });

    it('configures VS Code-owned project files through existing utilities', async () => {
        const integration = new VSCodeIntegration();
        const context = createContext();
        vscodeMocks.addVSCodeSettings.mockResolvedValue([
            path.resolve('settings.bad'),
        ]);
        vscodeMocks.addOrUpdateVSCodeRecommendedExtensions.mockResolvedValue([
            path.resolve('extensions.bad'),
        ]);

        await expect(integration.configureProject(context)).resolves.toEqual({
            recoveredConfigFiles: [
                path.resolve('settings.bad'),
                path.resolve('extensions.bad'),
            ],
        });
        expect(vscodeMocks.addVSCodeSettings).toHaveBeenCalledWith(
            context.projectPath,
            context.godotLaunchPath,
            context.godotVersion,
            context.mono,
        );
        expect(vscodeMocks.updateVSCodeSettings).not.toHaveBeenCalled();
        expect(
            vscodeMocks.addOrUpdateVSCodeRecommendedExtensions,
        ).toHaveBeenCalledWith(context.projectPath, context.mono);
    });

    it('normalizes macOS app bundles for Godot', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        const integration = new VSCodeIntegration();

        expect(
            integration.getGodotLaunchConfiguration({
                path: '/Applications/Visual Studio Code.app',
                version: null,
            }),
        ).toEqual({
            execPath: path.resolve(
                '/Applications/Visual Studio Code.app',
                'Contents',
                'MacOS',
                'Electron',
            ),
            execFlags: '{project} --goto {file}:{line}:{col}',
        });
    });
});
