export type CodeEditorId = 'vscode';

export type CodeEditorIntegrationCapabilities = {
    textEditor: true;
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
    listIntegrations(): Promise<CodeEditorIntegrationSummary[]>;
    listIntegrationSettings(): Promise<CodeEditorIntegrationSettings[]>;
    updateIntegrationSettings(
        integrationId: CodeEditorId,
        settings: UpdateCodeEditorIntegrationSettings,
    ): Promise<CodeEditorIntegrationSettings>;
    scanIntegration(
        integrationId: CodeEditorId,
    ): Promise<CodeEditorInstallationSummary | null>;
    scanIntegrations(): Promise<CodeEditorInstallationSummary[]>;
    validateIntegrationPath(
        integrationId: CodeEditorId,
        path: string,
    ): Promise<CodeEditorPathValidationResult>;
};
