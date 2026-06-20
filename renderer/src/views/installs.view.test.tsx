import type { InstalledRelease } from '@shared';
import type React from 'react';
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
            checkAllReleasesValid: vi.fn(() =>
                Promise.resolve(installedReleases),
            ),
            reinstallRelease: vi.fn(() =>
                Promise.resolve({ success: true, version: '4.2.0' }),
            ),
            removeRelease: vi.fn(),
            loading: true,
        }),
    };
});

vi.mock('react-i18next', () => {
    const dictionary: Record<string, string> = {
        'installs:title': 'Editor Installs',
        'installs:buttons.install': 'Install Editor',
        'installs:buttons.addCustomEditor': 'Add Custom Editor',
        'installs:buttons.selectCustomEditorManifest': 'Select manifest file',
        'installs:buttons.createCustomEditorManifest':
            'Create custom editor manifest',
        'installs:search.placeholder': 'Search',
        'installs:table.name': 'Name',
        'installs:status.installing': 'Installing...',
        'installs:status.unavailable': 'Unavailable',
        'installs:messages.unavailableHint':
            'The editor path is not accessible. Mount the storage device and retry, or remove the release.',
        'installs:messages.unavailableHintWithReinstall':
            'The editor path is not accessible. Mount the storage device and retry, reinstall the editor, or remove this entry.',
        'installs:badges.dotNet': '.NET',
        'installs:badges.prerelease': 'prerelease',
        'installs:messages.noReleasesCta': 'No releases installed yet.',
        'installs:customEditor.waitingForDialog': 'Waiting for dialog...',
        'common:buttons.retry': 'Retry',
        'common:buttons.reinstall': 'Reinstall',
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
        Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    };
});

describe('InstallsView', () => {
    it('renders unavailable release guidance with retry/reinstall/remove actions', () => {
        const html = renderToStaticMarkup(<InstallsView />);

        expect(html).toContain('reinstall the editor');
        expect(html).toContain('Retry');
        expect(html).toContain('Reinstall');
        expect(html).toContain('Remove');
        expect(html).toContain('Add Custom Editor');
        expect(html).toContain('Select manifest file');
        expect(html).toContain('Create custom editor manifest');
        expect(html).toContain('btn-primary');
        expect(html).toContain('btn-error');
    });
});
