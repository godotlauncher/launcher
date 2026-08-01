export type CodeEditorId = 'vscode';

export type CodeEditorIntegrationSummary = {
    id: CodeEditorId;
    displayName: string;
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

export type CodeEditorIntegrationBridge = {
    listIntegrations(): Promise<CodeEditorIntegrationSummary[]>;
    scanIntegration(
        integrationId: CodeEditorId,
    ): Promise<CodeEditorInstallationSummary | null>;
    scanIntegrations(): Promise<CodeEditorInstallationSummary[]>;
    validateIntegrationPath(
        integrationId: CodeEditorId,
        path: string,
    ): Promise<CodeEditorPathValidationResult>;
};
