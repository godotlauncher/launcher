import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type { CodeEditorId } from '@shared/contracts';
import type {
    CodeEditorInstallation,
    CodeEditorIntegration,
    CodeEditorLaunchConfiguration,
    CodeEditorPathValidation,
    CodeEditorProjectConfigurationResult,
    CodeEditorProjectContext,
} from '../../codeEditorIntegration.types.js';
import {
    addOrUpdateVSCodeRecommendedExtensions,
    addVSCodeSettings,
    getVSCodeInstallPath,
    updateVSCodeSettings,
} from './vscodeIntegration.utils.js';

export const VS_CODE_INTEGRATION_ID = 'vscode' as const satisfies CodeEditorId;

@Injectable()
export class VSCodeIntegration implements CodeEditorIntegration {
    readonly metadata = {
        id: VS_CODE_INTEGRATION_ID,
        displayName: 'Visual Studio Code',
    };

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

        return {
            valid: true,
            installation: {
                path: candidatePath,
                version: null,
            },
        };
    }

    async isConfiguredForProject(projectPath: string): Promise<boolean> {
        return fs.existsSync(path.resolve(projectPath, '.vscode'));
    }

    getGodotLaunchConfiguration(
        installation: CodeEditorInstallation,
    ): CodeEditorLaunchConfiguration {
        const execPath =
            process.platform === 'darwin'
                ? path.resolve(
                      installation.path,
                      'Contents',
                      'MacOS',
                      'Electron',
                  )
                : installation.path;

        return {
            execPath,
            execFlags: '{project} --goto {file}:{line}:{col}',
        };
    }

    async configureProject(
        context: CodeEditorProjectContext,
    ): Promise<CodeEditorProjectConfigurationResult> {
        const recoveredConfigFiles =
            context.configurationMode === 'create'
                ? await addVSCodeSettings(
                      context.projectPath,
                      context.godotLaunchPath,
                      context.godotVersion,
                      context.mono,
                  )
                : await updateVSCodeSettings(
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
            recoveredConfigFiles: [...new Set(recoveredConfigFiles)],
        };
    }
}
