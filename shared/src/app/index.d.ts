export type BackendResult = {
    success: boolean;
    error?: string;
};

export type SetAutoStartResult = BackendResult;

export type AppUpdateMessage = {
    type: 'ready' | 'none' | 'error' | 'checking' | 'available' | 'downloading';
    available: boolean;
    downloaded: boolean;
    version?: string;
    message?: string;
};

export type CheckForUpdatesOptions = {
    ignoreSkippedVersion?: boolean;
};
