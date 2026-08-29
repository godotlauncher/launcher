export type ToolId = string;

export type ToolIntegrationModuleOptions = {
    directory: string;
    fileName: string;
};

export type ToolMetadata = {
    id: ToolId;
    displayName: string;
    order: number;
};

export type ToolSettings = {
    enabled: boolean;
    executablePathOverride: string | null;
    executableArgsOverride: string[] | null;
};

export type UpdateToolSettings = Partial<ToolSettings>;

export type ToolInstallationSource = 'detected' | 'override';

export type ToolInstallation = {
    executablePath: string;
    executableArgs: string[];
    version: string | null;
    source: ToolInstallationSource;
};

export type StoredToolInstallation = {
    installation: ToolInstallation | null;
    checkedAt: number;
    settingsFingerprint: string;
};

export type StoredToolState = {
    settings: ToolSettings;
    configuration: Record<string, unknown>;
    installations: Record<string, Record<string, StoredToolInstallation>>;
};

export type ToolIntegrationStoreFile = {
    schemaVersion: 2;
    tools: Record<ToolId, StoredToolState>;
};

export type ToolInstallationStatus =
    | 'available'
    | 'disabled'
    | 'invalid'
    | 'missing'
    | 'unchecked';

export type ToolResolution = {
    installation: ToolInstallation | null;
    status: Exclude<ToolInstallationStatus, 'disabled'>;
    checkedAt: number | null;
};

export type ToolSummary = {
    metadata: ToolMetadata;
    settings: ToolSettings;
    installation: ToolInstallation | null;
    status: ToolInstallationStatus;
    checkedAt: number | null;
};

export type ToolExecutionRequest = {
    args: readonly string[];
    cwd?: string;
    env?: Readonly<Record<string, string | undefined>>;
    inheritEnv?: boolean;
    timeoutMs?: number;
};

export type ToolExecutionSuccess = {
    success: true;
    stdout: string;
    stderr: string;
    exitCode: 0;
};

export type ToolExecutionFailureReason =
    | 'command-failed'
    | 'disabled'
    | 'invalid'
    | 'timed-out'
    | 'unavailable';

export type ToolExecutionFailure = {
    success: false;
    reason: ToolExecutionFailureReason;
    stdout: string;
    stderr: string;
    exitCode: number | null;
};

export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure;

export type ToolExecutionSession = (
    request: ToolExecutionRequest,
) => Promise<ToolExecutionResult>;

export type ToolStreamingExecutionRequest = {
    args: readonly string[];
    cwd?: string;
    env: NodeJS.ProcessEnv;
    signal: AbortSignal;
    timeoutMs: number;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
};

export type ToolStreamingExecutionResult =
    | { success: true; exitCode: 0 }
    | {
          success: false;
          reason: ToolExecutionFailureReason | 'cancelled';
          exitCode: number | null;
      };

export interface ToolIntegration {
    readonly metadata: ToolMetadata;

    /**
     * Detects a usable installation for the current per-tool settings.
     *
     * @param settings - Resolved settings including executable overrides.
     * @returns A detected installation, or null when the tool is unavailable.
     */
    detectInstallation(
        settings: ToolSettings,
    ): Promise<ToolInstallation | null>;

    /**
     * Revalidates an exact executable path and prefix-argument combination.
     *
     * @param installation - Installation candidate to validate.
     * @returns The canonical validated installation, or null when invalid.
     */
    validateInstallation(
        installation: ToolInstallation,
    ): Promise<ToolInstallation | null>;
}
