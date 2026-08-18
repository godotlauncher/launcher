import type {
    InstalledRelease,
    InstallReleaseResult,
    RegisterCustomEngineResult,
    ReleaseSummary,
    RemovedReleaseResult,
} from '../releases/index.js';

/** Identifies the workflow that requested an editor installation. */
export type EditorInstallOrigin = 'installs' | 'project';

/** Reports the result of an install cancellation request. */
export type CancelEditorInstallResult = {
    jobId: string;
    status: 'cancelled' | 'cancelling' | 'not-cancellable' | 'not-found';
};

/** Defines installed-editor requests available to the renderer. */
export type EditorInstallsBridge = {
    /** Gets all registered editor installations. */
    getInstalledEditors(): Promise<InstalledRelease[]>;

    /** Installs one official editor release. */
    installEditor(
        release: ReleaseSummary,
        mono: boolean,
        origin: EditorInstallOrigin,
    ): Promise<InstallReleaseResult>;

    /** Reinstalls one registered editor. */
    reinstallEditor(release: InstalledRelease): Promise<InstallReleaseResult>;

    /** Cancels one queued or downloading user-origin install job. */
    cancelInstall(jobId: string): Promise<CancelEditorInstallResult>;

    /** Removes one registered editor. */
    removeEditor(release: InstalledRelease): Promise<RemovedReleaseResult>;

    /** Registers one custom editor manifest. */
    registerCustomEditor(
        manifestPath: string,
        options?: { replaceExisting?: boolean },
    ): Promise<RegisterCustomEngineResult>;

    /** Opens the Godot project manager for one editor. */
    openProjectManager(release: InstalledRelease): Promise<void>;

    /** Revalidates every registered editor. */
    revalidateInstalledEditors(): Promise<InstalledRelease[]>;
};
