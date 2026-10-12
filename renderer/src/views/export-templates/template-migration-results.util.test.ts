import type { TemplateMigrationReview } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import { migrationResults } from './template-migration-results.util';
import type { MigrationRun } from './template-migration-wizard.types';

const review: TemplateMigrationReview = {
    token: 'review',
    requiresRemovalConfirmation: false,
    projects: [
        {
            projectPath: 'project',
            name: 'Project',
            selectionMode: 'per-version',
            versions: ['success', 'failure', 'missing', 'deferred'].map(
                (setId) => ({
                    setId,
                    choice: setId === 'deferred' ? 'later' : 'save-imported',
                    fileCount: 2,
                    sizeBytes: 100,
                    destination: setId === 'deferred' ? 'local' : 'imported',
                    sharedFiles: 'unchanged',
                    localFiles:
                        setId === 'deferred'
                            ? 'keep'
                            : 'remove-after-verification',
                    pending: setId === 'deferred',
                }),
            ),
        },
    ],
};

describe('migrationResults', () => {
    it('retries failed and missing outcomes without including successful, deferred or unrelated versions', () => {
        const result = migrationResults(review, {
            status: 'complete',
            versions: [
                {
                    projectPath: 'project',
                    setId: 'success',
                    status: 'complete',
                },
                { projectPath: 'project', setId: 'failure', status: 'error' },
                { projectPath: 'project', setId: 'deferred', status: 'error' },
                { projectPath: 'other', setId: 'unrelated', status: 'error' },
            ],
        });
        expect(result.failed).toEqual([
            { projectPath: 'project', setId: 'failure' },
            { projectPath: 'project', setId: 'missing' },
        ]);
        expect(result.completed).toEqual([
            { projectPath: 'project', setId: 'success' },
        ]);
        expect(result).toMatchObject({ total: 3, finished: 2, later: 1 });
    });

    it('counts finished errors without inventing completion and shows only a reviewed active phase', () => {
        const run: MigrationRun = {
            status: 'running',
            versions: [
                { projectPath: 'other', setId: 'unrelated', status: 'copying' },
                {
                    projectPath: 'project',
                    setId: 'success',
                    status: 'complete',
                },
                { projectPath: 'project', setId: 'failure', status: 'error' },
                {
                    projectPath: 'project',
                    setId: 'missing',
                    status: 'verifying',
                },
            ],
        };
        expect(migrationResults(review, run)).toMatchObject({
            total: 3,
            finished: 2,
            activeStatus: 'verifying',
        });
    });
});
