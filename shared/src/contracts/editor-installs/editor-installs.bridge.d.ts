import type {
    InstalledRelease,
    InstallReleaseResult,
    RegisterCustomEngineResult,
    ReleaseSummary,
    RemovedReleaseResult,
} from '../releases/index.js';
import type {
    CommandLineAliasAvailability,
    CommandLineAliasesState,
    CommandLineAliasResult,
} from './command-line-alias.types.js';
import type {
    CommandLineGodotResult,
    CommandLineGodotState,
} from './command-line-godot.types.js';
import type {
    EditorRemovalSelection,
    RemoveEditorsResult,
} from './editor-removal.types.js';

/** Identifies the workflow that requested an editor installation. */
export type EditorInstallOrigin = 'installs' | 'project';

/** Reports the result of an install cancellation request. */
export type CancelEditorInstallResult = {
    jobId: string;
    status: 'cancelled' | 'cancelling' | 'not-cancellable' | 'not-found';
};

/** Defines installed-editor requests available to the renderer. */
export type EditorInstallsBridge = {
    /** Gets registrations after reconciling interrupted command operations. */
    getCommandLineAliases(): Promise<CommandLineAliasesState>;
    /** Checks a candidate without reserving it or changing PATH. */
    checkCommandLineAlias(
        release: Pick<InstalledRelease, 'version' | 'mono'>,
        name: string,
    ): Promise<CommandLineAliasAvailability>;
    /** Creates one command or removes only this editor's owned alias. */
    setCommandLineAlias(
        release: Pick<InstalledRelease, 'version' | 'mono'>,
        name: string | null,
    ): Promise<CommandLineAliasResult>;

    /** Gets the current command-line editor selection. */
    getCommandLineGodot(): Promise<CommandLineGodotState>;

    /** Selects a registered editor, or clears the managed command. */
    setCommandLineGodot(
        release: Pick<InstalledRelease, 'version' | 'mono'> | null,
    ): Promise<CommandLineGodotResult>;
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

    /** Cancels one shared editor job before extraction begins. */
    cancelInstall(jobId: string): Promise<CancelEditorInstallResult>;

    /** Removes one registered editor. */
    removeEditor(release: InstalledRelease): Promise<RemovedReleaseResult>;

    /** Removes selected editors, checking unused selections again before removal. */
    removeEditors(
        selections: EditorRemovalSelection[],
    ): Promise<RemoveEditorsResult>;

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
