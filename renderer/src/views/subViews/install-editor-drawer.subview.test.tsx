import type { ReleaseSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InstallEditorDrawer } from './install-editor-drawer.subview.tsx';

const stableReleases = [
    createRelease('4.6-stable'),
    createRelease('4.5.1-stable'),
    createRelease('4.5-stable'),
    createRelease('4.4.2-stable'),
];

vi.mock('../../hooks/usePreferences.tsx', () => ({
    usePreferences: () => ({
        preferences: { install_location: '/Editors/Godot' },
    }),
}));

vi.mock('../../hooks/useAlerts.tsx', () => ({
    useAlerts: () => ({ addAlert: vi.fn() }),
}));

vi.mock('../../hooks/useRelease.tsx', () => ({
    useRelease: () => ({
        availableReleases: stableReleases,
        availablePrereleases: [createRelease('4.7-beta1', true)],
        loading: false,
        hasError: undefined,
        refreshAvailableReleases: vi.fn(async () => undefined),
        installRelease: vi.fn(async (release: ReleaseSummary) => ({
            success: true,
            version: release.version,
        })),
        reinstallRelease: vi.fn(async () => ({
            success: true,
            version: '4.6-stable',
        })),
        getInstalledRelease: vi.fn(() => undefined),
        getReleaseInstallProgress: vi.fn(() => undefined),
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) =>
            ({
                title: 'Install Godot Editor',
                'search.placeholder': 'Search',
                'filters.show': 'Show',
                'filters.latest': 'Latest',
                'filters.all': 'All',
                'filters.channel': 'Channel',
                'filters.stable': 'Stable',
                'tabs.prerelease': 'Prerelease',
                'buttons.reload': 'Reload release list',
                'catalog.loading': 'Loading editor versions...',
                'catalog.empty': 'No editor versions found.',
                'catalog.latestStableRelease': 'Latest stable release',
                'catalog.latestPrerelease': 'Latest prerelease',
                'catalog.olderReleases': 'Older releases',
                'table.gdscript': 'Standard',
                'table.dotnet': '.NET',
                'table.tooltips.downloadGDScript': 'Install Standard',
                'table.tooltips.downloadDotNet': 'Install .NET',
                'errors.noPlatformAsset': 'No asset found',
                'common:buttons.copyPath': 'Copy path',
                'common:success': 'Copied',
                'menus:app.close': 'Close',
            })[key] ?? key,
    }),
}));

describe('InstallEditorDrawer', () => {
    it('renders the platform-style latest catalog in a 700px drawer', () => {
        const html = renderToStaticMarkup(
            <InstallEditorDrawer open onOpenChange={vi.fn()} />,
        );

        expect(html).toContain('role="dialog"');
        expect(html).toContain('width:700px');
        expect(html).toContain('Install Godot Editor');
        expect(html).toContain('/Editors/Godot');
        expect(html).toContain('Latest stable release');
        expect(html).toContain('Older releases');
        expect(html).toContain('Standard');
        expect(html).toContain('.NET');
        expect(html).not.toContain('(GDScript)');
        expect(html).not.toContain('(.NET)');
        expect(html).toContain('disabled=""');
        expect(html).toContain('btnCloseInstallEditor');
    });
});

/**
 * Creates a release for drawer rendering tests.
 *
 * @param version - The release version.
 * @param prerelease - Whether this is a prerelease.
 * @returns A release with both editor variants.
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
                name: `${version}-standard.zip`,
                download_url: 'https://example.com/standard.zip',
                platform_tags: ['linux', 'x64'],
                mono: false,
            },
            {
                name: `${version}-dotnet.zip`,
                download_url: 'https://example.com/dotnet.zip',
                platform_tags: ['linux', 'x64'],
                mono: true,
            },
        ],
    };
}
