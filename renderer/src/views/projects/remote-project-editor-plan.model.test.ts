import type {
    AddProjectToListResult,
    InstalledRelease,
    ReleaseSummary,
    RemoteDiscoveredProject,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    createRemoteProjectEditorPlan,
    type RemoteProjectEditorCandidate,
} from './remote-project-editor-plan.model';

function createRelease(version: string): ReleaseSummary {
    return {
        version,
        version_number: Number.parseFloat(version),
        name: version,
        published_at: null,
        draft: false,
        prerelease: false,
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

function createCandidate(
    name: string,
    result: AddProjectToListResult,
): RemoteProjectEditorCandidate {
    const project: RemoteDiscoveredProject = {
        name,
        relativePath: name.toLowerCase(),
        projectFilePath: `/repo/${name.toLowerCase()}/project.godot`,
        detectedEditor: null,
    };
    return { project, result, options: {} };
}

function createStableResolution(
    baseVersion: string,
    flavor: 'gdscript' | 'dotnet' = 'gdscript',
): AddProjectToListResult {
    return {
        success: false,
        editorResolution: {
            requested: {
                kind: 'stable-base',
                channel: 'official',
                flavor,
                base_version: baseVersion,
            },
            downloadable: {
                match: 'stable-base',
                base_version: baseVersion,
                flavor,
            },
        },
    };
}

describe('remote project editor plan', () => {
    it('groups projects that resolve to the same editor version and flavour', () => {
        const release = createRelease('4.4.3-stable');
        const plan = createRemoteProjectEditorPlan(
            [
                createCandidate('Client', createStableResolution('4.4')),
                createCandidate('Server', createStableResolution('4.4')),
            ],
            [release],
            [],
        );

        expect(plan).toHaveLength(1);
        expect(plan[0]).toMatchObject({
            version: '4.4.3-stable',
            mono: false,
            choice: 'download',
        });
        expect(plan[0].candidates.map(({ project }) => project.name)).toEqual([
            'Client',
            'Server',
        ]);
    });

    it('keeps different versions and flavours in separate groups', () => {
        const plan = createRemoteProjectEditorPlan(
            [
                createCandidate('Client', createStableResolution('4.4')),
                createCandidate(
                    'Server',
                    createStableResolution('4.3', 'dotnet'),
                ),
            ],
            [createRelease('4.4.3-stable'), createRelease('4.3.2-stable')],
            [],
        );

        expect(plan.map(({ version, mono }) => ({ version, mono }))).toEqual([
            { version: '4.4.3-stable', mono: false },
            { version: '4.3.2-stable', mono: true },
        ]);
    });

    it('uses a common fallback when no matching download is available', () => {
        const fallback = {
            version: '4.4.2-stable',
            mono: false,
        } as InstalledRelease;
        const result: AddProjectToListResult = {
            success: false,
            editorResolution: {
                requested: {
                    kind: 'exact',
                    channel: 'official',
                    flavor: 'gdscript',
                    base_version: '4.4',
                    version: '4.4.1-stable',
                },
                fallback,
                downloadable: {
                    match: 'exact',
                    version: '4.4.1-stable',
                    flavor: 'gdscript',
                    prerelease: false,
                },
            },
        };

        const [group] = createRemoteProjectEditorPlan(
            [createCandidate('Client', result)],
            [],
            [],
        );

        expect(group.choice).toBe('use-fallback');
        expect(group.fallback).toBe(fallback);
    });

    it('adds unsupported requests as missing when no fallback exists', () => {
        const [group] = createRemoteProjectEditorPlan(
            [
                createCandidate('Custom', {
                    success: false,
                    editorResolution: {
                        requested: {
                            kind: 'exact',
                            channel: 'custom',
                            flavor: 'gdscript',
                            base_version: '4.4',
                            version: 'team-build',
                        },
                    },
                }),
            ],
            [],
            [],
        );

        expect(group).toMatchObject({
            version: 'team-build',
            choice: 'add-missing',
            downloadableRelease: undefined,
            fallback: undefined,
        });
    });

    it('does not offer catalogue downloads for custom editor requests', () => {
        const [group] = createRemoteProjectEditorPlan(
            [
                createCandidate('Custom', {
                    success: false,
                    editorResolution: {
                        requested: {
                            kind: 'exact',
                            channel: 'custom',
                            flavor: 'gdscript',
                            base_version: '4.4',
                            version: '4.4.3-stable',
                        },
                        downloadable: {
                            match: 'exact',
                            version: '4.4.3-stable',
                            flavor: 'gdscript',
                            prerelease: false,
                        },
                    },
                }),
            ],
            [createRelease('4.4.3-stable')],
            [],
        );

        expect(group).toMatchObject({
            choice: 'add-missing',
            downloadableRelease: undefined,
        });
    });
});
