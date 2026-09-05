import type { InstalledRelease, ReleaseSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    getCreateProjectCatalogueVariants,
    getCreateProjectReleaseKey,
} from '../createProject.model';
import { CreateProjectEditorPicker } from './create-project-editor-picker.component';
import { CreateProjectEditorPickerPopover } from './create-project-editor-picker-popover.component';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, string | number>) =>
            ({
                'editorPicker.title': 'Godot editor',
                'editorPicker.installed': 'Installed',
                'editorPicker.browse': 'Browse releases',
                'editorPicker.search': 'Search versions',
                'editorPicker.clearSearch': 'Clear search',
                'editorPicker.channel': 'Release channel',
                'editorPicker.stable': 'Stable',
                'editorPicker.prereleases': 'Pre-releases',
                'editorPicker.downloadRequired': 'Download required',
                'editorPicker.standard': 'Standard',
                'editorPicker.custom': 'Custom',
                'editorPicker.selected': 'Selected',
                'editorPicker.unavailable': 'Unavailable',
                'editorPicker.noInstalled': 'No installed editors',
                'editorPicker.noneSelected': 'Choose an editor',
                'editorPicker.loading': 'Loading releases...',
                'editorPicker.noMatches': 'No matching releases',
                'editorPicker.loadFailed': "Couldn't load releases. Try again.",
                'editorPicker.refreshFailed':
                    "Couldn't refresh releases. Showing previously loaded releases.",
                'editorPicker.retry': 'Retry',
                'editorPicker.retrying': 'Retrying...',
                'project.dotNetBadge': '.NET',
                'project.prereleaseBadge': 'Pre-release',
                'progress.queuedPosition': `Queued #${options?.position}`,
                'progress.cancelLabel': 'Cancel editor install',
            })[key] ?? key,
    }),
}));

describe('CreateProjectEditorPicker', () => {
    it('accepts a contextual trigger identity and disabled state', () => {
        const html = renderToStaticMarkup(
            <CreateProjectEditorPicker
                open
                disabled
                triggerLabel="Godot Editor"
                installedReleases={[]}
                availableReleases={[]}
                availablePrereleases={[]}
                releaseInstallProgress={[]}
                loading={false}
                catalogueError={undefined}
                selection={null}
                onSelectionChange={vi.fn()}
                onCancelInstall={vi.fn()}
                onRetryCatalogue={vi.fn()}
            />,
        );

        expect(html).toContain('disabled=""');
        expect(html).toContain('aria-label="Godot Editor: Choose an editor"');
    });

    it('defaults to installed editors and retains custom editor labels', () => {
        const release = installedRelease('studio-godot', {
            name: 'Studio Godot',
            source: 'custom',
        });

        const html = renderToStaticMarkup(
            <CreateProjectEditorPicker
                open
                installedReleases={[release]}
                availableReleases={[]}
                availablePrereleases={[]}
                releaseInstallProgress={[]}
                loading={false}
                catalogueError={undefined}
                selection={{
                    source: 'installed',
                    key: getCreateProjectReleaseKey(release),
                    release,
                }}
                onSelectionChange={vi.fn()}
                onCancelInstall={vi.fn()}
                onRetryCatalogue={vi.fn()}
            />,
        );

        expect(html).toContain('popover="auto"');
        expect(html).toContain('aria-haspopup="dialog"');
        expect(html).toContain('aria-expanded="false"');
        expect(html).toMatch(
            /<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>Installed<\/button>/,
        );
        expect(html).toContain('Studio Godot');
        expect(html).toContain('Custom');
        expect(html).not.toContain('inputCreateProjectEditorSearch');
        expect(html).not.toContain('<fieldset');
    });

    it('does not repeat a version when an editor has no display name', () => {
        const release = installedRelease('4.7.2');

        const html = renderToStaticMarkup(
            <CreateProjectEditorPicker
                open
                installedReleases={[release]}
                availableReleases={[]}
                availablePrereleases={[]}
                releaseInstallProgress={[]}
                loading={false}
                catalogueError={undefined}
                selection={{
                    source: 'installed',
                    key: getCreateProjectReleaseKey(release),
                    release,
                }}
                onSelectionChange={vi.fn()}
                onCancelInstall={vi.fn()}
                onRetryCatalogue={vi.fn()}
            />,
        );

        expect(html).toContain('4.7.2 - Standard');
        expect(html).not.toContain('4.7.2 (4.7.2)');
    });

    it('defaults to Browse releases and renders every exact variant', () => {
        const releases = Array.from({ length: 7 }, (_, index) =>
            catalogueRelease(`4.${index + 1}-stable`),
        );

        const html = renderToStaticMarkup(
            <CreateProjectEditorPicker
                open
                installedReleases={[]}
                availableReleases={releases}
                availablePrereleases={[]}
                releaseInstallProgress={[]}
                loading={false}
                catalogueError={undefined}
                selection={null}
                onSelectionChange={vi.fn()}
                onCancelInstall={vi.fn()}
                onRetryCatalogue={vi.fn()}
            />,
        );

        expect(html).toMatch(
            /<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>Browse releases<\/button>/,
        );
        expect(html).toContain('placeholder="Search versions"');
        expect(html).toContain('>Stable<');
        expect(html).toContain('>Pre-releases<');
        expect(html.match(/Download required/g)).toHaveLength(14);
        expect(html).not.toContain('>Standard<');
        expect(html).toContain('>.NET<');
    });

    it.each(['stable', 'prerelease'] as const)(
        'labels major.minor groups in the %s list without changing exact variants',
        (channel) => {
            const suffix = channel === 'stable' ? 'stable' : 'beta1';
            const releases = ['4.9.1', '4.10.2', '4.10'].map((version) => ({
                ...catalogueRelease(`${version}-${suffix}`),
                prerelease: channel === 'prerelease',
            }));
            const html = renderToStaticMarkup(
                <CreateProjectEditorPickerPopover
                    id="picker"
                    labelledBy="editor"
                    popoverRef={{ current: null }}
                    style={{}}
                    open
                    tab="catalogue"
                    channel={channel}
                    search=""
                    installedRows={[]}
                    installedReleases={[]}
                    catalogueVariants={getCreateProjectCatalogueVariants(
                        releases,
                        '',
                    )}
                    releaseInstallProgress={[]}
                    loading={false}
                    catalogueError={undefined}
                    hasCachedCatalogueReleases
                    retryingCatalogue={false}
                    selection={null}
                    onTabChange={vi.fn()}
                    onChannelChange={vi.fn()}
                    onSearchChange={vi.fn()}
                    onSelectionChange={vi.fn()}
                    onCancelInstall={vi.fn()}
                    onRetryCatalogue={vi.fn()}
                    onKeyDown={vi.fn()}
                    registerInstalledOption={vi.fn()}
                />,
            );
            expect(html.match(/<fieldset/g)).toHaveLength(2);
            expect(html).toContain('<fieldset aria-label="4.10"');
            expect(html).toContain('<fieldset aria-label="4.9"');
            expect(html.match(/role="option"/g)).toHaveLength(6);
            expect(html).toContain(
                `createProjectCatalogueEditor_catalogue:4.10.2-${suffix}:std`,
            );
            expect(html).toContain(
                `createProjectCatalogueEditor_catalogue:4.10.2-${suffix}:mono`,
            );
        },
    );

    it('shows a retry action instead of no matches when the catalogue failed without cached releases', () => {
        const html = renderToStaticMarkup(
            <CreateProjectEditorPickerPopover
                id="picker"
                labelledBy="editor"
                popoverRef={{ current: null }}
                style={{}}
                open
                tab="catalogue"
                channel="stable"
                search=""
                installedRows={[]}
                installedReleases={[]}
                catalogueVariants={[]}
                releaseInstallProgress={[]}
                loading={false}
                catalogueError="Network unavailable"
                hasCachedCatalogueReleases={false}
                retryingCatalogue={false}
                selection={null}
                onTabChange={vi.fn()}
                onChannelChange={vi.fn()}
                onSearchChange={vi.fn()}
                onSelectionChange={vi.fn()}
                onCancelInstall={vi.fn()}
                onRetryCatalogue={vi.fn()}
                onKeyDown={vi.fn()}
                registerInstalledOption={vi.fn()}
            />,
        );

        expect(html).toContain('Couldn&#x27;t load releases. Try again.');
        expect(html).toContain('>Retry<');
        expect(html).not.toContain('No matching releases');
    });

    it('keeps cached releases visible when a catalogue refresh fails', () => {
        const release = catalogueRelease('4.8-stable');
        const html = renderToStaticMarkup(
            <CreateProjectEditorPickerPopover
                id="picker"
                labelledBy="editor"
                popoverRef={{ current: null }}
                style={{}}
                open
                tab="catalogue"
                channel="stable"
                search=""
                installedRows={[]}
                installedReleases={[]}
                catalogueVariants={getCreateProjectCatalogueVariants(
                    [release],
                    '',
                )}
                releaseInstallProgress={[]}
                loading={false}
                catalogueError="Network unavailable"
                hasCachedCatalogueReleases
                retryingCatalogue={false}
                selection={null}
                onTabChange={vi.fn()}
                onChannelChange={vi.fn()}
                onSearchChange={vi.fn()}
                onSelectionChange={vi.fn()}
                onCancelInstall={vi.fn()}
                onRetryCatalogue={vi.fn()}
                onKeyDown={vi.fn()}
                registerInstalledOption={vi.fn()}
            />,
        );

        expect(html).toContain(
            'Couldn&#x27;t refresh releases. Showing previously loaded releases.',
        );
        expect(html).toContain(
            `createProjectCatalogueEditor_catalogue:${release.version}:std`,
        );
    });

    it('disables catalogue retry while a retry is in progress', () => {
        const html = renderToStaticMarkup(
            <CreateProjectEditorPickerPopover
                id="picker"
                labelledBy="editor"
                popoverRef={{ current: null }}
                style={{}}
                open
                tab="catalogue"
                channel="stable"
                search=""
                installedRows={[]}
                installedReleases={[]}
                catalogueVariants={[]}
                releaseInstallProgress={[]}
                loading={false}
                catalogueError="Network unavailable"
                hasCachedCatalogueReleases={false}
                retryingCatalogue
                selection={null}
                onTabChange={vi.fn()}
                onChannelChange={vi.fn()}
                onSearchChange={vi.fn()}
                onSelectionChange={vi.fn()}
                onCancelInstall={vi.fn()}
                onRetryCatalogue={vi.fn()}
                onKeyDown={vi.fn()}
                registerInstalledOption={vi.fn()}
            />,
        );

        expect(html).toMatch(
            /<button[^>]*disabled=""[^>]*>Retrying...<\/button>/,
        );
        expect(html).toContain('>Retrying...<');
    });

    it('shows queue progress and the existing cancellation action', () => {
        const release = catalogueRelease('4.8-stable');
        const html = renderToStaticMarkup(
            <CreateProjectEditorPicker
                open
                installedReleases={[]}
                availableReleases={[release]}
                availablePrereleases={[]}
                releaseInstallProgress={[
                    {
                        id: 'install-job',
                        version: release.version,
                        mono: false,
                        prerelease: false,
                        published_at: release.published_at,
                        stage: 'queued',
                        canCancel: true,
                        queuePosition: 2,
                    },
                ]}
                loading={false}
                catalogueError={undefined}
                selection={{
                    source: 'catalogue',
                    key: `catalogue:${release.version}:std`,
                    release,
                    mono: false,
                }}
                onSelectionChange={vi.fn()}
                onCancelInstall={vi.fn()}
                onRetryCatalogue={vi.fn()}
            />,
        );

        expect(html).toContain('Queued #2');
        expect(html).toContain('aria-label="Cancel editor install"');
    });
});

/**
 * Creates an installed editor for picker rendering tests.
 *
 * @param version - Installed editor version.
 * @param overrides - Optional installed editor fields.
 * @returns A valid installed editor.
 */
function installedRelease(
    version: string,
    overrides: Partial<InstalledRelease> = {},
): InstalledRelease {
    return {
        version,
        version_number: Number.parseFloat(version),
        install_path: `/Godot/${version}`,
        editor_path: `/Godot/${version}/Godot`,
        platform: 'linux',
        arch: 'x64',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: null,
        valid: true,
        ...overrides,
    };
}

/**
 * Creates a catalogue release with Standard and .NET assets.
 *
 * @param version - Catalogue editor version.
 * @returns A release with both exact variants.
 */
function catalogueRelease(version: string): ReleaseSummary {
    return {
        version,
        version_number: Number.parseFloat(version),
        name: `Godot ${version}`,
        published_at: '2026-01-01T00:00:00.000Z',
        draft: false,
        prerelease: false,
        tag: version,
        assets: [
            {
                name: 'standard.zip',
                download_url: 'https://example.com/standard.zip',
                platform_tags: ['linux', 'x64'],
                mono: false,
            },
            {
                name: 'dotnet.zip',
                download_url: 'https://example.com/dotnet.zip',
                platform_tags: ['linux', 'x64'],
                mono: true,
            },
        ],
    };
}
