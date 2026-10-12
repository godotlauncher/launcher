import type {
    TemplateMigrationCheckProgress,
    TemplateMigrationDecision,
    TemplateMigrationProjectDecision,
    TemplateMigrationReview,
    TemplateMigrationRun,
    TemplateMigrationVersionIdentity,
    TemplateMigrationVersionResult,
    TemplateMigrationVersionStatus,
} from '@shared/contracts';

export type MigrationStep =
    | 'about'
    | 'options'
    | 'choose'
    | 'review'
    | 'move'
    | 'done';
export type MigrationProjectChoice = {
    mode: 'all-versions' | 'per-version';
    allChoice: TemplateMigrationDecision;
    versions: Record<string, TemplateMigrationDecision>;
};
export type MigrationChoices = Record<string, MigrationProjectChoice>;
export type MigrationReviewActions = {
    review: (
        decisions: TemplateMigrationProjectDecision[],
        requestId?: string,
    ) => Promise<TemplateMigrationReview>;
    progress?: (
        requestId: string,
    ) => Promise<TemplateMigrationCheckProgress | undefined>;
    discard: (token: string) => Promise<void>;
};
export type MigrationVersionIdentity = TemplateMigrationVersionIdentity;
export type MigrationVersionStatus = TemplateMigrationVersionStatus;
export type MigrationVersionResult = TemplateMigrationVersionResult;
export type MigrationRun = TemplateMigrationRun;
