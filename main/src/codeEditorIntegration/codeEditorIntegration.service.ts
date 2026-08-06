import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    CodeEditorId,
    CodeEditorInstallationSummary,
    CodeEditorIntegrationSettings,
    CodeEditorPathValidationResult,
    UpdateCodeEditorIntegrationSettings,
} from '@shared/contracts';
import { TEMPLATE_DIR_NAME } from '../constants.js';
import { getAssetPath } from '../pathResolver.js';
import {
    createNewEditorSettings,
    updateEditorSettings,
} from '../utils/godotProject.utils.js';
import { CodeEditorInstallationCache } from './codeEditorInstallationCache.js';

// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationSettingsStore } from './codeEditorIntegration.settingsStore.js';
import type {
    CodeEditorApplyResult,
    CodeEditorInstallation,
    CodeEditorProjectContext,
    GodotEditorFlavor,
} from './codeEditorIntegration.types.js';

export type CodeEditorSelectionEligibility =
    | 'eligible'
    | 'disabled'
    | 'unavailable';

@Injectable()
export class CodeEditorIntegrationService {
    constructor(
        private readonly registry: CodeEditorIntegrationRegistry,
        private readonly settingsStore: CodeEditorIntegrationSettingsStore,
        private readonly installationCache: CodeEditorInstallationCache = new CodeEditorInstallationCache(
            registry,
            settingsStore,
        ),
    ) {}

    isRegisteredIntegration(id: string): id is CodeEditorId {
        return this.registry.has(id);
    }

    async listIntegrationSettings(): Promise<CodeEditorIntegrationSettings[]> {
        const defaultIntegrationId =
            await this.settingsStore.getDefaultIntegrationId();
        return Promise.all(
            this.registry
                .list()
                .map((integration) =>
                    this.toIntegrationSettings(
                        integration.metadata.id,
                        defaultIntegrationId,
                    ),
                ),
        );
    }

    async revalidateIntegrationSettings(): Promise<
        CodeEditorIntegrationSettings[]
    > {
        const defaultIntegrationId =
            await this.settingsStore.getDefaultIntegrationId();
        return Promise.all(
            this.registry
                .list()
                .map((integration) =>
                    this.toIntegrationSettings(
                        integration.metadata.id,
                        defaultIntegrationId,
                        'revalidate',
                    ),
                ),
        );
    }

    async rescanIntegration(
        integrationId: CodeEditorId,
    ): Promise<CodeEditorIntegrationSettings> {
        const defaultIntegrationId =
            await this.settingsStore.getDefaultIntegrationId();
        return this.toIntegrationSettings(
            integrationId,
            defaultIntegrationId,
            'rescan',
        );
    }

    async setDefaultIntegration(
        integrationId: CodeEditorId | null,
    ): Promise<CodeEditorIntegrationSettings[]> {
        if (integrationId) {
            await this.assertIntegrationSelectable(integrationId);
        }
        await this.settingsStore.setDefaultIntegrationId(integrationId);

        return this.listIntegrationSettings();
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
        this.installationCache.invalidate(integrationId);

        const defaultIntegrationId =
            await this.settingsStore.getDefaultIntegrationId();
        return this.toIntegrationSettings(integrationId, defaultIntegrationId);
    }

    async getSelectionEligibility(
        integrationId: CodeEditorId,
    ): Promise<CodeEditorSelectionEligibility> {
        const storedSettings = await this.settingsStore.get(integrationId);

        if (!storedSettings.enabled) {
            return 'disabled';
        }

        const installation = await this.installationCache.revalidate(
            integrationId,
            storedSettings.customPath ?? undefined,
        );
        return installation ? 'eligible' : 'unavailable';
    }

    async assertIntegrationSelectable(
        integrationId: CodeEditorId,
    ): Promise<void> {
        const integration = this.registry.get(integrationId);
        const eligibility = await this.getSelectionEligibility(integrationId);

        if (eligibility === 'disabled') {
            throw new Error(`${integration.metadata.displayName} is disabled.`);
        }

        if (eligibility === 'unavailable') {
            throw new Error(
                `${integration.metadata.displayName} installation was not found.`,
            );
        }
    }

    async scanIntegration(
        integrationId: CodeEditorId,
        customPath?: string,
    ): Promise<CodeEditorInstallationSummary | null> {
        const savedCustomPath =
            customPath === undefined
                ? (await this.settingsStore.get(integrationId)).customPath
                : customPath;
        const installation = await this.installationCache.revalidate(
            integrationId,
            savedCustomPath ?? undefined,
        );
        return installation
            ? this.toInstallationSummary(integrationId, installation)
            : null;
    }

    async findConfiguredIntegrations(
        projectPath: string,
    ): Promise<CodeEditorId[]> {
        const configuredIntegrationIds: CodeEditorId[] = [];

        for (const integration of this.registry.list()) {
            const integrationId = integration.metadata.id;
            const storedSettings = await this.settingsStore.get(integrationId);

            if (!storedSettings.enabled) {
                continue;
            }

            if (await integration.isConfiguredForProject(projectPath)) {
                configuredIntegrationIds.push(integrationId);
            }
        }

        return configuredIntegrationIds;
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

    async applyToProject(
        integrationId: CodeEditorId,
        context: CodeEditorProjectContext,
    ): Promise<CodeEditorApplyResult> {
        const integration = this.registry.get(integrationId);
        const storedSettings = await this.settingsStore.get(integrationId);
        const installation = await this.installationCache.revalidate(
            integrationId,
            storedSettings.customPath ?? undefined,
        );
        if (!installation) {
            throw new Error(
                `${integration.metadata.displayName} installation was not found.`,
            );
        }

        const integrationResult = await integration.configureProject(context);
        const godotFlavor: GodotEditorFlavor = context.mono
            ? 'dotnet'
            : 'standard';
        const godotConfiguration = integration.resolveGodotConfiguration({
            installation,
            settings: {
                execFlagsOverride: storedSettings.execFlagsOverride,
            },
            godotFlavor,
            godotVersion: context.godotVersion,
        });
        const codeEditorSettings = {
            textEditor: {
                enabled: true,
                ...godotConfiguration.textEditor,
            },
            ...(godotFlavor === 'dotnet'
                ? { dotnet: godotConfiguration.dotnet ?? null }
                : {}),
        };

        let editorSettingsFile = context.editorSettingsFile;
        if (editorSettingsFile && fs.existsSync(editorSettingsFile)) {
            await updateEditorSettings(editorSettingsFile, codeEditorSettings);
        } else {
            editorSettingsFile = await createNewEditorSettings({
                templatePath: path.resolve(getAssetPath(), TEMPLATE_DIR_NAME),
                launchPath: context.godotLaunchPath,
                editorConfigFilename: context.editorSettingsFilename,
                editorConfigFormat: context.editorSettingsFormat,
                codeEditorSettings,
            });
        }

        return {
            editorSettingsFile,
            recoveredConfigFiles: this.normalizeRecoveredFiles(
                context.projectPath,
                integrationResult.recoveredConfigFiles,
            ),
        };
    }

    async disableForProject(
        editorSettingsFile: string,
        godotFlavor: GodotEditorFlavor,
    ): Promise<void> {
        if (!editorSettingsFile || !fs.existsSync(editorSettingsFile)) {
            return;
        }

        await updateEditorSettings(editorSettingsFile, {
            textEditor: { enabled: false },
            ...(godotFlavor === 'dotnet' ? { dotnet: null } : {}),
        });
    }

    private resolveInstallation(
        integrationId: CodeEditorId,
        customPath: string | undefined,
        mode: 'snapshot' | 'revalidate' | 'rescan',
    ): Promise<CodeEditorInstallation | null> {
        if (mode === 'rescan') {
            return this.installationCache.rescan(integrationId, customPath);
        }
        if (mode === 'revalidate') {
            return this.installationCache.revalidate(integrationId, customPath);
        }
        return this.installationCache.getSnapshot(integrationId, customPath);
    }

    private async toIntegrationSettings(
        integrationId: CodeEditorId,
        defaultIntegrationId: CodeEditorId | null,
        mode: 'snapshot' | 'revalidate' | 'rescan' = 'snapshot',
    ): Promise<CodeEditorIntegrationSettings> {
        const integration = this.registry.get(integrationId);
        const storedSettings = await this.settingsStore.get(integrationId);
        const installation = await this.resolveInstallation(
            integrationId,
            storedSettings.customPath ?? undefined,
            mode,
        );
        const resolvedConfiguration = installation
            ? integration.resolveGodotConfiguration({
                  installation,
                  settings: {
                      execFlagsOverride: storedSettings.execFlagsOverride,
                  },
                  godotFlavor: 'standard',
                  godotVersion: 4,
              })
            : null;

        return {
            integration: integration.metadata,
            enabled: storedSettings.enabled,
            isDefault: integrationId === defaultIntegrationId,
            customPath: storedSettings.customPath,
            defaultExecFlags: integration.defaultSettings.execFlags,
            execFlagsOverride: storedSettings.execFlagsOverride,
            resolvedExecFlags:
                resolvedConfiguration?.textEditor.execFlags ??
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
