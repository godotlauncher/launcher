import type { InstalledRelease } from '@shared/contracts';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InstallsView } from './installs.view';

const addAlert = vi.fn();
const releaseState = vi.hoisted(() => ({
    installedReleases: [] as InstalledRelease[],
    downloadingReleases: [] as Array<{
        version: string;
        mono: boolean;
        prerelease: boolean;
        published_at: string | null;
    }>,
    loading: false,
    hasError: undefined as string | undefined,
}));

vi.mock('../hooks/useAlerts', () => ({
    useAlerts: () => ({
        addAlert,
        clearAlerts: vi.fn(),
        closeAlert: vi.fn(),
        addConfirm: vi.fn(),
        addCustomConfirm: vi.fn(),
    }),
}));

vi.mock('../hooks/usePreferences', () => ({
    usePreferences: () => ({
        preferences: {
            install_location: '/Users/test/GodotEditors',
        },
    }),
}));

vi.mock('../hooks/useProjects', () => ({
    useProjects: () => ({ projects: [] }),
}));

vi.mock('../hooks/useRelease', () => {
    return {
        useRelease: () => ({
            availableReleases: [],
            availablePrereleases: [],
            installedReleases: releaseState.installedReleases,
            downloadingReleases: releaseState.downloadingReleases,
            releaseInstallProgress: [],
            getReleaseInstallProgress: vi.fn(() => undefined),
            getInstalledRelease: vi.fn(() => undefined),
            refreshAvailableReleases: vi.fn(() => Promise.resolve()),
            installRelease: vi.fn(() =>
                Promise.resolve({ success: true, version: '4.2.0' }),
            ),
            checkAllReleasesValid: vi.fn(() =>
                Promise.resolve(releaseState.installedReleases),
            ),
            reinstallRelease: vi.fn(() =>
                Promise.resolve({ success: true, version: '4.2.0' }),
            ),
            removeRelease: vi.fn(),
            loading: releaseState.loading,
            hasError: releaseState.hasError,
        }),
    };
});

vi.mock('react-i18next', () => {
    const dictionary: Record<string, string> = {
        'installs:title': 'Editor Installs',
        'installs:buttons.install': 'Install Editor',
        'installs:buttons.addCustomEditor': 'Custom Editor',
        'installs:buttons.selectCustomEditorManifest': 'Select manifest file',
        'installs:buttons.createCustomEditorManifest':
            'Create custom editor manifest',
        'installs:search.placeholder': 'Search',
        'installs:table.name': 'Name',
        'installs:groups.other': 'Other',
        'installs:status.installing': 'Installing...',
        'installs:status.unavailable': 'Unavailable',
        'installs:messages.unavailableHint':
            'The editor path is not accessible. Mount the storage device and retry, or remove the release.',
        'installs:messages.unavailableHintWithReinstall':
            'The editor path is not accessible. Mount the storage device and retry, reinstall the editor, or remove this entry.',
        'installs:badges.dotNet': '.NET',
        'installs:badges.prerelease': 'prerelease',
        'installs:messages.noReleasesCta': 'No releases installed yet.',
        'installs:emptyState.heading': 'Install your first Godot editor',
        'installs:emptyState.description':
            'Choose a version and build. You can install more versions later.',
        'installs:emptyState.chooseEditor': 'Choose an editor',
        'installs:emptyState.addCustomEditor': 'Add a custom editor',
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
    beforeEach(() => {
        releaseState.installedReleases = [
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
        releaseState.downloadingReleases = [];
        releaseState.loading = false;
        releaseState.hasError = undefined;
    });

    it('renders unavailable release guidance with retry/reinstall/remove actions', () => {
        const html = renderToStaticMarkup(<InstallsView />);

        expect(html).toContain('reinstall the editor');
        expect(html).toContain('Retry');
        expect(html).toContain('Reinstall');
        expect(html).toContain('Remove');
        expect(html).toContain('Custom Editor');
        expect(html).toContain('/Users/test/GodotEditors');
        expect(html).toContain('Select manifest file');
        expect(html).toContain('Create custom editor manifest');
    });

    it('renders the guided empty state without duplicate list controls', () => {
        releaseState.installedReleases = [];

        const html = renderToStaticMarkup(<InstallsView />);

        expect(html).toContain('lucide-hard-drive-download');
        expect(html).toContain('Install your first Godot editor');
        expect(html).toContain('Choose an editor');
        expect(html).toContain('Add a custom editor');
        expect(html).toContain('/Users/test/GodotEditors');
        expect(html).not.toContain('inputInstallSearch');
        expect(html).not.toContain('btnInstallEditor');
        expect(html).not.toContain('btnAddCustomEngineMenu');
        expect(html).not.toContain('installedReleaseList');
    });
});
