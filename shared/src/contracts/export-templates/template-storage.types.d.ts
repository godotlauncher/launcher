/** Independently movable export-template stores. */
export type TemplateStorageKind = 'official' | 'imported';

/** A stable lookup path and its current physical storage location. */
export type TemplateStorageLocation = {
    kind: TemplateStorageKind;
    defaultPath: string;
    storagePath: string;
    status: 'healthy' | 'empty' | 'unavailable' | 'attention';
    issue?: string;
};

/** Main-owned destination review revalidated before moving any files. */
export type TemplateStorageMoveReview = {
    token: string;
    kind: TemplateStorageKind;
    source: string;
    destination: string;
    sizeBytes: number;
    fileCount: number;
    /** Official version directories or registered imported builds. */
    templateCount: number;
    /** Destination filesystem free bytes, or null when the host cannot report them. */
    availableBytes: number | null;
    /** Includes the move's safety margin; null when free space is unknown. */
    spaceSufficient: boolean | null;
    projects: string[];
};

/** Main-process relocation progress retained when navigating away. */
export type TemplateStorageMoveJob = {
    id: string;
    kind: TemplateStorageKind;
    source: string;
    destination: string;
    stage:
        | 'preparing'
        | 'moving'
        | 'verifying'
        | 'connecting'
        | 'cleaning'
        | 'complete'
        | 'cancelled'
        | 'error';
    completedBytes: number;
    totalBytes: number;
    cancellable: boolean;
    error?: string;
    recoveryRequired?: boolean;
};

/** Settings and the latest move, including unavailable-drive and recovery state. */
export type TemplateStorageSettings = {
    platform: string;
    defaultGodotPath: string;
    locations: TemplateStorageLocation[];
    job: TemplateStorageMoveJob | null;
    busy: boolean;
    recoveryRequired: boolean;
};
