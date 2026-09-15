import type { TemplateConnection } from './index.js';

/** Advisory migration state; file changes still require a fresh mutation review. */
export type TemplateMigrationState =
    | 'shared'
    | 'separate'
    | 'ready'
    | 'needs-review'
    | 'unavailable'
    | 'blocked'
    | 'busy'
    | 'recovery';

/** Explains why a project can or cannot join the shared collection. */
export type TemplateMigrationReason =
    | 'connected'
    | 'kept-separate'
    | 'empty'
    | 'identical'
    | 'unverified-files'
    | 'custom-editor'
    | 'foreign-link'
    | 'unexpected-content'
    | 'metadata-present'
    | 'missing-project'
    | 'missing-editor'
    | 'unreadable'
    | 'preference-mismatch'
    | 'active-operation'
    | 'interrupted-operation';

/** Comparison identifies equality, never whether a binary supports encryption. */
export type TemplateMigrationFile = {
    path: string;
    state: 'identical' | 'local-only' | 'shared-only' | 'different';
    localBytes?: number;
    sharedBytes?: number;
};

/** Read-only assessment for one registered project editor environment. */
export type TemplateProjectAssessment = {
    projectPath: string;
    name: string;
    mode?: 'shared' | 'separate';
    connection?: TemplateConnection['status'];
    state: TemplateMigrationState;
    reason: TemplateMigrationReason;
    /** Unresolved migration, including unavailable projects to revisit; not permission to migrate. */
    pending: boolean;
    /** True only when a content comparison was performed for local template files. */
    compared: boolean;
    /** Existing files have no verified official provenance in this assessment. */
    provenance: 'unverified';
    setIds: string[];
    metadata: string[];
    unexpected: string[];
    files?: TemplateMigrationFile[];
};

/** Cheap discovery result; detailed comparisons are requested per project. */
export type TemplateMigrationAssessment = {
    projects: TemplateProjectAssessment[];
    pendingCount: number;
    recoveryIds: string[];
};
