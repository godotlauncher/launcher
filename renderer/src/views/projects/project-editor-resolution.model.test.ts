import type {
    AddProjectEditorResolution,
    ProjectDetails,
    ReleaseSummary,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    findDownloadableMissingProjectEditor,
    findDownloadableProjectEditor,
} from './project-editor-resolution.model';

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

function createMissingProject(version: string, mono = false): ProjectDetails {
    return {
        name: 'Missing Editor Project',
        version,
        version_number: Number.parseFloat(version),
        renderer: 'FORWARD_PLUS',
        path: '/projects/missing-editor',
        editor_settings_path: '',
        editor_settings_file: '',
        last_opened: null,
        release: {
            version,
            version_number: Number.parseFloat(version),
            install_path: '',
            editor_path: '',
            platform: 'linux',
            arch: 'x64',
            mono,
            prerelease: false,
            config_version: 5,
            published_at: null,
            valid: false,
            source: 'official',
        },
        launch_path: '',
        config_version: 5,
        codeEditorId: null,
        withGit: false,
        valid: false,
        invalid_reason: 'missing_editor',
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

    it('finds the exact editor required by a stored missing project', () => {
        const release = createRelease('4.4.3-stable');

        expect(
            findDownloadableMissingProjectEditor(
                createMissingProject('4.4.3-stable', true),
                [release],
                [],
            ),
        ).toBe(release);
    });

    it('offers the newest stable patch for an unresolved stored branch', () => {
        const latest = createRelease('4.8.2-stable');
        expect(
            findDownloadableMissingProjectEditor(
                createMissingProject('4.8'),
                [
                    createRelease('4.8-stable'),
                    latest,
                    createRelease('4.9-stable'),
                ],
                [createRelease('4.8.3-beta1', true)],
            ),
        ).toBe(latest);
    });

    it('offers the latest compatible prerelease when no stable flavour exists', () => {
        const latest = createRelease('4.8-beta10', true);
        const standardOnly = createRelease('4.8-stable');
        standardOnly.assets = standardOnly.assets.filter(
            (asset) => !asset.mono,
        );
        expect(
            findDownloadableMissingProjectEditor(
                createMissingProject('4.8', true),
                [standardOnly],
                [
                    createRelease('4.8-dev9', true),
                    createRelease('4.8-beta2', true),
                    latest,
                ],
            ),
        ).toBe(latest);
    });

    it('does not substitute a different version for an exact missing requirement', () => {
        expect(
            findDownloadableMissingProjectEditor(
                createMissingProject('4.8-beta2'),
                [],
                [createRelease('4.8-beta3', true)],
            ),
        ).toBeUndefined();
    });

    it('does not offer catalogue downloads for custom missing editors', () => {
        const project = createMissingProject('4.4.3-stable');
        project.release.source = 'custom';

        expect(
            findDownloadableMissingProjectEditor(
                project,
                [createRelease('4.4.3-stable')],
                [],
            ),
        ).toBeUndefined();
    });

    it('does not offer an editor when the exact required flavour is unavailable', () => {
        const release = createRelease('4.4.3-stable');
        release.assets = release.assets.filter((asset) => !asset.mono);

        expect(
            findDownloadableMissingProjectEditor(
                createMissingProject('4.4.3-stable', true),
                [release],
                [],
            ),
        ).toBeUndefined();
    });
});
