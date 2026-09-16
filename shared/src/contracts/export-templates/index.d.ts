import type {
    TemplateMigrationAssessment,
    TemplateProjectAssessment,
} from './template-assessment.types.js';

export type * from './template-assessment.types.js';

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
/** A differing file requiring a deliberate replacement decision. */
export type TemplateConflict = {
    path: string;
    sharedBytes: number;
    incomingBytes: number;
};
/** Project-level behaviour selected before preparing a migration review. */
export type TemplateMigrationChoice = 'share-project' | 'use-shared';
/** Prepared operation, held in main until the user confirms or cancels. */
export type TemplateReview = {
    sets: string[];
    sizeBytes: number;
    addedFiles: number;
    identicalFiles: number;
    conflicts: TemplateConflict[];
    projectName?: string;
};
/** Process-local preparation and commit status. */
export type TemplateJob = {
    id: string;
    /** Stable registered project identity for migration progress. */
    projectPath?: string;
    setIds?: string[];
    kind?: 'update' | 'remove' | 'import' | 'migrate' | 'download' | 'recover';
    stage:
        | 'queued'
        | 'preparing'
        | 'downloading'
        | 'extracting'
        | 'review'
        | 'applying'
        | 'complete'
        | 'cancelled'
        | 'error';
    receivedBytes?: number;
    totalBytes?: number;
    review?: TemplateReview;
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
export type ExportTemplatesBridge = {
    connectEmptyProjects(): Promise<void>;
    getMigrationAssessment(): Promise<TemplateMigrationAssessment>;
    inspectProjectTemplates(
        projectPath: string,
        contents?: boolean,
    ): Promise<TemplateProjectAssessment>;
    cancelTemplateInspection(): Promise<void>;
    keepProjectTemplatesSeparate(
        projectPath: string,
    ): Promise<TemplateProjectAssessment>;
    getInventory(): Promise<ExportTemplateInventory>;
    getJob(): Promise<TemplateJob | null>;
    getJobs(): Promise<TemplateJob[]>;
    retryJob(jobId: string): Promise<void>;
    getLocalPackage(setId: string): Promise<TemplatePackage>;
    getPackage(releaseId: string, assetId: string): Promise<TemplatePackage>;
    savePackage(token: string, selected: string[]): Promise<void>;
    download(releaseId: string, assetId: string): Promise<void>;
    importArchive(): Promise<void>;
    prepareMigration(
        projectPath: string,
        choice?: TemplateMigrationChoice,
    ): Promise<void>;
    apply(
        jobId: string,
        decisions: Record<string, 'shared' | 'incoming'>,
    ): Promise<void>;
    cancel(jobId: string): Promise<void>;
    remove(setId: string): Promise<void>;
    openFolder(): Promise<void>;
    recover(recoveryId: string): Promise<void>;
};
