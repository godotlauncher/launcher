import type { TemplateProjectAssessment } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    canChooseMigration,
    changeMigrationChoice,
    hasMigrationCandidates,
    migrationErrorKey,
    migrationProjectDecision,
    migrationVersionName,
    reconcileMigrationChoices,
} from './template-migration-choice.util';

const project: TemplateProjectAssessment = {
    projectPath: 'project-a',
    name: 'Night Garden',
    state: 'needs-review',
    reason: 'unverified-files',
    pending: true,
    compared: false,
    provenance: 'unverified',
    setIds: ['4.3.stable', '4.4.stable.mono'],
    metadata: [],
    unexpected: [],
};

describe('migration choices', () => {
    it('recommends keeping current templates for every eligible version', () => {
        const choices = reconcileMigrationChoices([project]);
        expect(choices[project.projectPath]).toEqual({
            mode: 'all-versions',
            allChoice: 'save-imported',
            versions: {
                '4.3.stable': 'save-imported',
                '4.4.stable.mono': 'save-imported',
            },
        });
    });
    it.each(['unavailable', 'blocked', 'busy', 'recovery'] as const)(
        'leaves %s projects for later even with remembered choices',
        (state) => {
            const unavailable = { ...project, state };
            const choices = reconcileMigrationChoices(
                [unavailable],
                reconcileMigrationChoices([project]),
            );
            expect(canChooseMigration(unavailable)).toBe(false);
            expect(
                Object.values(choices[project.projectPath].versions),
            ).toEqual(['later', 'later']);
            expect(choices[project.projectPath].allChoice).toBe('later');
        },
    );
    it('does not make an empty project eligible', () => {
        expect(canChooseMigration({ ...project, setIds: [] })).toBe(false);
    });
    it('keeps inactive individual choices when a project-wide decision is serialised', () => {
        const choices = reconcileMigrationChoices([project]);
        choices[project.projectPath] = changeMigrationChoice(
            choices[project.projectPath],
            'use-shared',
            '4.3.stable',
        );
        expect(migrationProjectDecision(project, choices).selection).toEqual({
            mode: 'all-versions',
            choice: 'save-imported',
        });
        choices[project.projectPath].mode = 'per-version';
        expect(migrationProjectDecision(project, choices).selection).toEqual({
            mode: 'per-version',
            choices: {
                '4.3.stable': 'use-shared',
                '4.4.stable.mono': 'save-imported',
            },
        });
    });
    it('an explicit all-version change replaces every remembered individual choice', () => {
        const current = reconcileMigrationChoices([project])[
            project.projectPath
        ];
        const individual = changeMigrationChoice(
            current,
            'later',
            '4.3.stable',
        );
        const all = changeMigrationChoice(individual, 'share-project');
        expect(Object.values(all.versions)).toEqual([
            'share-project',
            'share-project',
        ]);
        expect(current.versions['4.3.stable']).toBe('save-imported');
    });
    it('drops removed projects and versions, and initialises newly found versions', () => {
        const choices = reconcileMigrationChoices([
            project,
            { ...project, projectPath: 'removed' },
        ]);
        choices[project.projectPath].allChoice = 'later';
        const refreshed = reconcileMigrationChoices(
            [{ ...project, setIds: ['4.3.stable', '4.5.stable'] }],
            choices,
        );
        expect(Object.keys(refreshed)).toEqual([project.projectPath]);
        expect(refreshed[project.projectPath].versions).toEqual({
            '4.3.stable': 'save-imported',
            '4.5.stable': 'later',
        });
    });
    it('preserves release qualifiers and identifies .NET versions', () => {
        expect(migrationVersionName('4.4.rc1.mono')).toBe('4.4.rc1 .NET');
        expect(migrationVersionName('4.4.stable')).toBe('4.4.stable');
    });
    it('uses bounded error keys rather than displaying raw error text', () => {
        expect(
            migrationErrorKey(new Error('exportTemplates:errors.changed')),
        ).toBe('errors.changed');
        expect(migrationErrorKey('Private path and unknown error')).toBe(
            'errors.failed',
        );
        expect(migrationErrorKey('exportTemplates:errors.unknown')).toBe(
            'errors.failed',
        );
    });
});

describe('automatic migration candidates', () => {
    it('offers populated projects that can be reviewed', () => {
        expect(hasMigrationCandidates([project])).toBe(true);
        expect(hasMigrationCandidates([{ ...project, state: 'ready' }])).toBe(
            true,
        );
    });

    it.each([
        'unavailable',
        'blocked',
        'busy',
        'recovery',
        'shared',
        'separate',
    ] as const)('does not offer projects in the %s state', (state) => {
        expect(hasMigrationCandidates([{ ...project, state }])).toBe(false);
    });

    it('does not offer missing editors or empty and resolved projects', () => {
        expect(hasMigrationCandidates([])).toBe(false);
        expect(
            hasMigrationCandidates([
                {
                    ...project,
                    state: 'unavailable',
                    reason: 'missing-editor',
                    setIds: [],
                },
                { ...project, state: 'ready', reason: 'empty', setIds: [] },
                { ...project, pending: false },
            ]),
        ).toBe(false);
    });

    it('still offers a reviewable project when another editor is unavailable', () => {
        expect(
            hasMigrationCandidates([
                {
                    ...project,
                    projectPath: 'installing',
                    state: 'unavailable',
                    reason: 'missing-editor',
                    setIds: [],
                },
                project,
            ]),
        ).toBe(true);
    });
});
