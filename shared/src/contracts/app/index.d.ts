export type BackendResult = {
    success: boolean;
    error?: string;
};

export type SetAutoStartResult = BackendResult;

export type AppUpdateOperation = 'check' | 'download' | 'install';

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
    progressPercent?: number;
    failedOperation?: AppUpdateOperation;
};

export type CheckForUpdatesOptions = {
    ignoreSkippedVersion?: boolean;
};

export type * from './app.bridge.js';
