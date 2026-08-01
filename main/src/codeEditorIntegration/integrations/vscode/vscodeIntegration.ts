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
    addOrUpdateVSCodeRecommendedExtensions,
    getVSCodeInstallPath,
    updateVSCodeSettings,
} from './vscodeIntegration.utils.js';

export const VS_CODE_INTEGRATION_ID = 'vscode' as const satisfies CodeEditorId;
const VS_CODE_DEFAULT_EXEC_FLAGS = '{project} --goto {file}:{line}:{col}';

@Injectable()
export class VSCodeIntegration implements CodeEditorIntegration {
    readonly metadata = {
        id: VS_CODE_INTEGRATION_ID,
        displayName: 'Visual Studio Code',
        capabilities: {
            dotnet: true,
        },
    };

    readonly defaultSettings = { execFlags: VS_CODE_DEFAULT_EXEC_FLAGS };
    async detectInstallation(
        customPath?: string,
    ): Promise<CodeEditorInstallation | null> {
        const installationPath = await getVSCodeInstallPath(customPath);
        return installationPath
            ? { path: installationPath, version: null }
            : null;
    }

    async validatePath(
        pathToValidate: string,
    ): Promise<CodeEditorPathValidation> {
        const candidatePath = pathToValidate.trim();
        if (!candidatePath) {
            return {
                valid: false,
                reason: 'Path is empty.',
            };
        }

        if (!fs.existsSync(candidatePath)) {
            return {
                valid: false,
                reason: 'Path does not exist.',
            };
        }

        const installationPath = await getVSCodeInstallPath(candidatePath);
        if (!installationPath) {
            return {
                valid: false,
                reason: 'Path is not a supported Visual Studio Code installation.',
            };
        }

        return {
            valid: true,
            installation: {
                path: installationPath,
                version: null,
            },
        };
    }

    async isConfiguredForProject(projectPath: string): Promise<boolean> {
        return fs.existsSync(path.resolve(projectPath, '.vscode'));
    }

    resolveGodotConfiguration(input: {
        installation: CodeEditorInstallation;
        settings: { execFlagsOverride: string | null };
        godotFlavor: 'standard' | 'dotnet';
        godotVersion: number;
    }): GodotCodeEditorConfiguration {
        return {
            textEditor: {
                execPath: this.resolveWindowsGodotExecPath(
                    input.installation.path,
                ),
                execFlags:
                    input.settings.execFlagsOverride ??
                    this.defaultSettings.execFlags,
            },
            ...(input.godotFlavor === 'dotnet'
                ? {
                      dotnet: {
                          externalEditorId: 4,
                      },
                  }
                : {}),
        };
    }

    async configureProject(
        context: CodeEditorProjectContext,
    ): Promise<CodeEditorProjectConfigurationResult> {
        const recoveredConfigFiles = await updateVSCodeSettings(
            context.projectPath,
            context.godotLaunchPath,
            context.godotVersion,
            context.mono,
        );

        recoveredConfigFiles.push(
            ...(await addOrUpdateVSCodeRecommendedExtensions(
                context.projectPath,
                context.mono,
            )),
        );

        return {
            recoveredConfigFiles,
        };
    }

    private resolveWindowsGodotExecPath(installationPath: string): string {
        if (process.platform !== 'win32') {
            return installationPath;
        }

        if (path.basename(installationPath).toLowerCase() === 'code.cmd') {
            return installationPath;
        }

        const codeCommandPath = path.resolve(
            path.dirname(installationPath),
            'bin',
            'code.cmd',
        );

        return fs.existsSync(codeCommandPath)
            ? codeCommandPath
            : installationPath;
    }
}
