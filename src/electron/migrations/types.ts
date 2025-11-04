export type MigrationId = string;

export interface MigrationContext {
    currentVersion: string;
    lastSeenVersion: string;
}

export type MigrationOptions = {
    targetVersion?: string;
    [key: string]: unknown;
}

export interface MigrationExecutionContext extends MigrationContext {
    options?: MigrationOptions;
}

export interface MigrationResult {
    id: MigrationId;
    status: 'completed' | 'skipped' | 'failed';
    message?: string;
}

export type MigrationPredicate = (context: MigrationExecutionContext) => boolean | Promise<boolean>;

export interface Migration {
    id: MigrationId;
    description?: string;
    options?: MigrationOptions;
    predicate?: MigrationPredicate;
    run: (context: MigrationExecutionContext) => Promise<MigrationResult | void> | MigrationResult | void;
}

export type MigrationRegistry = readonly Migration[];
