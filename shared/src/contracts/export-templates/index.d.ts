import type {
    TemplateMigrationAssessment,
    TemplateProjectAssessment,
} from './template-assessment.types.js';
import type {
    TemplateStorageKind,
    TemplateStorageMoveReview,
    TemplateStorageSettings,
} from './template-storage.types.js';

export type * from './template-assessment.types.js';
export type * from './template-storage.types.js';

/** An official, platform-independent template package. */
export type ExportTemplateAsset = {
    id: string;
    name: string;
    flavor: 'gdscript' | 'dotnet';
    downloadUrl: string;
    sizeBytes: number;
    digest?: string;
    checksumManifestUrl?: string;
};
/** One directory in Godot's shared collection. */
export type ExportTemplateSet = {
    id: string;
    version: string;
    edition: 'standard' | 'dotnet' | 'custom';
    sizeBytes: number;
    fileCount: number;
    files?: string[];
    platforms: string[];
    projects: string[];
};
/** Connection state of one official project editor. */
export type TemplateConnection = {
    projectPath: string;
    name: string;
    status: 'shared' | 'local' | 'missing' | 'foreign' | 'error';
    mode?: 'shared' | 'separate';
};
/** Project-level behaviour selected before preparing a migration review. */
export type TemplateMigrationChoice =
    | 'share-project'
    | 'use-shared'
    | 'save-imported';
/** Explicit decisions for every populated version in a dedicated collection. */
export type TemplateMigrationVersionChoices = Record<
    string,
    TemplateMigrationChoice
>;
/** Process-local preparation and commit status. */
export type TemplateJob = {
    id: string;
    /** Stable registered project identity for project-owned operations and progress. */
    projectPath?: string;
    setIds?: string[];
    kind?: 'update' | 'remove' | 'migrate' | 'recover';
    stage:
        | 'queued'
        | 'preparing'
        | 'downloading'
        | 'applying'
        | 'complete'
        | 'cancelled'
        | 'error';
    receivedBytes?: number;
    totalBytes?: number;
    error?: string;
};
/** The filesystem inventory and any pending work. */
export type ExportTemplateInventory = {
    root: string;
    sets: ExportTemplateSet[];
    totalBytes: number;
    sizeIncomplete?: boolean;
    issues: string[];
    connections: TemplateConnection[];
    recoveries: string[];
    recoverySets?: Record<string, string[]>;
    job: TemplateJob | null;
};
/** Main-owned selection snapshot; paths are relative to the version folder. */
export type TemplatePackage = {
    token: string;
    files: { path: string; sizeBytes: number; downloadBytes: number }[];
    localFiles: string[];
};
/** Template requests exposed by the Electron preload bridge. */
export type ProjectTemplateSettings = {
    projectPath: string;
    setId: string;
    status: TemplateConnection['status'];
    custom: boolean;
    files: string[];
    hasLocalFiles: boolean;
    buildSelections?: Record<string, TemplateBuildSelection>;
    importedBuilds?: ImportedTemplateBuild[];
    activeBuild?: ImportedTemplateBuild;
    sets: { id: string; files: string[] }[];
};
/** Template requests exposed by the Electron preload bridge. */
export type TemplateImportProgress = {
    completedBytes: number;
    totalBytes: number;
};
/** Template requests exposed by the Electron preload bridge. */
export type ExportTemplatesBridge = {
    getStorageSettings(): Promise<TemplateStorageSettings>;
    prepareStorageMove(
        kind: TemplateStorageKind,
        destination: string,
    ): Promise<TemplateStorageMoveReview>;
    startStorageMove(token: string): Promise<void>;
    cancelStorageMove(jobId: string): Promise<void>;
    recoverStorageMove(): Promise<void>;
    getImportedTemplates(): Promise<ImportedTemplateInventory>;
    chooseTemplateImport(): Promise<SelectedTemplateImport | null>;
    prepareTemplateImport(token: string): Promise<PreparedTemplateImport>;
    getTemplateImportProgress(
        token: string,
    ): Promise<TemplateImportProgress | null>;
    discardTemplateImport(token: string): Promise<void>;
    installTemplateImport(
        token: string,
        label: string,
        replaceId?: string,
    ): Promise<string>;
    renameImportedTemplate(id: string, label: string): Promise<void>;
    openImportedTemplateFolder(id: string): Promise<void>;
    removeImportedTemplate(
        id: string,
        options?: RemoveImportedTemplateOptions,
    ): Promise<void>;
    setProjectTemplateBuilds(
        projectPath: string,
        selections: Record<string, TemplateBuildSelection>,
    ): Promise<void>;
    getProjectSettings(
        projectPath: string,
        setId?: string,
    ): Promise<ProjectTemplateSettings>;
    getProjectPackage(
        projectPath: string,
        localOnly?: boolean,
        setId?: string,
    ): Promise<TemplatePackage>;

    connectEmptyProjects(): Promise<void>;
    getMigrationAssessment(): Promise<TemplateMigrationAssessment>;
    inspectProjectTemplates(
        projectPath: string,
        contents?: boolean,
    ): Promise<TemplateProjectAssessment>;
    cancelTemplateInspection(): Promise<void>;
    getInventory(): Promise<ExportTemplateInventory>;
    getJobs(): Promise<TemplateJob[]>;
    retryJob(jobId: string): Promise<void>;
    getLocalPackage(setId: string): Promise<TemplatePackage>;
    getPackage(releaseId: string, assetId: string): Promise<TemplatePackage>;
    savePackage(token: string, selected: string[]): Promise<void>;

    prepareMigration(
        projectPath: string,
        choice?: TemplateMigrationChoice,
        versionChoices?: TemplateMigrationVersionChoices,
    ): Promise<void>;
    cancel(jobId: string): Promise<void>;
    remove(setId: string): Promise<void>;
    openFolder(): Promise<void>;
    recover(recoveryId: string): Promise<void>;
};

/** A project uses Official or an explicitly selected imported ID. */
export type TemplateBuildSelection = 'official' | string;
/** One complete imported package. Replacements receive a new immutable revision. */
export type ImportedTemplateBuild = {
    id: string;
    revision: string;
    /** Stable portable folder beneath imported/<setId>. */
    directoryName: string;
    available?: boolean;
    label: string;
    setId: string;
    importedAt: string;
    archiveName: string;
    files: string[];
    sizeBytes: number;
};
export type ImportedTemplateLibrary = {
    schemaVersion: 1;
    builds: ImportedTemplateBuild[];
};
export type ImportedTemplateInventory = ImportedTemplateLibrary & {
    /** Projects using this build with their current editor. */
    usage: Record<string, string[]>;
    /** Current and remembered selections that deletion must replace. */
    references: Record<string, ImportedTemplateReference[]>;
};
export type ImportedTemplateReference = {
    projectPath: string;
    projectName: string;
    currentSetId: string;
    active: boolean;
};
export type RemoveImportedTemplateOptions = {
    replacement: TemplateBuildSelection;
    revision: string;
    references: Pick<
        ImportedTemplateReference,
        'projectPath' | 'currentSetId' | 'active'
    >[];
};
export type SelectedTemplateImport = {
    token: string;
    archiveName: string;
    sourcePath: string;
};
export type PreparedTemplateImport = {
    token: string;
    archiveName: string;
    setId: string;
    files: string[];
    sizeBytes: number;
};
