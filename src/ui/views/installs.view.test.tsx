import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { InstallsView } from './installs.view';

const addAlert = vi.fn();

vi.mock('../hooks/useAlerts', () => ({
    useAlerts: () => ({
        addAlert,
        clearAlerts: vi.fn(),
        closeAlert: vi.fn(),
        addConfirm: vi.fn(),
        addCustomConfirm: vi.fn(),
    }),
}));

vi.mock('../hooks/useRelease', () => {
    const installedReleases: InstalledRelease[] = [
        {
            version: '4.2.0',
            version_number: 40200,
            install_path: '/Volumes/Encrypted/Godot4',
            editor_path: '/Volumes/Encrypted/Godot4/Godot',
            platform: 'darwin',
            arch: 'arm64',
            mono: false,
            prerelease: false,
            config_version: 5,
            published_at: '2024-01-01T00:00:00Z',
            valid: false,
        },
    ];

    return {
        useRelease: () => ({
            installedReleases,
            downloadingReleases: [],
            showReleaseMenu: vi.fn(),
            checkAllReleasesValid: vi.fn(),
            removeRelease: vi.fn(),
            loading: true,
        }),
    };
});

vi.mock('react-i18next', () => {
    const dictionary: Record<string, string> = {
        'installs:title': 'Editor Installs',
        'installs:buttons.install': 'Install Editor',
        'installs:search.placeholder': 'Search',
        'installs:table.name': 'Name',
        'installs:status.installing': 'Installing...',
        'installs:status.unavailable': 'Unavailable',
        'installs:messages.unavailableHint':
            'The editor path is not accessible. Mount the storage device and retry, or uninstall the release.',
        'installs:badges.dotNet': '.NET',
        'installs:badges.prerelease': 'prerelease',
        'installs:messages.noReleasesCta': 'No releases installed yet.',
        'common:buttons.retry': 'Retry',
        'installs:buttons.uninstall': 'Uninstall',
    };

    return {
        useTranslation: (namespaces?: string[]) => ({
            t: (key: string, opts?: { ns?: string }) => {
                const namespace = opts?.ns ?? (Array.isArray(namespaces) ? namespaces[0] : namespaces);
                const dictKey = namespace ? `${namespace}:${key}` : key;
                return dictionary[dictKey] ?? key;
            },
        }),
        Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    };
});

describe('InstallsView', () => {
    it('renders unavailable release guidance with retry/remove actions', () => {
        const html = renderToStaticMarkup(<InstallsView />);

        expect(html).toContain('Unavailable');
        expect(html).toContain('The editor path is not accessible');
        expect(html).toContain('Retry');
        expect(html).toContain('Uninstall');
        expect(html).toContain('disabled');
        expect(html).toContain('loading-spinner');
    });
});
