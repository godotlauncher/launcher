import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    CodeEditorId,
    CodeEditorInstallationSummary,
    CodeEditorIntegrationSummary,
    CodeEditorPathValidationResult,
} from '@shared/contracts';
import { TEMPLATE_DIR_NAME } from '../constants.js';
import { getAssetPath } from '../pathResolver.js';
import {
    createNewEditorSettings,
    updateEditorSettings,
} from '../utils/godotProject.utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import type {
    CodeEditorApplyResult,
    CodeEditorInstallation,
    CodeEditorProjectContext,
} from './codeEditorIntegration.types.js';

@Injectable()
export class CodeEditorIntegrationService {
    constructor(private readonly registry: CodeEditorIntegrationRegistry) {}

    listIntegrations(): CodeEditorIntegrationSummary[] {
        return this.registry.list().map((integration) => integration.metadata);
    }

    async scanIntegration(
        integrationId: CodeEditorId,
    ): Promise<CodeEditorInstallationSummary | null> {
        const integration = this.registry.get(integrationId);
        const installation = await integration.detectInstallation();
        return installation
            ? this.toInstallationSummary(integrationId, installation)
            : null;
    }

    async scanIntegrations(): Promise<CodeEditorInstallationSummary[]> {
        const detected = await Promise.all(
            this.registry
                .list()
                .map((integration) =>
                    this.scanIntegration(integration.metadata.id),
                ),
        );

        return detected.filter(
            (installation): installation is CodeEditorInstallationSummary =>
                installation !== null,
        );
    }

    async validateIntegrationPath(
        integrationId: CodeEditorId,
        pathToValidate: string,
    ): Promise<CodeEditorPathValidationResult> {
        const validation = await this.registry
            .get(integrationId)
            .validatePath(pathToValidate);

        return {
            valid: validation.valid,
            ...(validation.installation
                ? {
                      installation: this.toInstallationSummary(
                          integrationId,
                          validation.installation,
                      ),
                  }
                : {}),
            ...(validation.reason ? { reason: validation.reason } : {}),
        };
    }

    isConfiguredForProject(
        integrationId: CodeEditorId,
        projectPath: string,
    ): Promise<boolean> {
        return this.registry
            .get(integrationId)
            .isConfiguredForProject(projectPath);
    }

    async applyToProject(
        integrationId: CodeEditorId,
        context: CodeEditorProjectContext,
        customPath?: string,
    ): Promise<CodeEditorApplyResult> {
        const integration = this.registry.get(integrationId);
        const installation = await integration.detectInstallation(customPath);
        if (!installation) {
            throw new Error(
                `${integration.metadata.displayName} installation was not found.`,
            );
        }

        const integrationResult = await integration.configureProject(context);
        const launchConfiguration =
            integration.getGodotLaunchConfiguration(installation);

        let editorSettingsFile = context.editorSettingsFile;
        if (editorSettingsFile && fs.existsSync(editorSettingsFile)) {
            await updateEditorSettings(editorSettingsFile, {
                execPath: launchConfiguration.execPath,
                execFlags: launchConfiguration.execFlags,
                useExternalEditor: true,
                isMono: context.mono,
            });
        } else {
            editorSettingsFile = await createNewEditorSettings(
                path.resolve(getAssetPath(), TEMPLATE_DIR_NAME),
                context.godotLaunchPath,
                context.editorSettingsFilename,
                context.editorSettingsFormat,
                true,
                launchConfiguration.execPath,
                launchConfiguration.execFlags,
                context.mono,
            );
        }

        return {
            editorSettingsFile,
            recoveredConfigFiles: this.normalizeRecoveredFiles(
                context.projectPath,
                integrationResult.recoveredConfigFiles,
            ),
        };
    }

    async disableForProject(editorSettingsFile: string): Promise<void> {
        if (!editorSettingsFile || !fs.existsSync(editorSettingsFile)) {
            return;
        }

        await updateEditorSettings(editorSettingsFile, {
            useExternalEditor: false,
        });
    }

    private toInstallationSummary(
        integrationId: CodeEditorId,
        installation: CodeEditorInstallation,
    ): CodeEditorInstallationSummary {
        return {
            integrationId,
            ...installation,
        };
    }

    private normalizeRecoveredFiles(
        projectPath: string,
        recoveredFiles: string[],
    ): string[] {
        return [
            ...new Set(
                recoveredFiles.map((filePath) =>
                    path
                        .relative(projectPath, filePath)
                        .split(path.sep)
                        .join(path.posix.sep),
                ),
            ),
        ];
    }
}
