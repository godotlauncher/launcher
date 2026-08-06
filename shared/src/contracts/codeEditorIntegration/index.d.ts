export type CodeEditorId = 'vscode' | 'vscodium';

export type CodeEditorIntegrationCapabilities = {
    dotnet: boolean;
};

export type CodeEditorIntegrationSummary = {
    id: CodeEditorId;
    displayName: string;
    capabilities: CodeEditorIntegrationCapabilities;
};

export type CodeEditorInstallationSummary = {
    integrationId: CodeEditorId;
    path: string;
    version: string | null;
};

export type CodeEditorPathValidationResult = {
    valid: boolean;
    installation?: CodeEditorInstallationSummary;
    reason?: string;
};

export type CodeEditorIntegrationSettings = {
    integration: CodeEditorIntegrationSummary;
    isDefault: boolean;
    enabled: boolean;
    customPath: string | null;
    defaultExecFlags: string;
    execFlagsOverride: string | null;
    resolvedExecFlags: string;
    installation: CodeEditorInstallationSummary | null;
    resolvedGodotExecPath: string | null;
};

export type UpdateCodeEditorIntegrationSettings = {
    enabled: boolean;
    customPath: string | null;
    execFlagsOverride: string | null;
};

export type CodeEditorIntegrationBridge = {
    listIntegrationSettings(): Promise<CodeEditorIntegrationSettings[]>;
    rescanIntegration(
        integrationId: CodeEditorId,
    ): Promise<CodeEditorIntegrationSettings>;
    updateIntegrationSettings(
        integrationId: CodeEditorId,
        settings: UpdateCodeEditorIntegrationSettings,
    ): Promise<CodeEditorIntegrationSettings>;
    setDefaultIntegration(
        integrationId: CodeEditorId | null,
    ): Promise<CodeEditorIntegrationSettings[]>;
    validateIntegrationPath(
        integrationId: CodeEditorId,
        path: string,
    ): Promise<CodeEditorPathValidationResult>;
};
