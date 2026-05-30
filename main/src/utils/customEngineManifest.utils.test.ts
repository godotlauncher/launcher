import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    readFile: vi.fn(),
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    promises: {
        readFile: fsMocks.readFile,
    },
}));

vi.mock('node:os', () => ({
    platform: vi.fn(() => 'darwin'),
    arch: vi.fn(() => 'arm64'),
}));

import { parseCustomEngineManifest } from './customEngineManifest.utils.js';

const manifest = {
    schema_version: 1,
    version: '4.6-custom.1',
    name: 'Acme Godot 4.6 Custom Engine',
    base_version: '4.6',
    mono: false,
    config_version: 5,
    platforms: [
        {
            platform: 'macos',
            arch: 'arm64',
            paths: {
                editor: './Godot.app',
            },
        },
    ],
};

describe('parseCustomEngineManifest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readFile.mockResolvedValue(JSON.stringify(manifest));
    });

    it('parses a valid manifest into an installed custom release', async () => {
        const release = await parseCustomEngineManifest(
            '/engines/acme/godotlauncher-editor-manifest.json',
        );

        expect(release).toMatchObject({
            version: '4.6-custom.1',
            name: 'Acme Godot 4.6 Custom Engine',
            version_number: 4.6,
            install_path: '/engines/acme',
            editor_path: '/engines/acme/Godot.app',
            platform: 'darwin',
            arch: 'arm64',
            mono: false,
            prerelease: false,
            config_version: 5,
            source: 'custom',
            managed_by_launcher: false,
            valid: true,
        });
    });

    it('uses the manifest prerelease flag when provided', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({ ...manifest, prerelease: true }),
        );

        const release = await parseCustomEngineManifest(
            '/engines/acme/godotlauncher-editor-manifest.json',
        );

        expect(release.prerelease).toBe(true);
    });

    it('fails when required fields are missing', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({ ...manifest, name: undefined }),
        );

        await expect(
            parseCustomEngineManifest(
                '/engines/acme/godotlauncher-editor-manifest.json',
            ),
        ).rejects.toThrow('Invalid custom editor manifest');
    });

    it('fails when no platform entry matches the current platform', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({
                ...manifest,
                platforms: [
                    {
                        platform: 'windows',
                        arch: 'x64',
                        paths: { editor: './Godot.exe' },
                    },
                ],
            }),
        );

        await expect(
            parseCustomEngineManifest(
                '/engines/acme/godotlauncher-editor-manifest.json',
            ),
        ).rejects.toThrow('does not include a compatible platform');
    });

    it('fails when the resolved editor path does not exist', async () => {
        fsMocks.existsSync.mockReturnValue(false);

        await expect(
            parseCustomEngineManifest(
                '/engines/acme/godotlauncher-editor-manifest.json',
            ),
        ).rejects.toThrow('/engines/acme/Godot.app');
    });
});
