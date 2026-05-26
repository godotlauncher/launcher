import type { AppUpdateMessage, UserPreferences } from '@shared';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckForUpdates } from './checkForUpdates.component';

const appState = {
    updateAvailable: undefined as AppUpdateMessage | undefined,
    installAndRelaunch: vi.fn(),
    checkForAppUpdates: vi.fn(),
    downloadAppUpdate: vi.fn(),
    skipAppUpdate: vi.fn(),
    unskipAppUpdate: vi.fn(),
};

const preferencesState = {
    preferences: {
        auto_check_updates: true,
        receive_beta_updates: false,
        skipped_app_update_version: undefined,
    } as Partial<UserPreferences> as UserPreferences,
    setAutoUpdates: vi.fn(),
    setReceiveBetaUpdates: vi.fn(),
    loadPreferences: vi.fn(),
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const dictionary: Record<string, string> = {
                'updates.title': 'Updates',
                'updates.description': 'Configure updates',
                'updates.autoCheck': 'Automatically check for updates',
                'updates.betaChannel': 'Receive beta updates',
                'updates.betaChannelDescription': 'Download beta updates',
                'updates.checkNow': 'Check for updates',
                'updates.downloadNow': 'Download update',
                'updates.skipVersion': 'Skip this version',
                'updates.unskipVersion': 'Unskip skipped update',
            };
            return dictionary[key] ?? key;
        },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) =>
        React.createElement('span', null, i18nKey),
}));

vi.mock('../../hooks/useApp', () => ({
    useApp: () => appState,
}));

vi.mock('../../hooks/usePreferences', () => ({
    usePreferences: () => preferencesState,
}));

describe('CheckForUpdates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appState.updateAvailable = undefined;
        preferencesState.preferences.skipped_app_update_version = undefined;
    });

    it('shows only manual check in none state', () => {
        const html = renderToStaticMarkup(<CheckForUpdates />);

        expect(html).toContain('Check for updates');
        expect(html).not.toContain('Download update');
        expect(html).not.toContain('Skip this version');
    });

    it('shows download and skip actions for available updates', () => {
        appState.updateAvailable = {
            available: true,
            downloaded: false,
            type: 'available',
            version: '1.9.1',
            message: 'New version available: 1.9.1',
        };

        const html = renderToStaticMarkup(<CheckForUpdates />);

        expect(html).toContain('Check for updates');
        expect(html).toContain('Download update');
        expect(html).toContain('Skip this version');
    });

    it('shows progress messaging while downloading', () => {
        appState.updateAvailable = {
            available: true,
            downloaded: false,
            type: 'downloading',
            version: '1.9.1',
            message: 'Downloading update: 55%',
        };

        const html = renderToStaticMarkup(<CheckForUpdates />);

        expect(html).toContain('Downloading update: 55%');
    });

    it('shows restart block when update is ready', () => {
        appState.updateAvailable = {
            available: true,
            downloaded: true,
            type: 'ready',
            version: '1.9.1',
            message: 'Update downloaded, restart to install.',
        };

        const html = renderToStaticMarkup(<CheckForUpdates />);

        expect(html).toContain('updates.readyWithVersion');
    });

    it('shows unskip action when a skipped version exists', () => {
        preferencesState.preferences.skipped_app_update_version = '1.9.1';

        const html = renderToStaticMarkup(<CheckForUpdates />);

        expect(html).toContain('Unskip skipped update');
    });
});
