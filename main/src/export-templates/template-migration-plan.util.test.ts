import * as path from 'node:path';
import type {
    TemplateMigrationDecision,
    TemplateMigrationProjectDecision,
} from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { TemplateMigrationSource } from './template-migration.types.js';
import {
    assertMigrationSourceUnchanged,
    migrationDecisions,
    migrationProjectPlan,
} from './template-migration-plan.util.js';

vi.mock('node:fs', () => ({}));

/** Builds a disposable multi-version manifest without accessing the filesystem. */
function source(): TemplateMigrationSource {
    return {
        projectPath: path.resolve('project'),
        name: 'Forest',
        launchPath: path.resolve('editor', 'Godot'),
        setId: '4.7.stable',
        buildSelections: {},
        localRoot: path.resolve('editor', 'editor_data', 'export_templates'),
        localRealPath: path.resolve(
            'editor',
            'editor_data',
            'export_templates',
        ),
        sharedRoot: path.resolve('shared'),
        entries: ['4.7.stable', '4.6.stable.mono', '4.5.stable', '4.4.stable'],
        files: [
            {
                relative: '4.7.stable/web.zip',
                size: 70,
                hash: '7'.repeat(64),
                mode: 0o644,
            },
            {
                relative: '4.6.stable.mono/linux',
                size: 60,
                hash: '6'.repeat(64),
                mode: 0o755,
            },
            {
                relative: '4.5.stable/web.zip',
                size: 50,
                hash: '5'.repeat(64),
                mode: 0o644,
            },
            {
                relative: '4.4.stable/linux',
                size: 40,
                hash: '4'.repeat(64),
                mode: 0o755,
            },
        ],
    };
}

describe('migration decisions', () => {
    it.each([
        null,
        {},
        [],
        [
            {
                projectPath: '',
                selection: { mode: 'all-versions', choice: 'later' },
            },
        ],
        [
            {
                projectPath: 'project',
                selection: { mode: 'all-versions', choice: 'delete' },
            },
        ],
        [
            {
                projectPath: 'project',
                selection: { mode: 'per-version', choices: null },
            },
        ],
        [
            {
                projectPath: 'project',
                selection: { mode: 'per-version', choices: [] },
            },
        ],
        [
            {
                projectPath: 'project',
                selection: {
                    mode: 'per-version',
                    choices: { '../outside': 'later' },
                },
            },
        ],
        [
            {
                projectPath: 'project',
                selection: {
                    mode: 'per-version',
                    choices: { '4.7.stable': 'delete' },
                },
            },
        ],
    ])('rejects malformed choices (%j)', (decisions) => {
        expect(() => migrationDecisions(decisions as never)).toThrow(
            'exportTemplates:errors.decision',
        );
    });

    it('rejects duplicate project decisions', () => {
        const decision: TemplateMigrationProjectDecision = {
            projectPath: source().projectPath,
            selection: { mode: 'all-versions', choice: 'save-imported' },
        };
        expect(() => migrationDecisions([decision, decision])).toThrow(
            'exportTemplates:errors.decision',
        );
    });

    it('copies individual choices before an asynchronous inspection can observe caller changes', () => {
        const decision: TemplateMigrationProjectDecision = {
            projectPath: source().projectPath,
            selection: {
                mode: 'per-version',
                choices: { '4.7.stable': 'later' },
            },
        };
        const copy = migrationDecisions([decision]);
        if (decision.selection.mode === 'per-version')
            decision.selection.choices['4.7.stable'] = 'use-shared';
        decision.selection = { mode: 'all-versions', choice: 'use-shared' };
        expect(copy[0].selection).toEqual({
            mode: 'per-version',
            choices: { '4.7.stable': 'later' },
        });
    });
});

describe('migration version plans', () => {
    it('assigns all four choices independently in the same project', () => {
        const current = source();
        const plan = migrationProjectPlan(
            migrationDecisions([
                {
                    projectPath: current.projectPath,
                    selection: {
                        mode: 'per-version',
                        choices: {
                            '4.4.stable': 'save-imported',
                            '4.5.stable': 'share-project',
                            '4.6.stable.mono': 'use-shared',
                            '4.7.stable': 'later',
                        },
                    },
                },
            ])[0],
            current,
        );
        expect(plan.versions).toEqual([
            {
                setId: '4.4.stable',
                choice: 'save-imported',
                fileCount: 1,
                sizeBytes: 40,
                destination: 'imported',
                sharedFiles: 'unchanged',
                localFiles: 'remove-after-verification',
                pending: false,
            },
            {
                setId: '4.5.stable',
                choice: 'share-project',
                fileCount: 1,
                sizeBytes: 50,
                destination: 'shared',
                sharedFiles: 'add-missing',
                localFiles: 'remove-after-connection',
                pending: false,
            },
            {
                setId: '4.6.stable.mono',
                choice: 'use-shared',
                fileCount: 1,
                sizeBytes: 60,
                destination: 'shared',
                sharedFiles: 'unchanged',
                localFiles: 'remove-after-connection',
                pending: false,
            },
            {
                setId: '4.7.stable',
                choice: 'later',
                fileCount: 1,
                sizeBytes: 70,
                destination: 'local',
                sharedFiles: 'unchanged',
                localFiles: 'keep',
                pending: true,
            },
        ]);
    });

    it.each(['save-imported', 'share-project', 'use-shared', 'later'] as const)(
        'expands one %s choice over all local version folders and editions',
        (choice) => {
            const current = source();
            const plan = migrationProjectPlan(
                {
                    projectPath: current.projectPath,
                    selection: { mode: 'all-versions', choice },
                },
                current,
            );
            expect(plan.versions.map((version) => version.choice)).toEqual([
                choice,
                choice,
                choice,
                choice,
            ]);
        },
    );

    it('includes marker-only and empty version folders without reprocessing owned links', () => {
        const current = source();
        current.entries.push('4.3.stable', '4.2.stable', '4.1.stable');
        current.files.push({
            relative: '4.3.stable/version.txt',
            size: 10,
            hash: '3'.repeat(64),
            mode: 0o644,
        });
        current.managedLinks = {
            '4.1.stable': path.join(current.sharedRoot, '4.1.stable'),
        };
        const plan = migrationProjectPlan(
            {
                projectPath: current.projectPath,
                selection: { mode: 'all-versions', choice: 'save-imported' },
            },
            current,
        );
        expect(
            plan.versions.find((version) => version.setId === '4.3.stable'),
        ).toMatchObject({ fileCount: 1, sizeBytes: 10 });
        expect(
            plan.versions.find((version) => version.setId === '4.2.stable'),
        ).toMatchObject({ fileCount: 0, sizeBytes: 0 });
        expect(plan.versions.map((version) => version.setId)).not.toContain(
            '4.1.stable',
        );
    });

    it.each([
        { '4.4.stable': 'later' },
        {
            '4.4.stable': 'later',
            '4.5.stable': 'later',
            '4.6.stable.mono': 'later',
            '4.7.stable': 'later',
            '4.3.stable': 'later',
        },
    ] as Record<string, TemplateMigrationDecision>[])(
        'rejects missing or obsolete individual decisions',
        (choices) => {
            const current = source();
            expect(() =>
                migrationProjectPlan(
                    {
                        projectPath: current.projectPath,
                        selection: { mode: 'per-version', choices },
                    },
                    current,
                ),
            ).toThrow('exportTemplates:errors.changed');
        },
    );

    it('rejects a source resolved to a different project', () => {
        expect(() =>
            migrationProjectPlan(
                {
                    projectPath: path.resolve('other'),
                    selection: { mode: 'all-versions', choice: 'later' },
                },
                source(),
            ),
        ).toThrow('exportTemplates:errors.changed');
    });

    it('rejects an empty collection instead of silently connecting it', () => {
        const current = { ...source(), entries: [], files: [] };
        expect(() =>
            migrationProjectPlan(
                {
                    projectPath: current.projectPath,
                    selection: { mode: 'all-versions', choice: 'later' },
                },
                current,
            ),
        ).toThrow('exportTemplates:errors.changed');
    });
});

describe('review source guards', () => {
    it('accepts unchanged files regardless of discovery ordering', () => {
        const reviewed = source();
        expect(() =>
            assertMigrationSourceUnchanged(reviewed, {
                ...reviewed,
                entries: [...reviewed.entries].reverse(),
                files: [...reviewed.files].reverse(),
            }),
        ).not.toThrow();
    });

    it.each([
        { launchPath: path.resolve('new-editor', 'Godot') },
        { setId: '4.8.stable' },
        { mode: 'separate' as const },
        { buildSelections: { '4.7.stable': 'official' } },
        { localRoot: path.resolve('different-local-root') },
        { localRealPath: path.resolve('redirected-local-root') },
        { sharedRoot: path.resolve('different-shared-root') },
        { entries: ['4.7.stable'] },
        { entries: [...source().entries, '4.8.stable'] },
    ])('rejects changed project context or version folders (%j)', (change) => {
        const reviewed = source();
        expect(() =>
            assertMigrationSourceUnchanged(reviewed, {
                ...reviewed,
                ...change,
            }),
        ).toThrow('exportTemplates:errors.changed');
    });

    it.each([
        { hash: 'f'.repeat(64) },
        { size: 71 },
        { mode: 0o755 },
        { relative: '4.7.stable/renamed.zip' },
    ])('rejects changed content, size, permissions or names (%j)', (change) => {
        const reviewed = source();
        const current = structuredClone(reviewed);
        Object.assign(current.files[0], change);
        expect(() => assertMigrationSourceUnchanged(reviewed, current)).toThrow(
            'exportTemplates:errors.changed',
        );
    });

    it('rejects a same-size modification using metadata without content hashes', () => {
        const reviewed = source();
        reviewed.files = reviewed.files.map((file) => ({
            ...file,
            hash: '',
            metadata: { mtimeMs: 1, ctimeMs: 1, ino: 1, dev: 1 },
        }));
        const current = structuredClone(reviewed);
        if (current.files[0].metadata) current.files[0].metadata.mtimeMs = 2;
        expect(() => assertMigrationSourceUnchanged(reviewed, current)).toThrow(
            'changed',
        );
    });

    it('checks the deferred version and marker files too', () => {
        const reviewed = source();
        const current = structuredClone(reviewed);
        current.files[current.files.length - 1].hash = 'f'.repeat(64);
        expect(() => assertMigrationSourceUnchanged(reviewed, current)).toThrow(
            'exportTemplates:errors.changed',
        );
    });
});
