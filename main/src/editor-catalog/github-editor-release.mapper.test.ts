import { describe, expect, it } from 'vitest';
import type { GithubEditorRelease } from './editor-catalog.types.js';
import {
    mapGithubEditorRelease,
    parseEditorVersion,
} from './github-editor-release.mapper.js';

describe('github editor release mapper', () => {
    it('groups supported assets by flavor and target', () => {
        const release = mapGithubEditorRelease(
            'official-stable',
            false,
            createGithubRelease(),
        );

        expect(release).toMatchObject({
            id: 'official-stable:4.5-stable',
            baseVersion: '4.5',
            prerelease: false,
            versionParts: {
                major: 4,
                minor: 5,
                patch: 0,
                channel: 'stable',
                iteration: 0,
            },
        });
        expect(release?.variants).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    flavor: 'gdscript',
                    assets: expect.arrayContaining([
                        expect.objectContaining({
                            platform: 'win32',
                            architecture: 'x64',
                        }),
                        expect.objectContaining({
                            platform: 'darwin',
                            architecture: 'arm64',
                        }),
                    ]),
                }),
                expect.objectContaining({
                    flavor: 'dotnet',
                    assets: [
                        expect.objectContaining({
                            platform: 'linux',
                            architecture: 'x64',
                        }),
                    ],
                }),
            ]),
        );
    });

    it('rejects old, invalid, draft, and assetless releases', () => {
        const base = createGithubRelease();

        expect(
            mapGithubEditorRelease('official-stable', false, {
                ...base,
                tagName: '3.6-stable',
            }),
        ).toBeNull();
        expect(
            mapGithubEditorRelease('official-stable', false, {
                ...base,
                draft: true,
            }),
        ).toBeNull();
        expect(
            mapGithubEditorRelease('official-stable', false, {
                ...base,
                assets: [],
            }),
        ).toBeNull();
    });

    it('parses supported release channels', () => {
        expect(parseEditorVersion('v4.6-rc2')).toEqual({
            major: 4,
            minor: 6,
            patch: 0,
            channel: 'rc',
            iteration: 2,
        });
        expect(parseEditorVersion('not-a-version')).toBeNull();
    });
});

function createGithubRelease(): GithubEditorRelease {
    return {
        id: 45,
        name: 'Godot 4.5',
        tagName: '4.5-stable',
        publishedAt: '2026-01-01T00:00:00.000Z',
        draft: false,
        prerelease: false,
        assets: [
            {
                id: 1,
                name: 'Godot_v4.5-stable_win64.exe.zip',
                browserDownloadUrl: 'https://example.com/windows.zip',
            },
            {
                id: 2,
                name: 'Godot_v4.5-stable_macos.universal.zip',
                browserDownloadUrl: 'https://example.com/macos.zip',
            },
            {
                id: 3,
                name: 'Godot_v4.5-stable_mono_linux.x86_64.zip',
                browserDownloadUrl: 'https://example.com/linux-dotnet.zip',
            },
            {
                id: 4,
                name: 'Godot_v4.5-stable_web_editor.zip',
                browserDownloadUrl: 'https://example.com/web.zip',
            },
        ],
    };
}
