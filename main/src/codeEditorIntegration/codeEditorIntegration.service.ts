import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    CodeEditorId,
    CodeEditorInstallationSummary,
    CodeEditorIntegrationSettings,
    CodeEditorIntegrationSummary,
    CodeEditorPathValidationResult,
    UpdateCodeEditorIntegrationSettings,
} from '@shared/contracts';
import { TEMPLATE_DIR_NAME } from '../constants.js';
import { getAssetPath } from '../pathResolver.js';
import {
    createNewEditorSettings,
    updateEditorSettings,
} from '../utils/godotProject.utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationSettingsStore } from './codeEditorIntegration.settingsStore.js';
import type {
    CodeEditorApplyResult,
    CodeEditorInstallation,
    CodeEditorProjectContext,
} from './codeEditorIntegration.types.js';

@Injectable()
export class CodeEditorIntegrationService {
    constructor(
        private readonly registry: CodeEditorIntegrationRegistry,
        private readonly settingsStore: CodeEditorIntegrationSettingsStore,
    ) {}

    listIntegrations(): CodeEditorIntegrationSummary[] {
        return this.registry.list().map((integration) => integration.metadata);
    }

    async listIntegrationSettings(): Promise<CodeEditorIntegrationSettings[]> {
        return Promise.all(
            this.registry
                .list()
                .map((integration) =>
                    this.toIntegrationSettings(integration.metadata.id),
                ),
        );
    }

    async updateIntegrationSettings(
        integrationId: CodeEditorId,
        settings: UpdateCodeEditorIntegrationSettings,
    ): Promise<CodeEditorIntegrationSettings> {
        const integration = this.registry.get(integrationId);
        const customPath = settings.customPath?.trim() || null;

        if (customPath) {
            const validation = await integration.validatePath(customPath);
            if (!validation.valid) {
                throw new Error(
                    validation.reason ??
                        `${integration.metadata.displayName} path is invalid.`,
                );
            }
        }

        const trimmedExecFlags = settings.execFlagsOverride?.trim();
        const execFlagsOverride =
            settings.execFlagsOverride === null ||
            trimmedExecFlags === integration.defaultSettings.execFlags
                ? null
                : (trimmedExecFlags ?? '');

        await this.settingsStore.update(integrationId, {
            enabled: settings.enabled,
            customPath,
            execFlagsOverride,
        });

        return this.toIntegrationSettings(integrationId);
    }

    async scanIntegration(
        integrationId: CodeEditorId,
        customPath?: string,
    ): Promise<CodeEditorInstallationSummary | null> {
        const integration = this.registry.get(integrationId);
        const savedCustomPath =
            customPath === undefined
                ? (await this.settingsStore.get(integrationId)).customPath
                : customPath;
        const installation = await integration.detectInstallation(
            savedCustomPath ?? undefined,
        );
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
        const launchConfiguration = integration.resolveGodotConfiguration({
            installation,
            settings: { execFlagsOverride: null },
            godotFlavor: context.mono ? 'dotnet' : 'standard',
        }).textEditor;

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

    private async toIntegrationSettings(
        integrationId: CodeEditorId,
    ): Promise<CodeEditorIntegrationSettings> {
        const integration = this.registry.get(integrationId);
        const storedSettings = await this.settingsStore.get(integrationId);
        const installation = await integration.detectInstallation(
            storedSettings.customPath ?? undefined,
        );
        const resolvedConfiguration = installation
            ? integration.resolveGodotConfiguration({
                  installation,
                  settings: {
                      execFlagsOverride: storedSettings.execFlagsOverride,
                  },
                  godotFlavor: 'standard',
              })
            : null;

        return {
            integration: integration.metadata,
            enabled: storedSettings.enabled,
            customPath: storedSettings.customPath,
            defaultExecFlags: integration.defaultSettings.execFlags,
            execFlagsOverride: storedSettings.execFlagsOverride,
            resolvedExecFlags:
                storedSettings.execFlagsOverride ??
                integration.defaultSettings.execFlags,
            installation: installation
                ? this.toInstallationSummary(integrationId, installation)
                : null,
            resolvedGodotExecPath:
                resolvedConfiguration?.textEditor.execPath ?? null,
        };
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
