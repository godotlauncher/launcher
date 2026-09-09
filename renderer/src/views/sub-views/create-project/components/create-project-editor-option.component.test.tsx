import type {
    InstalledRelease,
    ReleaseInstallProgress,
    ReleaseSummary,
} from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectEditorOption } from './create-project-editor-option.component';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, string | number>) =>
            ({
                'progress.queuedPosition': `Queued #${options?.position}`,
                'progress.cancelLabel': 'Cancel editor install',
            })[key] ?? key,
    }),
}));

const labels = {
    standard: 'Standard',
    dotNet: '.NET',
    prerelease: 'Pre-release',
    custom: 'Custom',
    installed: 'Installed',
    selected: 'Selected',
    unavailable: 'Unavailable',
    downloadRequired: 'Download required',
};

describe('CreateProjectEditorOption', () => {
    it('renders exact installed variant, custom, and unavailable states', () => {
        const html = renderToStaticMarkup(
            <CreateProjectEditorOption
                kind="installed"
                release={installedRelease({
                    mono: true,
                    prerelease: true,
                    source: 'custom',
                    valid: false,
                })}
                optionKey="4.8-beta.1:mono"
                selected={false}
                labels={labels}
                onSelect={vi.fn()}
            />,
        );

        expect(html).toContain('>.NET<');
        expect(html).toContain('aria-label="Pre-release"');
        expect(html).toContain('aria-label="Custom"');
        expect(html).toContain('>Unavailable<');
        expect(html).toContain('disabled=""');
    });

    it('distinguishes installed and download-required catalogue variants', () => {
        const release = catalogueRelease();
        const installedHtml = renderToStaticMarkup(
            <CreateProjectEditorOption
                kind="catalogue"
                release={release}
                mono={false}
                optionKey="catalogue:4.8-stable:std"
                selected
                installedRelease={installedRelease()}
                labels={labels}
                onSelect={vi.fn()}
                onCancelInstall={vi.fn()}
            />,
        );
        const downloadHtml = renderToStaticMarkup(
            <CreateProjectEditorOption
                kind="catalogue"
                release={release}
                mono
                optionKey="catalogue:4.8-stable:mono"
                selected={false}
                labels={labels}
                onSelect={vi.fn()}
                onCancelInstall={vi.fn()}
            />,
        );

        expect(installedHtml).toContain('>Installed<');
        expect(installedHtml).toContain('aria-selected="true"');
        expect(downloadHtml).toContain('>.NET<');
        expect(downloadHtml).toContain('>Download required<');
    });

    it('places the .NET label beside the editor name without repeating it', () => {
        const html = renderToStaticMarkup(
            <CreateProjectEditorOption
                kind="catalogue"
                release={catalogueRelease()}
                mono
                optionKey="catalogue:4.8-stable:mono"
                selected={false}
                labels={labels}
                onSelect={vi.fn()}
                onCancelInstall={vi.fn()}
            />,
        );

        expect(html.match(/>\.NET</g)).toHaveLength(1);
        expect(html).not.toContain('>Standard<');
    });

    it('keeps install progress and cancellation visible in the option', () => {
        const progress: ReleaseInstallProgress = {
            id: 'install-job',
            version: '4.8-stable',
            mono: false,
            prerelease: false,
            published_at: '2026-01-01T00:00:00.000Z',
            stage: 'queued',
            canCancel: true,
            queuePosition: 2,
        };
        const html = renderToStaticMarkup(
            <CreateProjectEditorOption
                kind="catalogue"
                release={catalogueRelease()}
                mono={false}
                optionKey="catalogue:4.8-stable:std"
                selected
                progress={progress}
                labels={labels}
                onSelect={vi.fn()}
                onCancelInstall={vi.fn()}
            />,
        );

        expect(html).toContain('Queued #2');
        expect(html).toContain('aria-label="Cancel editor install"');
        expect(html).toContain('tabindex="0"');
    });
});

/**
 * Creates an installed editor option fixture.
 *
 * @param overrides - Optional fields to replace on the fixture.
 * @returns A valid installed Standard editor by default.
 */
function installedRelease(
    overrides: Partial<InstalledRelease> = {},
): InstalledRelease {
    return {
        version: '4.8-stable',
        version_number: 4.8,
        name: 'Godot 4.8',
        install_path: '/Godot/4.8',
        editor_path: '/Godot/4.8/Godot',
        platform: 'linux',
        arch: 'x64',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: '2026-01-01T00:00:00.000Z',
        valid: true,
        ...overrides,
    };
}

/**
 * Creates a catalogue release option fixture.
 *
 * @returns A release with Standard and .NET assets.
 */
function catalogueRelease(): ReleaseSummary {
    return {
        version: '4.8-stable',
        version_number: 4.8,
        name: 'Godot 4.8',
        published_at: '2026-01-01T00:00:00.000Z',
        draft: false,
        prerelease: false,
        tag: '4.8-stable',
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
