import type {
    TemplateMigrationAssessment,
    TemplateMigrationReview,
    TemplateMigrationRun,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    mergeMigrationReviews,
    mergeMigrationRuns,
    migrationRetryDecisions,
} from './template-migration-run.util';

const ids = ['4.3.stable', '4.4.stable', '4.5.stable'];
const review: TemplateMigrationReview = {
    token: 'old',
    requiresRemovalConfirmation: true,
    projects: [
        {
            projectPath: 'project',
            name: 'Night Garden',
            selectionMode: 'per-version',
            versions: ids.map((setId, index) => ({
                setId,
                choice: index === 2 ? 'later' : 'use-shared',
                fileCount: 1,
                sizeBytes: 100,
                destination: index === 2 ? 'local' : 'shared',
                sharedFiles: 'unchanged',
                localFiles: index === 2 ? 'keep' : 'remove-after-connection',
                pending: index === 2,
            })),
        },
    ],
};
const assessment: TemplateMigrationAssessment = {
    recoveryIds: [],
    pendingCount: 1,
    projects: [
        {
            projectPath: 'project',
            name: 'Night Garden',
            state: 'needs-review',
            reason: 'unverified-files',
            pending: true,
            compared: false,
            provenance: 'unverified',
            setIds: ids.slice(1),
            metadata: [],
            unexpected: [],
        },
    ],
};
const failed = [{ projectPath: 'project', setId: ids[1] }];

describe('reviewed migration retries', () => {
    it('includes only failed choices and explicitly leaves other discovered versions alone', () => {
        expect(migrationRetryDecisions(review, failed, assessment)).toEqual([
            {
                projectPath: 'project',
                selection: {
                    mode: 'per-version',
                    choices: { [ids[1]]: 'use-shared', [ids[2]]: 'later' },
                },
            },
        ]);
    });
    it('blocks retry until recovery has finished', () => {
        expect(() =>
            migrationRetryDecisions(review, failed, {
                ...assessment,
                recoveryIds: ['interrupted'],
            }),
        ).toThrow('errors.recovery');
    });
    it.each(
        [
            [{ projectPath: 'other', setId: ids[1] }],
            [{ projectPath: 'project', setId: ids[0] }],
            [{ projectPath: 'project', setId: ids[2] }],
            [...failed, ...failed],
            [],
        ].map((identities) => ({ identities })),
    )(
        'rejects an unavailable, unrelated, deferred or duplicate retry: %j',
        ({ identities }) => {
            expect(() =>
                migrationRetryDecisions(review, identities, assessment),
            ).toThrow('errors.changed');
        },
    );
    it('retains completed versions while only failed versions become active again', () => {
        const previous: TemplateMigrationRun = {
            status: 'complete',
            versions: [
                { projectPath: 'project', setId: ids[0], status: 'complete' },
                {
                    projectPath: 'project',
                    setId: ids[1],
                    status: 'error',
                    error: 'exportTemplates:errors.space',
                },
                { projectPath: 'project', setId: ids[2], status: 'later' },
            ],
        };
        expect(
            mergeMigrationRuns(previous, {
                status: 'running',
                versions: [
                    { projectPath: 'project', setId: ids[0], status: 'later' },
                    {
                        projectPath: 'project',
                        setId: ids[1],
                        status: 'checking',
                    },
                ],
            }),
        ).toEqual({
            status: 'running',
            versions: [
                previous.versions[0],
                { ...failed[0], status: 'checking' },
                previous.versions[2],
            ],
        });
        expect(previous.versions[1].status).toBe('error');
    });
    it('keeps original effects for completed rows and updates only explicit retry decisions', () => {
        const next = structuredClone(review);
        next.token = 'fresh';
        next.projects[0].versions[0].choice = 'later';
        next.projects[0].versions[1].sizeBytes = 200;
        const merged = mergeMigrationReviews(review, next);
        expect(merged.token).toBe('fresh');
        expect(merged.projects[0].versions[0].choice).toBe('use-shared');
        expect(merged.projects[0].versions[1].sizeBytes).toBe(200);
        expect(review.projects[0].versions[1].sizeBytes).toBe(100);
    });
});
