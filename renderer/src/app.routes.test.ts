import { describe, expect, it } from 'vitest';
import {
    appRoutePaths,
    getViewFromPathname,
    isSettingsTab,
    settingsTabs,
} from './app.routes';

describe('settings routes', () => {
    it('registers Command line beside Installs', () => {
        expect(settingsTabs).toEqual([
            'projects',
            'installs',
            'commandLine',
            'exportTemplates',
            'appearance',
            'behavior',
            'codeEditors',
            'tools',
            'connections',
            'updates',
        ]);
        expect(isSettingsTab('connections')).toBe(true);
        expect(isSettingsTab('commandLine')).toBe(true);
        expect(appRoutePaths.settingsTab('commandLine')).toBe(
            '/settings/commandLine',
        );
    });

    it('resolves Extensions separately from Connections settings', () => {
        expect(getViewFromPathname(appRoutePaths.extensions)).toBe(
            'extensions',
        );
        expect(
            getViewFromPathname(appRoutePaths.settingsTab('connections')),
        ).toBe('settings');
    });
});
