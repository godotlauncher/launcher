import type { InstalledRelease, ReleaseSummary } from '@shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InstallReleaseTable } from './installReleaseTable';

const invalidRelease: InstalledRelease = {
    version: '4.2.0',
    version_number: 40200,
    install_path: '/missing/Godot',
    editor_path: '/missing/Godot/Godot',
    platform: 'darwin',
    arch: 'arm64',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: '2024-01-01T00:00:00Z',
    valid: false,
};

let downloadingStandardRelease = false;

vi.mock('../hooks/useRelease', () => ({
    useRelease: () => ({
        getInstalledRelease: (version: string, mono: boolean) =>
            version === invalidRelease.version && mono === invalidRelease.mono
                ? invalidRelease
                : undefined,
        isDownloadingRelease: vi.fn(
            (version: string, mono: boolean) =>
                downloadingStandardRelease &&
                version === invalidRelease.version &&
                mono === invalidRelease.mono,
        ),
    }),
}));

vi.mock('react-i18next', () => {
    const dictionary: Record<string, string> = {
        'installEditor:table.headers.version': 'Version',
        'installEditor:table.headers.released': 'Released',
        'installEditor:table.headers.download': 'Download',
        'installEditor:table.gdscript': '(GDScript)',
        'installEditor:table.dotnet': '(.NET)',
        'installEditor:table.installing': 'Installing...',
        'installEditor:table.status.unavailable': 'Unavailable',
        'installEditor:table.tooltips.installedGDScript':
            'Installed - {{version}} (GDScript)',
        'installEditor:table.tooltips.installedDotNet':
            'Installed - {{version}} .NET',
        'installEditor:table.tooltips.downloadGDScript':
            'Download {{version}} (GDScript)',
        'installEditor:table.tooltips.downloadDotNet':
            'Download {{version}} .NET',
        'installEditor:table.tooltips.reinstallGDScript':
            'Reinstall {{version}} (GDScript)',
        'installEditor:table.tooltips.reinstallDotNet':
            'Reinstall {{version}} .NET',
        'common:buttons.reinstall': 'Reinstall',
    };

    return {
        useTranslation: (namespaces?: string[]) => ({
            t: (key: string, opts?: { ns?: string; version?: string }) => {
                const namespace =
                    opts?.ns ??
                    (Array.isArray(namespaces) ? namespaces[0] : namespaces);
                const dictKey = namespace ? `${namespace}:${key}` : key;
                const value = dictionary[dictKey] ?? key;
                return opts?.version
                    ? value.replace('{{version}}', opts.version)
                    : value;
            },
        }),
    };
});

const releaseSummary: ReleaseSummary = {
    version: '4.2.0',
    version_number: 40200,
    name: 'Godot 4.2.0',
    published_at: '2024-01-01T00:00:00Z',
    draft: false,
    prerelease: false,
    assets: [],
};

describe('InstallReleaseTable', () => {
    it('shows warning reinstall action for invalid installed releases instead of download', () => {
        downloadingStandardRelease = false;
        const html = renderToStaticMarkup(
            <InstallReleaseTable
                releases={[releaseSummary]}
                onInstall={vi.fn()}
                onReinstall={vi.fn()}
            />,
        );

        expect(html).toContain('Reinstall');
        expect(html).toContain('text-warning');
        expect(html).toContain('Reinstall 4.2.0 (GDScript)');
        expect(html).not.toContain('Unavailable');
        expect(html).not.toContain('Download 4.2.0 (GDScript)');
    });

    it('shows installing state when reinstall is in progress', () => {
        downloadingStandardRelease = true;
        const html = renderToStaticMarkup(
            <InstallReleaseTable
                releases={[releaseSummary]}
                onInstall={vi.fn()}
                onReinstall={vi.fn()}
            />,
        );

        expect(html).toContain('Installing...');
        expect(html).toContain('loading-ring');
        expect(html).not.toContain('Reinstall');
    });
});
