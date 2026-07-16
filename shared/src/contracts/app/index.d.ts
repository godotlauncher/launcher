export type BackendResult = {
    success: boolean;
    error?: string;
};

export type SetAutoStartResult = BackendResult;

export type AppUpdateMessage = {
    type:
        | 'ready'
        | 'none'
        | 'error'
        | 'checking'
        | 'available'
        | 'downloading'
        | 'manual';
    available: boolean;
    downloaded: boolean;
    version?: string;
    message?: string;
    url?: string;
};

export type CheckForUpdatesOptions = {
    ignoreSkippedVersion?: boolean;
};

export type * from './app.bridge.js';
