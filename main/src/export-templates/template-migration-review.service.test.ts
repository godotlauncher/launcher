import * as path from 'node:path';
import type { TemplateMigrationProjectDecision } from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
    TemplateMigrationSource,
    TemplateMigrationSourceProgress,
} from './template-migration.types.js';
import { TemplateMigrationReviewService } from './template-migration-review.service.js';

vi.mock('node:fs', () => ({}));

/** Creates an isolated project manifest without reading a real project.
 * @param projectPath - Fictional registered identity.
 */
function source(
    projectPath = path.resolve('project'),
): TemplateMigrationSource {
    return {
        projectPath,
        name: 'Project',
        launchPath: path.join(projectPath, 'Godot'),
        setId: '4.7.stable',
        buildSelections: {},
        localRoot: path.join(projectPath, 'editor_data', 'export_templates'),
        localRealPath: path.join(
            projectPath,
            'editor_data',
            'export_templates',
        ),
        sharedRoot: path.resolve('shared'),
        entries: ['4.7.stable', '4.6.stable'],
        files: [
            {
                relative: '4.7.stable/web.zip',
                hash: '',
                size: 20,
                mode: 0o644,
                metadata: { mtimeMs: 1, ctimeMs: 1, ino: 1, dev: 1 },
            },
            {
                relative: '4.6.stable/linux',
                hash: '',
                size: 30,
                mode: 0o755,
                metadata: { mtimeMs: 1, ctimeMs: 1, ino: 2, dev: 1 },
            },
        ],
    };
}

/** Selects one policy for all discovered versions in a fictional project.
 * @param projectPath - Fictional registered identity.
 */
function decision(
    projectPath = path.resolve('project'),
): TemplateMigrationProjectDecision {
    return {
        projectPath,
        selection: { mode: 'all-versions', choice: 'save-imported' },
    };
}

describe('migration batch reviews', () => {
    it('scopes progress to its request and preserves deferred choices when rechecking', async () => {
        const read = vi.fn(
            async (
                _path: string,
                report?: (progress: TemplateMigrationSourceProgress) => void,
            ) => {
                report?.({
                    phase: 'checking',
                    projectName: 'Project',
                    completedBytes: 0,
                    totalBytes: 0,
                });
                return source();
            },
        );
        const service = new TemplateMigrationReviewService(read);
        const request = {
            ...decision(),
            selection: {
                mode: 'per-version' as const,
                choices: {
                    '4.7.stable': 'later' as const,
                    '4.6.stable': 'save-imported' as const,
                },
            },
        };
        const id = '00000000-0000-4000-8000-000000000001';
        const review = await service.prepare([request], id);
        const progress = service.getProgress(id);
        expect(progress).toMatchObject({
            projectIndex: 1,
            projectCount: 1,
            completedBytes: 0,
            totalBytes: 0,
        });
        if (!progress) throw new Error('Expected checking progress');
        progress.completedBytes = 500;
        expect(service.getProgress(id)?.completedBytes).toBe(0);
        expect(service.getProgress('other')).toBeUndefined();
        const [validated] = await service.consume(review.token);
        expect(
            validated.plan.versions.map(({ setId, choice }) => [setId, choice]),
        ).toEqual([
            ['4.6.stable', 'save-imported'],
            ['4.7.stable', 'later'],
        ]);
    });

    it('ignores progress from a superseded preparation', async () => {
        let complete!: (value: TemplateMigrationSource) => void;
        let oldReport:
            | ((value: TemplateMigrationSourceProgress) => void)
            | undefined;
        const read = vi.fn(
            async (
                _path: string,
                report?: (value: TemplateMigrationSourceProgress) => void,
            ) => {
                report?.({
                    phase: 'checking',
                    projectName: 'Current',
                    completedBytes: 5,
                    totalBytes: 10,
                });
                return source();
            },
        );
        read.mockImplementationOnce((_path, report) => {
            oldReport = report;
            return new Promise((resolve) => {
                complete = resolve;
            });
        });
        const service = new TemplateMigrationReviewService(read);
        const oldId = '00000000-0000-4000-8000-000000000001';
        const newId = '00000000-0000-4000-8000-000000000002';
        const older = service.prepare([decision()], oldId);
        await service.prepare([decision()], newId);
        oldReport?.({
            phase: 'checking',
            projectName: 'Old',
            completedBytes: 10,
            totalBytes: 10,
        });
        expect(service.getProgress(oldId)).toBeUndefined();
        expect(service.getProgress(newId)?.projectName).toBe('Current');
        complete(source());
        await expect(older).rejects.toThrow('changed');
    });

    it('requires an explicit removal acknowledgement before rechecking or consuming the review', async () => {
        const read = vi.fn(async () => source());
        const service = new TemplateMigrationReviewService(read);
        const review = await service.prepare([
            {
                ...decision(),
                selection: { mode: 'all-versions', choice: 'use-shared' },
            },
        ]);
        read.mockClear();
        await expect(service.consume(review.token)).rejects.toThrow(
            'exportTemplates:errors.decision',
        );
        expect(read).not.toHaveBeenCalled();
        expect(await service.consume(review.token, true)).toHaveLength(1);
        await expect(service.consume(review.token, true)).rejects.toThrow(
            'exportTemplates:errors.changed',
        );
    });
    it('refuses projects that share the same physical template folder', async () => {
        const read = vi.fn(async (projectPath: string) => ({
            ...source(projectPath),
            localRealPath: path.resolve('same-template-folder'),
        }));
        const service = new TemplateMigrationReviewService(read);
        await expect(
            service.prepare([
                decision(),
                decision(path.resolve('alias-project')),
            ]),
        ).rejects.toThrow('exportTemplates:errors.connection');
    });
    it('reviews and rechecks twelve projects in one batch', async () => {
        const read = vi.fn(async (projectPath: string) => source(projectPath));
        const service = new TemplateMigrationReviewService(read);
        const requests = Array.from({ length: 12 }, (_, index) =>
            decision(path.resolve(`project-${index}`)),
        );
        const review = await service.prepare(requests);
        expect(review.projects.map((project) => project.projectPath)).toEqual(
            requests.map((request) => request.projectPath),
        );
        expect(
            review.projects.every((project) => project.versions.length === 2),
        ).toBe(true);
        expect(read).toHaveBeenCalledTimes(12);
        expect(await service.consume(review.token)).toHaveLength(12);
        expect(read).toHaveBeenCalledTimes(24);
        await expect(service.consume(review.token)).rejects.toThrow(
            'exportTemplates:errors.changed',
        );
    });

    it('validates the whole request before reading any project', async () => {
        const read = vi.fn(async () => source());
        const service = new TemplateMigrationReviewService(read);
        await expect(
            service.prepare([
                decision(),
                {
                    projectPath: 'other',
                    selection: { mode: 'all-versions', choice: 'delete' },
                } as never,
            ]),
        ).rejects.toThrow('exportTemplates:errors.decision');
        expect(read).not.toHaveBeenCalled();
    });

    it.each(['share-project', 'use-shared', 'save-imported', 'later'] as const)(
        'requires removal acknowledgement only for a Share or Use shared choice (%s)',
        async (choice) => {
            const service = new TemplateMigrationReviewService(async () =>
                source(),
            );
            const review = await service.prepare([
                { ...decision(), selection: { mode: 'all-versions', choice } },
            ]);
            expect(review.requiresRemovalConfirmation).toBe(
                ['share-project', 'use-shared'].includes(choice),
            );
        },
    );

    it('includes individual removal choices in the batch acknowledgement', async () => {
        const service = new TemplateMigrationReviewService(async () =>
            source(),
        );
        const review = await service.prepare([
            {
                ...decision(),
                selection: {
                    mode: 'per-version',
                    choices: {
                        '4.7.stable': 'later',
                        '4.6.stable': 'use-shared',
                    },
                },
            },
        ]);
        expect(review.requiresRemovalConfirmation).toBe(true);
    });

    it('keeps a trusted copy when requests and returned display data change', async () => {
        const current = source();
        const request = decision();
        const service = new TemplateMigrationReviewService(async () => current);
        const review = await service.prepare([request]);
        request.selection = { mode: 'all-versions', choice: 'use-shared' };
        review.projects[0].versions[0].choice = 'use-shared';
        const validated = await service.consume(review.token);
        expect(
            validated[0].plan.versions.every(
                (version) => version.choice === 'save-imported',
            ),
        ).toBe(true);
    });

    it('refuses the whole batch when a later project changes after Review', async () => {
        const secondPath = path.resolve('second-project');
        const read = vi.fn(async (projectPath: string) => source(projectPath));
        const service = new TemplateMigrationReviewService(read);
        const review = await service.prepare([
            decision(),
            decision(secondPath),
        ]);
        read.mockImplementation(async (projectPath) => {
            const current = source(projectPath);
            if (projectPath === secondPath)
                current.files[0].metadata = {
                    mtimeMs: 2,
                    ctimeMs: 1,
                    ino: 1,
                    dev: 1,
                };
            return current;
        });
        await expect(service.consume(review.token)).rejects.toThrow(
            'exportTemplates:errors.changed',
        );
        read.mockImplementation(async (projectPath) => source(projectPath));
        await expect(service.consume(review.token)).rejects.toThrow(
            'exportTemplates:errors.changed',
        );
    });

    it('invalidates a review when its project can no longer be read', async () => {
        const read = vi.fn(async () => source());
        const service = new TemplateMigrationReviewService(read);
        const review = await service.prepare([decision()]);
        read.mockRejectedValueOnce(
            new Error('exportTemplates:errors.connection'),
        );
        await expect(service.consume(review.token)).rejects.toThrow(
            'exportTemplates:errors.connection',
        );
        await expect(service.consume(review.token)).rejects.toThrow(
            'exportTemplates:errors.changed',
        );
    });

    it('refuses unknown, superseded and closed review tokens', async () => {
        const service = new TemplateMigrationReviewService(async () =>
            source(),
        );
        const first = await service.prepare([decision()]);
        const second = await service.prepare([decision()]);
        await expect(service.consume('unknown')).rejects.toThrow(
            'exportTemplates:errors.changed',
        );
        await expect(service.consume(first.token)).rejects.toThrow(
            'exportTemplates:errors.changed',
        );
        service.discard(first.token);
        expect(await service.consume(second.token)).toHaveLength(1);
        const third = await service.prepare([decision()]);
        service.discard(third.token);
        await expect(service.consume(third.token)).rejects.toThrow(
            'exportTemplates:errors.changed',
        );
    });

    it('cannot publish an older preparation over a newer review', async () => {
        let complete!: (value: TemplateMigrationSource) => void;
        const read = vi.fn(async () => source());
        read.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    complete = resolve;
                }),
        );
        const service = new TemplateMigrationReviewService(read);
        const older = service.prepare([decision()]);
        const newer = await service.prepare([decision()]);
        complete(source());
        await expect(older).rejects.toThrow('exportTemplates:errors.changed');
        expect(await service.consume(newer.token)).toHaveLength(1);
    });

    it('refuses an execution read that overlaps a replacement review', async () => {
        let complete!: (value: TemplateMigrationSource) => void;
        const read = vi.fn(async () => source());
        const service = new TemplateMigrationReviewService(read);
        const old = await service.prepare([decision()]);
        read.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    complete = resolve;
                }),
        );
        const pending = service.consume(old.token);
        const replacement = await service.prepare([decision()]);
        complete(source());
        await expect(pending).rejects.toThrow('exportTemplates:errors.changed');
        expect(await service.consume(replacement.token)).toHaveLength(1);
    });
});
