import type { ReleaseInstallProgress, ReleaseSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InstallEditorVariantAction } from './install-editor-variant-action.component.tsx';

let installProgress: ReleaseInstallProgress | undefined;

vi.mock('../../../hooks/useRelease.tsx', () => ({
    useRelease: () => ({
        cancelInstall: vi.fn(),
        getInstalledRelease: vi.fn(() => undefined),
        getReleaseInstallProgress: vi.fn(() => installProgress),
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { version?: string; flavor?: string }) => {
            const value =
                {
                    'table.gdscript': 'Standard',
                    'table.dotnet': '.NET',
                    'table.tooltips.downloadGDScript':
                        'Install Godot {{version}} Standard',
                    'table.tooltips.downloadDotNet':
                        'Install Godot {{version}} .NET',
                    'table.tooltips.installingVariant':
                        'Installing Godot {{version}} {{flavor}}',
                    'progress.downloading': 'Downloading',
                    'progress.cancelLabel': 'Cancel install',
                }[key] ?? key;

            return value
                .replace('{{version}}', options?.version ?? '')
                .replace('{{flavor}}', options?.flavor ?? '');
        },
    }),
}));

describe('InstallEditorVariantAction', () => {
    it('uses the official Standard and .NET build names without brackets', () => {
        installProgress = undefined;

        const standardHtml = renderVariant(false);
        const dotNetHtml = renderVariant(true);

        expect(standardHtml).toContain('>Standard</span>');
        expect(dotNetHtml).toContain('>.NET</span>');
        expect(standardHtml).toContain('data-tooltip-trigger');
        expect(standardHtml).not.toContain('title=');
        expect(standardHtml).not.toContain('(GDScript)');
        expect(dotNetHtml).not.toContain('(.NET)');
    });

    it('shows the shared progress indicator while installation is active', () => {
        installProgress = {
            id: '4.7-stable:standard',
            version: '4.7-stable',
            mono: false,
            prerelease: false,
            published_at: '2026-06-18T00:00:00Z',
            stage: 'downloading',
            canCancel: true,
            percent: 55,
        };

        const html = renderVariant(false);

        expect(html).toContain('Downloading');
        expect(html).toContain('55%');
        expect(html).toContain('<progress');
        expect(html).toContain(
            'aria-label="Installing Godot 4.7-stable Standard"',
        );
        expect(html).toContain('role="status"');
        expect(html).toContain('installProgress4.7-stable');
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain('aria-label="Cancel install"');
        expect(html).not.toContain('loading-spinner');
    });
});

/**
 * Renders one editor variant action for a focused test.
 *
 * @param mono - Whether to render the .NET variant.
 * @returns The rendered variant action.
 */
function renderVariant(mono: boolean): string {
    return renderToStaticMarkup(
        <InstallEditorVariantAction
            release={createRelease()}
            mono={mono}
            onInstall={vi.fn(async () => undefined)}
            onReinstall={vi.fn(async () => undefined)}
        />,
    );
}

/**
 * Creates a release with Standard and .NET assets.
 *
 * @returns A release for variant action tests.
 */
function createRelease(): ReleaseSummary {
    return {
        version: '4.7-stable',
        version_number: 4.7,
        name: 'Godot 4.7 stable',
        published_at: '2026-06-18T00:00:00Z',
        draft: false,
        prerelease: false,
        assets: [
            {
                name: 'godot-standard.zip',
                download_url: 'https://example.com/godot-standard.zip',
                platform_tags: ['linux', 'x64'],
                mono: false,
            },
            {
                name: 'godot-dotnet.zip',
                download_url: 'https://example.com/godot-dotnet.zip',
                platform_tags: ['linux', 'x64'],
                mono: true,
            },
        ],
    };
}
