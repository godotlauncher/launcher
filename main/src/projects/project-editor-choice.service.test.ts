import type { EditorCatalogRelease, InstalledRelease } from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { EditorCatalogService } from '../editor-catalog/editor-catalog.service.js';
import { ProjectEditorChoiceService } from './project-editor-choice.service.js';

const request = {
    kind: 'stable-base' as const,
    channel: 'official' as const,
    flavor: 'gdscript' as const,
    base_version: '4.4',
};

describe('ProjectEditorChoiceService', () => {
    it.each(['official', 'custom'] as const)(
        'rejects %s installed choices for a different platform or architecture',
        async (source) => {
            const service = createService([]);
            const installed = [
                createInstalledRelease('4.4.3-stable', {
                    source,
                    platform: process.platform === 'win32' ? 'linux' : 'win32',
                }),
                createInstalledRelease('4.4.4-stable', {
                    source,
                    arch: process.arch === 'arm64' ? 'x64' : 'arm64',
                }),
            ];

            await expect(
                service.getChoices(request, 5, installed),
            ).resolves.toEqual([]);
            for (const release of installed) {
                expect(
                    service.resolveInstalledChoice(
                        `installed:${source}:${release.version}:standard`,
                        request,
                        5,
                        installed,
                    ),
                ).toBeUndefined();
            }
        },
    );
    it('merges installed and downloadable stable patches and recommends newest', async () => {
        const service = createService([
            createCatalogueRelease('4.4.4-stable'),
            createCatalogueRelease('4.4.3-stable'),
        ]);
        const installed = [createInstalledRelease('4.4.3-stable')];

        const choices = await service.getChoices(request, 5, installed);

        expect(choices.map((choice) => choice.version)).toEqual([
            '4.4.4-stable',
            '4.4.3-stable',
        ]);
        expect(choices[0]).toMatchObject({
            installed: false,
            recommended: true,
        });
        expect(choices[1]).toMatchObject({
            installed: true,
            recommended: false,
        });
    });

    it('offers only the latest official prerelease when no stable exists', async () => {
        const service = createService([
            createCatalogueRelease('4.4-rc2', true),
            createCatalogueRelease('4.4-rc1', true),
        ]);

        const choices = await service.getChoices(request, 5, []);

        expect(choices.map((choice) => choice.version)).toEqual(['4.4-rc2']);
        expect(choices[0]?.recommended).toBe(true);
    });

    it('places compatible custom editors after official choices', async () => {
        const service = createService([createCatalogueRelease('4.4.4-stable')]);
        const custom = createInstalledRelease('4.4-custom.1', {
            name: 'Team build',
            source: 'custom',
            platform: process.platform,
            arch: process.arch,
        });

        const choices = await service.getChoices(request, 5, [custom]);

        expect(choices.at(-1)).toMatchObject({
            name: 'Team build',
            source: 'custom',
            installed: true,
        });
    });

    it('does not offer an official download over a colliding custom editor', async () => {
        const service = createService([createCatalogueRelease('4.4.4-stable')]);
        const custom = createInstalledRelease('4.4.4-stable', {
            name: 'Pinned team build',
            source: 'custom',
        });

        const choices = await service.getChoices(request, 5, [custom]);

        expect(choices).toHaveLength(1);
        expect(choices[0]).toMatchObject({
            name: 'Pinned team build',
            source: 'custom',
        });
    });
});

function createService(releases: EditorCatalogRelease[]) {
    const editorCatalog = {
        getCatalog: vi.fn().mockResolvedValue({ releases, providers: [] }),
    } as unknown as EditorCatalogService;
    return new ProjectEditorChoiceService(editorCatalog);
}

function createCatalogueRelease(
    version: string,
    prerelease = false,
): EditorCatalogRelease {
    const [major, minor, patch = '0'] = version.match(/\d+/g) ?? [];
    return {
        id: `official:${version}`,
        sourceReleaseId: version,
        providerId: prerelease ? 'official-prerelease' : 'official-stable',
        tag: version,
        version,
        baseVersion: `${major}.${minor}`,
        name: `Godot ${version}`,
        publishedAt: null,
        prerelease,
        versionParts: {
            major: Number(major),
            minor: Number(minor),
            patch: Number(patch),
            channel: prerelease ? 'rc' : 'stable',
            iteration: prerelease ? Number(patch) : 0,
        },
        variants: [
            {
                id: `${version}:gdscript`,
                flavor: 'gdscript',
                assets: [
                    {
                        id: `${version}:asset`,
                        name: 'Godot.zip',
                        downloadUrl: 'https://example.invalid/Godot.zip',
                        platform: process.platform as 'darwin',
                        architecture: process.arch as 'arm64',
                    },
                ],
            },
        ],
    };
}

function createInstalledRelease(
    version: string,
    overrides: Partial<InstalledRelease> = {},
): InstalledRelease {
    return {
        version,
        base_version: '4.4',
        version_number: 4.4,
        install_path: '/editors/godot',
        editor_path: '/editors/godot/Godot',
        platform: process.platform,
        arch: process.arch,
        mono: false,
        prerelease: !version.includes('stable'),
        config_version: 5,
        published_at: null,
        valid: true,
        source: 'official',
        ...overrides,
    };
}
