import type {
    InstalledRelease,
    ReleaseInstallProgress,
} from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstalledReleaseList } from './installed-release-list.component.tsx';

let installProgress: ReleaseInstallProgress | undefined;

vi.mock('../../../hooks/release.hook', () => ({
    useRelease: () => ({
        getReleaseInstallProgress: vi.fn(() => installProgress),
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) =>
            ({
                'progress.downloading': 'Downloading',
                'progress.cancelLabel': 'Cancel install',
            })[key] ?? key,
    }),
}));

describe('InstalledReleaseList', () => {
    beforeEach(() => {
        installProgress = undefined;
    });

    it('groups editors and labels custom prereleases', () => {
        const html = renderList([
            createInstalledRelease('4.7.1-stable', { mono: true }),
            createInstalledRelease('studio-build', {
                name: 'Acme 4.7 Custom Editor',
                base_version: '4.7',
                source: 'custom',
                prerelease: true,
            }),
        ]);

        expect(html).toContain('>4.7</h2>');
        expect(html).toContain('aria-label="Custom"');
        expect(html).toContain('aria-label="Prerelease"');
        expect(html).toContain('>.NET</span>');
        expect(html).not.toContain('<table');
        expect(html).not.toContain('badge-info');
    });

    it('keeps install progress inside its grouped row', () => {
        installProgress = {
            id: '4.7-stable:standard',
            version: '4.7-stable',
            mono: false,
            prerelease: false,
            published_at: '2026-06-18T00:00:00Z',
            stage: 'downloading',
            canCancel: true,
            percent: 55,
            receivedBytes: 55 * 1024 * 1024,
            totalBytes: 100 * 1024 * 1024,
        };

        const html = renderList([
            createInstalledRelease('4.7-stable', { install_path: '' }),
        ]);

        expect(html).toContain('Downloading');
        expect(html).toContain('55%');
        expect(html).toContain('55 MB / 100 MB');
    });

    it('exposes every valid official editor action directly', () => {
        const html = renderList([createInstalledRelease('4.7-stable')]);

        expect(html).toContain('aria-label="Open Installed Folder"');
        expect(html).toContain('aria-label="Start the Project Manager"');
        expect(html).toContain('aria-label="Delete Release from This Device"');
        expect(html).not.toContain('btnReleaseMoreOptions');
    });

    it('uses the custom-editor removal action for valid custom rows', () => {
        const html = renderList([
            createInstalledRelease('studio-build', {
                name: 'Studio Editor',
                source: 'custom',
            }),
        ]);

        expect(html).toContain('aria-label="Remove Custom Editor"');
        expect(html).not.toContain(
            'aria-label="Delete Release from This Device"',
        );
    });

    it('keeps recovery actions for invalid official and custom rows', () => {
        const html = renderList([
            createInstalledRelease('4.7-stable', { valid: false }),
            createInstalledRelease('studio-build', {
                name: 'Studio Editor',
                source: 'custom',
                valid: false,
            }),
        ]);

        expect(html).toContain('Editor unavailable.');
        expect(html).toContain('Custom editor unavailable.');
        expect(html.match(/aria-label="Retry"/g)).toHaveLength(2);
        expect(html.match(/aria-label="Reinstall"/g)).toHaveLength(1);
        expect(html.match(/aria-label="Remove"/g)).toHaveLength(2);
        expect(html.match(/btnOpenReleaseFolder/g)).toHaveLength(2);
        expect(html).not.toContain('btnStartProjectManager');
    });

    it('marks the whole editor row busy while removal is running', () => {
        const html = renderList([createInstalledRelease('4.7-stable')], true);

        expect(html).toContain('aria-busy="true"');
        expect(html).not.toContain('btnOpenReleaseFolder');
        expect(html).not.toContain('btnStartProjectManager');
        expect(html).not.toContain('btnRemoveRelease_4.7-stable_standard');
    });
});

/**
 * Renders installed editors with focused test labels.
 *
 * @param rows - The installed editors to render.
 * @param removing - Whether the first editor removal is active.
 * @returns The rendered installed editor list.
 */
function renderList(rows: InstalledRelease[], removing = false): string {
    const labels: Record<string, string> = {
        'groups.other': 'Other',
        'badges.custom': 'Custom',
        'badges.prerelease': 'Prerelease',
        'badges.dotNet': '.NET',
        'status.installing': 'Installing...',
        'messages.unavailableCustomEditorHint': 'Custom editor unavailable.',
        'messages.unavailableHintWithReinstall': 'Editor unavailable.',
        'common:buttons.retry': 'Retry',
        'common:buttons.reinstall': 'Reinstall',
        'common:buttons.remove': 'Remove',
        'menus:release.openInstalledFolder': 'Open Installed Folder',
        'menus:release.startProjectManager': 'Start the Project Manager',
        'menus:release.deleteRelease': 'Delete Release from This Device',
        'dialogs:removeCustomEditor.menuLabel': 'Remove Custom Editor',
    };

    return renderToStaticMarkup(
        <InstalledReleaseList
            rows={rows}
            t={(key, options) =>
                labels[options?.ns ? `${options.ns}:${key}` : key] ?? key
            }
            isReleaseActionBusy={vi.fn((_release, action) =>
                removing ? action === 'remove' : false,
            )}
            onRetry={vi.fn()}
            onReinstall={vi.fn()}
            onRemove={vi.fn()}
            onOpenInstalledFolder={vi.fn()}
            onStartProjectManager={vi.fn()}
        />,
    );
}

/**
 * Creates one installed editor for list tests.
 *
 * @param version - The editor version.
 * @param overrides - Values that change the default editor.
 * @returns One installed editor.
 */
function createInstalledRelease(
    version: string,
    overrides: Partial<InstalledRelease> = {},
): InstalledRelease {
    return {
        version,
        version_number: Number.parseFloat(version),
        install_path: `/Editors/${version}`,
        editor_path: `/Editors/${version}/Godot`,
        platform: 'darwin',
        arch: 'arm64',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: '2026-01-01T00:00:00Z',
        valid: true,
        source: 'official',
        ...overrides,
    };
}
