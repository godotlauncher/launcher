import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { InstalledRelease } from '../../types';

import { InstalledReleaseTable } from './installedReleasesTable';

vi.mock('react-i18next', () => {
    const dictionary: Record<string, string> = {
        'installEditor:table.status.unavailable': 'Unavailable',
        'installEditor:table.downloading': 'downloading...',
        'installEditor:table.dotnet': '(.NET)',
        'installEditor:table.tooltips.installed': 'Installed',
        'installEditor:table.tooltips.installedDotNet': 'Installed (.NET)',
        'common:buttons.retry': 'Retry',
        'common:buttons.remove': 'Remove',
    };

    return {
        useTranslation: (namespaces?: string[]) => ({
            t: (key: string, opts?: { ns?: string }) => {
                const namespace =
                    opts?.ns ??
                    (Array.isArray(namespaces) ? namespaces[0] : namespaces);
                const dictKey = namespace ? `${namespace}:${key}` : key;
                return dictionary[dictKey] ?? key;
            },
        }),
    };
});

const releaseDefaults: InstalledRelease = {
    version: '4.2.0',
    version_number: 40200,
    install_path: '/Applications/Godot',
    editor_path: '/Applications/Godot/Godot',
    platform: 'darwin',
    arch: 'arm64',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: '2024-01-01T00:00:00Z',
    valid: true,
};

describe('InstalledReleaseTable', () => {
    it('renders unavailable rows with retry/remove actions', () => {
        const html = renderToStaticMarkup(
            <InstalledReleaseTable
                releases={[
                    {
                        ...releaseDefaults,
                        version: '4.1.0',
                        valid: false,
                    },
                ]}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                loading={false}
            />,
        );

        expect(html).toContain('Unavailable');
        expect(html).toContain('Retry');
        expect(html).toContain('Remove');
    });

    it('does not show unavailable label for valid releases', () => {
        const html = renderToStaticMarkup(
            <InstalledReleaseTable
                releases={[releaseDefaults]}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                loading={false}
            />,
        );

        expect(html).not.toContain('Unavailable');
    });

    it('disables retry/remove buttons while loading', () => {
        const html = renderToStaticMarkup(
            <InstalledReleaseTable
                releases={[
                    {
                        ...releaseDefaults,
                        valid: false,
                    },
                ]}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                loading={true}
            />,
        );

        expect(html).toContain('disabled');
        expect(html).toContain('loading-spinner');
    });
});
