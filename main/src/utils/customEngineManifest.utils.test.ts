import path from 'node:path';
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
    flavor: 'gdscript',
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
    const manifestPath = path.resolve(
        '/engines/acme/godotlauncher-editor-manifest.json',
    );
    const installPath = path.resolve('/engines/acme');
    const editorPath = path.resolve('/engines/acme/Godot.app');

    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readFile.mockResolvedValue(JSON.stringify(manifest));
    });

    it('parses a valid manifest into an installed custom release', async () => {
        const release = await parseCustomEngineManifest(manifestPath);

        expect(release).toMatchObject({
            version: '4.6-custom.1',
            name: 'Acme Godot 4.6 Custom Engine',
            base_version: '4.6',
            version_number: 4.6,
            install_path: installPath,
            editor_path: editorPath,
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

    it('maps dotnet flavor to mono releases', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({ ...manifest, flavor: 'dotnet' }),
        );

        const release = await parseCustomEngineManifest(manifestPath);

        expect(release.mono).toBe(true);
        expect(release.flavor).toBe('dotnet');
    });

    it('preserves custom flavors as non-mono releases', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({ ...manifest, flavor: 'steam' }),
        );

        const release = await parseCustomEngineManifest(manifestPath);

        expect(release.mono).toBe(false);
        expect(release.flavor).toBe('steam');
    });

    it('uses the manifest prerelease flag when provided', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({ ...manifest, prerelease: true }),
        );

        const release = await parseCustomEngineManifest(manifestPath);

        expect(release.prerelease).toBe(true);
    });

    it('matches universal platform entries', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({
                ...manifest,
                platforms: [{ ...manifest.platforms[0], arch: 'universal' }],
            }),
        );

        const release = await parseCustomEngineManifest(manifestPath);

        expect(release.editor_path).toBe(editorPath);
        expect(release.arch).toBe('arm64');
    });

    it('fails when required fields are missing', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({ ...manifest, name: undefined }),
        );

        await expect(parseCustomEngineManifest(manifestPath)).rejects.toThrow(
            'Invalid custom editor manifest',
        );
    });

    it('fails when flavor is missing or empty', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({ ...manifest, flavor: undefined }),
        );

        await expect(parseCustomEngineManifest(manifestPath)).rejects.toThrow(
            'Invalid custom editor manifest',
        );

        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({ ...manifest, flavor: '' }),
        );

        await expect(parseCustomEngineManifest(manifestPath)).rejects.toThrow(
            'Invalid custom editor manifest',
        );
    });

    it('fails when base_version includes a patch version', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({ ...manifest, base_version: '4.6.1' }),
        );

        await expect(parseCustomEngineManifest(manifestPath)).rejects.toThrow(
            'Invalid custom editor manifest',
        );
    });

    it('fails when config_version is not 5', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({ ...manifest, config_version: 4 }),
        );

        await expect(parseCustomEngineManifest(manifestPath)).rejects.toThrow(
            'Invalid custom editor manifest',
        );
    });

    it('fails when arch is not x64, arm64, or universal', async () => {
        fsMocks.readFile.mockResolvedValue(
            JSON.stringify({
                ...manifest,
                platforms: [
                    {
                        platform: 'macos',
                        arch: 'ia32',
                        paths: { editor: './Godot.app' },
                    },
                ],
            }),
        );

        await expect(parseCustomEngineManifest(manifestPath)).rejects.toThrow(
            'Invalid custom editor manifest',
        );
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

        await expect(parseCustomEngineManifest(manifestPath)).rejects.toThrow(
            'does not include a compatible platform',
        );
    });

    it('fails when the resolved editor path does not exist', async () => {
        fsMocks.existsSync.mockReturnValue(false);

        await expect(parseCustomEngineManifest(manifestPath)).rejects.toThrow(
            editorPath,
        );
    });
});
