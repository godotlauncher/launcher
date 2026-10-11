import type {
    TemplateMigrationCheckProgress,
    TemplateMigrationProjectPlan,
} from '@shared/contracts';
import type { TemplateFile } from './template-files.util.js';

/** Trusted source state retained in main, never supplied by the renderer. */
export type TemplateMigrationSource = {
    projectPath: string;
    name: string;
    launchPath: string;
    setId: string;
    mode?: 'shared' | 'separate';
    buildSelections: Record<string, string>;
    localRoot: string;
    /** Canonical location detects project aliases and redirected parent folders. */
    localRealPath: string;
    sharedRoot: string;
    /** Version folders and owned links; unrelated collection contents are preserved. */
    entries: string[];
    /** Owned version link targets are compared but never traversed as local source files. */
    managedLinks?: Record<string, string>;
    /** Review and execution compare file metadata without reading template contents. */
    files: TemplateFile[];
};

/** An execution input validated against a fresh read of every reviewed project. */
export type ReviewedTemplateMigration = {
    source: TemplateMigrationSource;
    plan: TemplateMigrationProjectPlan;
};

/** Source-reader progress; the review owner adds trusted batch position information. */
export type TemplateMigrationSourceProgress = Omit<
    TemplateMigrationCheckProgress,
    'projectIndex' | 'projectCount'
>;
