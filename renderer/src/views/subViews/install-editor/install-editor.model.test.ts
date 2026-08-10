import type { ReleaseSummary } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    getInstallEditorRefreshCooldownSeconds,
    getInstallEditorRows,
    getLatestInstallEditorRows,
    groupInstallEditorReleases,
} from './install-editor.model.ts';

describe('install editor drawer model', () => {
    const stable = [
        createRelease('4.5-stable'),
        createRelease('4.6-stable'),
        createRelease('4.4.1-stable'),
        createRelease('4.5.1-stable'),
        createRelease('4.4.2-stable'),
    ];
    const prerelease = [
        createRelease('4.6-rc1', true),
        createRelease('4.7-beta2', true),
    ];

    it('selects one featured and three older stable releases', () => {
        expect(
            getLatestInstallEditorRows('stable', stable, prerelease),
        ).toEqual([stable[1], stable[3], stable[0], stable[4]]);
    });

    it('skips prereleases that already have a stable release family', () => {
        expect(
            getLatestInstallEditorRows('prerelease', stable, prerelease),
        ).toEqual([prerelease[1]]);
    });

    it('searches only the selected All channel', () => {
        expect(
            getInstallEditorRows({
                show: 'all',
                channel: 'stable',
                availableReleases: stable,
                availablePrereleases: prerelease,
                search: '4.5',
            }),
        ).toEqual([stable[3], stable[0]]);

        expect(
            getInstallEditorRows({
                show: 'all',
                channel: 'prerelease',
                availableReleases: stable,
                availablePrereleases: prerelease,
                search: 'beta',
            }),
        ).toEqual([prerelease[1]]);
    });

    it('groups releases by major and minor version', () => {
        expect(
            groupInstallEditorReleases([
                stable[1],
                stable[3],
                stable[0],
                stable[4],
            ]),
        ).toEqual([
            {
                baseVersion: '4.6',
                releases: [stable[1]],
            },
            {
                baseVersion: '4.5',
                releases: [stable[3], stable[0]],
            },
            {
                baseVersion: '4.4',
                releases: [stable[4]],
            },
        ]);
    });

    it('counts refresh cooldown seconds from the current time', () => {
        expect(getInstallEditorRefreshCooldownSeconds(60_000, 0)).toBe(60);
        expect(getInstallEditorRefreshCooldownSeconds(60_000, 18_100)).toBe(42);
        expect(getInstallEditorRefreshCooldownSeconds(60_000, 60_000)).toBe(0);
    });
});

/**
 * Creates one release for drawer model tests.
 *
 * @param version - The release version.
 * @param prerelease - Whether this is a prerelease.
 * @returns A release with one standard asset.
 */
function createRelease(version: string, prerelease = false): ReleaseSummary {
    return {
        tag: version,
        version,
        version_number: Number.parseFloat(version),
        name: `Godot ${version}`,
        published_at: '2026-01-01T00:00:00.000Z',
        draft: false,
        prerelease,
        assets: [
            {
                name: `${version}.zip`,
                download_url: `https://example.com/${version}.zip`,
                platform_tags: ['linux', 'x64'],
                mono: false,
            },
        ],
    };
}
