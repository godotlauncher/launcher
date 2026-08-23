import type {
    AddProjectEditorResolution,
    ReleaseSummary,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import { findDownloadableProjectEditor } from './project-editor-resolution.model';

/**
 * Creates a release catalogue fixture with both standard editor variants.
 *
 * @param version - Release version.
 * @param prerelease - Whether this is a prerelease.
 * @returns A release fixture.
 */
function createRelease(version: string, prerelease = false): ReleaseSummary {
    return {
        version,
        version_number: Number.parseFloat(version),
        name: version,
        published_at: null,
        draft: false,
        prerelease,
        assets: [
            {
                name: `${version}-standard`,
                download_url: 'https://example.com/standard',
                platform_tags: ['linux', 'x64'],
                mono: false,
            },
            {
                name: `${version}-dotnet`,
                download_url: 'https://example.com/dotnet',
                platform_tags: ['linux', 'x64'],
                mono: true,
            },
        ],
    };
}

describe('project editor resolution model', () => {
    it('finds the exact release requested by .godotlauncher', () => {
        const resolution: AddProjectEditorResolution = {
            requested: {
                kind: 'exact',
                channel: 'official',
                flavor: 'gdscript',
                base_version: '4.4',
                version: '4.4-beta2',
            },
            downloadable: {
                match: 'exact',
                version: '4.4-beta2',
                flavor: 'gdscript',
                prerelease: true,
            },
        };
        const requested = createRelease('4.4-beta2', true);

        expect(
            findDownloadableProjectEditor(
                resolution,
                [createRelease('4.4.1-stable')],
                [requested],
            ),
        ).toBe(requested);
    });

    it('finds the newest stable patch for an inferred base version', () => {
        const resolution: AddProjectEditorResolution = {
            requested: {
                kind: 'stable-base',
                channel: 'official',
                flavor: 'gdscript',
                base_version: '4.4',
            },
            downloadable: {
                match: 'stable-base',
                base_version: '4.4',
                flavor: 'gdscript',
            },
        };
        const newest = createRelease('4.4.3-stable');

        expect(
            findDownloadableProjectEditor(
                resolution,
                [
                    createRelease('4.5-stable'),
                    createRelease('4.4.1-stable'),
                    newest,
                ],
                [createRelease('4.4-beta3', true)],
            ),
        ).toBe(newest);
    });

    it('requires an asset for the inferred editor flavour', () => {
        const resolution: AddProjectEditorResolution = {
            requested: {
                kind: 'stable-base',
                channel: 'official',
                flavor: 'dotnet',
                base_version: '4.4',
            },
            downloadable: {
                match: 'stable-base',
                base_version: '4.4',
                flavor: 'dotnet',
            },
        };
        const standardOnly = createRelease('4.4.2-stable');
        standardOnly.assets = standardOnly.assets.filter(
            (asset) => !asset.mono,
        );

        expect(
            findDownloadableProjectEditor(resolution, [standardOnly], []),
        ).toBeUndefined();
    });
});
