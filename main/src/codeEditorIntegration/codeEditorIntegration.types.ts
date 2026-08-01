import type { CodeEditorIntegrationSummary } from '@shared/contracts';

export type CodeEditorInstallation = {
    path: string;
    version: string | null;
};

export type CodeEditorLaunchConfiguration = {
    execPath: string;
    execFlags: string;
};

export type CodeEditorProjectConfigurationMode = 'create' | 'update';

export type CodeEditorProjectContext = {
    projectPath: string;
    godotLaunchPath: string;
    godotVersion: number;
    mono: boolean;
    editorSettingsFile: string;
    editorSettingsFilename: string;
    editorSettingsFormat: number;
    configurationMode: CodeEditorProjectConfigurationMode;
};

export type CodeEditorPathValidation = {
    valid: boolean;
    installation?: CodeEditorInstallation;
    reason?: string;
};

export type CodeEditorProjectConfigurationResult = {
    recoveredConfigFiles: string[];
};

export type CodeEditorApplyResult = {
    editorSettingsFile: string;
    recoveredConfigFiles: string[];
};

export interface CodeEditorIntegration {
    readonly metadata: CodeEditorIntegrationSummary;

    detectInstallation(
        customPath?: string,
    ): Promise<CodeEditorInstallation | null>;

    validatePath(path: string): Promise<CodeEditorPathValidation>;

    isConfiguredForProject(projectPath: string): Promise<boolean>;

    getGodotLaunchConfiguration(
        installation: CodeEditorInstallation,
    ): CodeEditorLaunchConfiguration;

    configureProject(
        context: CodeEditorProjectContext,
    ): Promise<CodeEditorProjectConfigurationResult>;
}
