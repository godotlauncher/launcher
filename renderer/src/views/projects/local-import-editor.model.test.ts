import type {
    InstalledRelease,
    ProjectImportInspection,
    ReleaseSummary,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    applyImportDownloadPreference,
    prepareLocalImportRow,
} from './local-import-editor.model';

const beta: ReleaseSummary = {
    version: '4.8-beta2',
    version_number: 4.8,
    name: '4.8 beta 2',
    published_at: null,
    draft: false,
    prerelease: true,
    assets: [],
};
const row: ProjectImportInspection = {
    projectFilePath: '/fixture/project.godot',
    name: 'Chosen name',
};

describe('local import editor preparation', () => {
    it('keeps the inferred request while preselecting a recommended download', () => {
        const prepared = prepareLocalImportRow(
            {
                ...row,
                editorResolution: {
                    requested: {
                        kind: 'stable-base',
                        channel: 'official',
                        flavor: 'gdscript',
                        base_version: '4.8',
                    },
                    choices: [
                        {
                            id: 'beta',
                            version: beta.version,
                            source: 'official',
                            flavor: 'gdscript',
                            prerelease: true,
                            installed: false,
                            recommended: true,
                            release: beta,
                        },
                    ],
                },
            },
            [],
            [],
        );
        expect(prepared.editorActionId).toBe('beta');
        expect(prepared.editorActions[0]).toMatchObject({
            kind: 'download',
            download: beta,
            options: { resolution: 'add_missing', editorChoiceId: 'beta' },
        });
        expect(prepared.editorResolution?.requested).toMatchObject({
            kind: 'stable-base',
            base_version: '4.8',
        });
        expect(prepared.editorActions[1]).toMatchObject({
            kind: 'missing',
            options: { resolution: 'add_missing' },
        });
    });

    it('uses the exact prerelease catalogue for saved requirements', () => {
        const prepared = prepareLocalImportRow(
            {
                ...row,
                editorResolution: {
                    requested: {
                        kind: 'exact',
                        channel: 'official',
                        flavor: 'gdscript',
                        base_version: '4.8',
                        version: beta.version,
                    },
                    downloadable: {
                        match: 'exact',
                        version: beta.version,
                        flavor: 'gdscript',
                        prerelease: true,
                    },
                },
            },
            [],
            [beta],
        );
        expect(prepared.editorActions[0]).toMatchObject({
            kind: 'download',
            download: beta,
        });
        expect(prepared.name).toBe('Chosen name');
    });

    it('prefers an exact requested download over an installed fallback', () => {
        const requested = {
            ...beta,
            version: '4.7.2-stable',
            name: '4.7.2 stable',
            prerelease: false,
        };
        const prepared = prepareLocalImportRow(
            {
                ...row,
                editorResolution: {
                    requested: {
                        kind: 'exact',
                        channel: 'official',
                        flavor: 'gdscript',
                        base_version: '4.7',
                        version: requested.version,
                    },
                    fallback: {
                        version: '4.7-stable',
                    } as InstalledRelease,
                    downloadable: {
                        match: 'exact',
                        version: requested.version,
                        flavor: 'gdscript',
                        prerelease: false,
                    },
                },
            },
            [requested],
            [],
        );

        expect(prepared.editorActionId).toBe('download');
        expect(prepared.editorActions.map(({ id }) => id)).toEqual([
            'download',
            'fallback',
            'missing',
        ]);
        expect(prepared.editorActions[0]).toMatchObject({
            kind: 'download',
            version: requested.version,
            download: requested,
        });
    });

    it('leaves resolved imports automatic and excludes unusable download choices', () => {
        expect(prepareLocalImportRow(row, [], []).editorActions).toEqual([
            { id: 'automatic', version: undefined, kind: 'use', options: {} },
        ]);
        const prepared = prepareLocalImportRow(
            {
                ...row,
                editorResolution: {
                    requested: {
                        kind: 'stable-base',
                        channel: 'official',
                        flavor: 'gdscript',
                        base_version: '4.8',
                    },
                    choices: [
                        {
                            id: 'bad',
                            version: beta.version,
                            source: 'official',
                            flavor: 'gdscript',
                            prerelease: true,
                            installed: false,
                            recommended: true,
                        },
                    ],
                },
            },
            [],
            [],
        );
        expect(prepared.editorActionId).toBe('missing');
        expect(prepared.editorActions).toHaveLength(1);
    });
});

describe('import editor download preference', () => {
    it('preserves selected versions and installed actions while disabling every download without mutating the source', () => {
        const prepared = prepareLocalImportRow(
            {
                ...row,
                editorResolution: {
                    requested: {
                        kind: 'exact',
                        channel: 'official',
                        flavor: 'gdscript',
                        base_version: '4.8',
                        version: beta.version,
                    },
                    choices: [
                        {
                            id: 'download-beta',
                            version: beta.version,
                            source: 'official',
                            flavor: 'gdscript',
                            prerelease: true,
                            installed: false,
                            recommended: true,
                            release: beta,
                        },
                        {
                            id: 'installed',
                            version: '4.7-stable',
                            source: 'official',
                            flavor: 'gdscript',
                            prerelease: false,
                            installed: true,
                            recommended: false,
                        },
                    ],
                },
            },
            [],
            [],
        );
        const disabled = applyImportDownloadPreference([prepared], false)[0];
        expect(disabled.downloadMissingEditors).toBe(false);
        expect(disabled.editorActionId).toBe('download-beta');
        expect(disabled.editorActions[0]).toMatchObject({
            id: 'download-beta',
            kind: 'missing',
            version: beta.version,
            options: {
                resolution: 'add_missing',
                editorChoiceId: 'download-beta',
            },
        });
        expect(disabled.editorActions.every((action) => !action.download)).toBe(
            true,
        );
        expect(disabled.editorActions[1]).toEqual(prepared.editorActions[1]);
        expect(prepared.editorActions[0].download).toBe(beta);
        expect(
            applyImportDownloadPreference([prepared], true)[0].editorActions,
        ).toEqual(prepared.editorActions);
    });
    it('retains a deliberate installed-editor selection and automatic resolved editors', () => {
        const prepared = prepareLocalImportRow(row, [], []);
        const disabled = applyImportDownloadPreference([prepared], false)[0];
        expect(disabled.editorActionId).toBe('automatic');
        expect(disabled.editorActions).toEqual(prepared.editorActions);
        expect(disabled.downloadMissingEditors).toBe(false);
    });
});
