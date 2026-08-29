import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type { CodeEditorId } from '@shared/contracts';
import type {
    CodeEditorInstallation,
    CodeEditorIntegration,
    CodeEditorPathValidation,
    CodeEditorProjectConfigurationResult,
    CodeEditorProjectContext,
    GodotCodeEditorConfiguration,
} from '../../codeEditorIntegration.types.js';
import {
    getVSCodiumInstallation,
    resolveVSCodiumGodotConfiguration,
    validateVSCodiumInstallation,
} from './vscodiumInstallation.js';
import { configureVSCodiumProject } from './vscodiumProjectConfiguration.js';

const VSCODIUM_INTEGRATION_ID = 'vscodium' as const satisfies CodeEditorId;
const VSCODIUM_DEFAULT_EXEC_FLAGS = '{project} --goto {file}:{line}:{col}';

@Injectable()
export class VSCodiumIntegration implements CodeEditorIntegration {
    readonly metadata = {
        id: VSCODIUM_INTEGRATION_ID,
        displayName: 'VSCodium',
        capabilities: {
            dotnet: true,
        },
    };

    readonly defaultSettings = { execFlags: VSCODIUM_DEFAULT_EXEC_FLAGS };

    async detectInstallation(
        customPath?: string,
    ): Promise<CodeEditorInstallation | null> {
        return getVSCodiumInstallation(customPath);
    }
    async validateInstallation(
        installation: CodeEditorInstallation,
    ): Promise<CodeEditorInstallation | null> {
        return validateVSCodiumInstallation(installation);
    }

    async validatePath(
        pathToValidate: string,
    ): Promise<CodeEditorPathValidation> {
        const candidatePath = pathToValidate.trim();
        if (!candidatePath) {
            return { valid: false, reason: 'Path is empty.' };
        }

        const installation = await getVSCodiumInstallation(candidatePath);
        return installation
            ? { valid: true, installation }
            : {
                  valid: false,
                  reason: 'Path is not a supported VSCodium installation.',
              };
    }

    /**
     * Reports whether the shared VS Code-family project directory is present.
     *
     * @param projectPath - Godot project directory.
     * @returns Whether a .vscode directory exists for the project.
     */
    async isConfiguredForProject(projectPath: string): Promise<boolean> {
        return fs.existsSync(path.resolve(projectPath, '.vscode'));
    }

    resolveGodotConfiguration(input: {
        installation: CodeEditorInstallation;
        settings: { execFlagsOverride: string | null };
        godotFlavor: 'standard' | 'dotnet';
        godotVersion: number;
    }): GodotCodeEditorConfiguration {
        const configuration = resolveVSCodiumGodotConfiguration(
            input.installation.path,
            input.settings.execFlagsOverride ?? this.defaultSettings.execFlags,
        );

        return {
            textEditor: configuration,
            ...(input.godotFlavor === 'dotnet'
                ? // Godot has no VSCodium ID. None lets C# fall through to the
                  // exact generic external-editor path and one-based locations.
                  { dotnet: { externalEditorId: 0 } }
                : {}),
        };
    }

    async configureProject(
        context: CodeEditorProjectContext,
    ): Promise<CodeEditorProjectConfigurationResult> {
        return {
            recoveredConfigFiles: await configureVSCodiumProject(
                context.projectPath,
                context.godotLaunchPath,
                context.godotVersion,
                context.mono,
                context.previousCodeEditorId ?? null,
            ),
        };
    }
}
