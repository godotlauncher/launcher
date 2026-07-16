import type { InstalledRelease, ReleaseSummary } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    buildInstallEditorInstalledRows,
    countInstalledReleasesByPrerelease,
    filterAvailableEditorRows,
    filterInstallEditorInstalledRows,
    hasDownloadingReleasesByPrerelease,
} from './installEditor.model';

const installedRelease = (
    version: string,
    overrides: Partial<InstalledRelease> = {},
): InstalledRelease => ({
    version,
    version_number: parseInt(version, 10),
    install_path: `/Godot/${version}`,
    editor_path: `/Godot/${version}/Godot`,
    platform: 'linux',
    arch: 'x64',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: null,
    valid: true,
    ...overrides,
});

const releaseSummary = (
    version: string,
    overrides: Partial<ReleaseSummary> = {},
): ReleaseSummary => ({
    version,
    version_number: parseInt(version, 10),
    name: `Godot ${version}`,
    published_at: null,
    draft: false,
    prerelease: false,
    assets: [],
    ...overrides,
});

describe('install editor model helpers', () => {
    it('merges downloading release rows into installed rows', () => {
        const rows = buildInstallEditorInstalledRows(
            [installedRelease('4.2')],
            [
                {
                    version: '4.3',
                    mono: true,
                    prerelease: true,
                    published_at: null,
                },
            ],
        );

        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.version === '4.3')).toMatchObject({
            editor_path: '',
            mono: true,
            prerelease: true,
            valid: true,
        });
    });

    it('filters installed rows by version text', () => {
        const rows = [
            installedRelease('4.2'),
            installedRelease('3.6'),
            installedRelease('4.3'),
        ];

        expect(filterInstallEditorInstalledRows(rows, '4.')).toEqual([
            rows[0],
            rows[2],
        ]);
    });

    it('filters available rows by tab, install state, and search text', () => {
        const stable = [releaseSummary('4.2'), releaseSummary('4.3')];
        const prerelease = [
            releaseSummary('4.4-beta', {
                name: 'Godot 4.4 beta',
                prerelease: true,
            }),
        ];
        const getInstalledRelease = (version: string) =>
            version === '4.3' ? installedRelease('4.3') : undefined;

        expect(
            filterAvailableEditorRows({
                tab: 'RELEASE',
                availableReleases: stable,
                availablePrereleases: prerelease,
                filterInstalled: true,
                textSearch: '',
                getInstalledRelease,
            }),
        ).toEqual([stable[1]]);

        expect(
            filterAvailableEditorRows({
                tab: 'PRERELEASE',
                availableReleases: stable,
                availablePrereleases: prerelease,
                filterInstalled: false,
                textSearch: 'beta',
                getInstalledRelease,
            }),
        ).toEqual(prerelease);
    });

    it('counts installed and downloading releases by prerelease flag', () => {
        const installed = [
            installedRelease('4.2'),
            installedRelease('4.4-beta', { prerelease: true }),
        ];
        const downloading = [
            {
                version: '4.5-beta',
                mono: false,
                prerelease: true,
                published_at: null,
            },
        ];

        expect(countInstalledReleasesByPrerelease(installed, false)).toBe(1);
        expect(countInstalledReleasesByPrerelease(installed, true)).toBe(1);
        expect(hasDownloadingReleasesByPrerelease(downloading, true)).toBe(
            true,
        );
        expect(hasDownloadingReleasesByPrerelease(downloading, false)).toBe(
            false,
        );
    });
});
