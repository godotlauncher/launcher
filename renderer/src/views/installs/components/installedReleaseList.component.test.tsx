import type {
    InstalledRelease,
    ReleaseInstallProgress,
} from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstalledReleaseList } from './installedReleaseList.component.tsx';

let installProgress: ReleaseInstallProgress | undefined;

vi.mock('../../../hooks/useRelease', () => ({
    useRelease: () => ({
        getReleaseInstallProgress: vi.fn(() => installProgress),
    }),
}));

describe('InstalledReleaseList', () => {
    beforeEach(() => {
        installProgress = undefined;
    });

    it('groups editors and uses icon markers for custom prereleases', () => {
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
        expect(html).toContain('lucide-user-round');
        expect(html).toContain('aria-label="Custom"');
        expect(html).toContain('lucide-flask-conical');
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
});

/**
 * Renders installed editors with focused test labels.
 *
 * @param rows - The installed editors to render.
 * @returns The rendered installed editor list.
 */
function renderList(rows: InstalledRelease[]): string {
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
    };

    return renderToStaticMarkup(
        <InstalledReleaseList
            rows={rows}
            t={(key, options) =>
                labels[options?.ns ? `${options.ns}:${key}` : key] ?? key
            }
            isReleaseActionBusy={vi.fn(() => false)}
            onRetry={vi.fn()}
            onReinstall={vi.fn()}
            onRemove={vi.fn()}
            onOpenReleaseMoreOptions={vi.fn()}
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
