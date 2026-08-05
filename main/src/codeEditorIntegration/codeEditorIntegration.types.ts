import type {
    CodeEditorId,
    CodeEditorIntegrationSummary,
} from '@shared/contracts';

export type CodeEditorInstallation = {
    path: string;
    version: string | null;
};

export type CodeEditorLaunchConfiguration = {
    execPath: string;
    execFlags: string;
};

export type GodotEditorFlavor = 'standard' | 'dotnet';

export type CodeEditorIntegrationDefaults = {
    execFlags: string;
};

export type CodeEditorResolvedSettings = {
    execFlagsOverride: string | null;
};

export type GodotDotNetEditorConfiguration = {
    externalEditorId: number;
    customLaunchConfiguration?: CodeEditorLaunchConfiguration;
};

export type GodotCodeEditorConfiguration = {
    textEditor: CodeEditorLaunchConfiguration;
    dotnet?: GodotDotNetEditorConfiguration;
};

export type CodeEditorProjectContext = {
    projectPath: string;
    godotLaunchPath: string;
    godotVersion: number;
    mono: boolean;
    editorSettingsFile: string;
    editorSettingsFilename: string;
    editorSettingsFormat: number;
    previousCodeEditorId?: CodeEditorId | null;
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
    readonly defaultSettings: CodeEditorIntegrationDefaults;

    detectInstallation(
        customPath?: string,
    ): Promise<CodeEditorInstallation | null>;

    validatePath(path: string): Promise<CodeEditorPathValidation>;

    isConfiguredForProject(projectPath: string): Promise<boolean>;

    resolveGodotConfiguration(input: {
        installation: CodeEditorInstallation;
        settings: CodeEditorResolvedSettings;
        godotFlavor: GodotEditorFlavor;
        godotVersion: number;
    }): GodotCodeEditorConfiguration;

    configureProject(
        context: CodeEditorProjectContext,
    ): Promise<CodeEditorProjectConfigurationResult>;
}
