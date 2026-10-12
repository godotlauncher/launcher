import type { TemplateMigrationChoice } from './index.js';

/** Later preserves local files and leaves the version available for another review. */
export type TemplateMigrationDecision = TemplateMigrationChoice | 'later';

/** A project-wide choice or a complete set of individual version choices. */
export type TemplateMigrationSelection =
    | { mode: 'all-versions'; choice: TemplateMigrationDecision }
    | {
          mode: 'per-version';
          choices: Record<string, TemplateMigrationDecision>;
      };

/** Decisions for one registered project, before any files are changed. */
export type TemplateMigrationProjectDecision = {
    projectPath: string;
    selection: TemplateMigrationSelection;
};

/** The exact effects the executor must honour for one local version folder. */
export type TemplateMigrationVersionPlan = {
    setId: string;
    choice: TemplateMigrationDecision;
    fileCount: number;
    sizeBytes: number;
    destination: 'imported' | 'shared' | 'local';
    sharedFiles: 'add-missing' | 'unchanged';
    localFiles:
        | 'remove-after-verification'
        | 'remove-after-connection'
        | 'keep';
    /** Deferred versions remain visible in the migration assessment. */
    pending: boolean;
};

/** Main-owned expansion of the selected project and version choices. */
export type TemplateMigrationProjectPlan = {
    projectPath: string;
    name: string;
    selectionMode: TemplateMigrationSelection['mode'];
    versions: TemplateMigrationVersionPlan[];
};

/** Process-local review. Its token refers to source snapshots held in main. */
export type TemplateMigrationReview = {
    token: string;
    projects: TemplateMigrationProjectPlan[];
    /** Share and Use shared need an explicit acknowledgement of local removal. */
    requiresRemovalConfirmation: boolean;
};

/** Read-only file checking progress for one request, without exposing filesystem paths. */
export type TemplateMigrationCheckProgress = {
    phase: 'listing' | 'checking';
    projectName: string;
    projectIndex: number;
    projectCount: number;
    completedBytes: number;
    totalBytes: number;
};

/** Exact project and version identity used for progress and subsequent retry decisions. */
export type TemplateMigrationVersionIdentity = {
    projectPath: string;
    setId: string;
};
/** Main-reported file operation phase for a single reviewed version. */
export type TemplateMigrationVersionStatus =
    | 'waiting'
    | 'checking'
    | 'copying'
    | 'verifying'
    | 'connecting'
    | 'cleaning'
    | 'complete'
    | 'error'
    | 'later';
/** Bytes read during the current version phase; this is not overall migration progress. */
export type TemplateMigrationFileProgress = {
    completedBytes: number;
    totalBytes: number;
};
export type TemplateMigrationVersionResult =
    TemplateMigrationVersionIdentity & {
        status: TemplateMigrationVersionStatus;
        error?: string;
        progress?: TemplateMigrationFileProgress;
    };
export type TemplateMigrationRun = {
    status: 'running' | 'complete';
    versions: TemplateMigrationVersionResult[];
    /** Read-only effects retained for reopening session results; contains no reusable token. */
    review?: Omit<TemplateMigrationReview, 'token'>;
};
