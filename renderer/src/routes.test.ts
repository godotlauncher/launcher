import { describe, expect, it } from 'vitest';
import {
    appRoutePaths,
    isConnectionsPathname,
    isSettingsTab,
    settingsTabs,
} from './routes';

describe('settings routes', () => {
    it('registers Connections between Tools and Updates', () => {
        expect(settingsTabs).toEqual([
            'projects',
            'installs',
            'appearance',
            'behavior',
            'codeEditors',
            'tools',
            'connections',
            'updates',
        ]);
        expect(isSettingsTab('connections')).toBe(true);
    });

    it('activates the Connections shortcut only for its canonical route', () => {
        expect(
            isConnectionsPathname(appRoutePaths.settingsTab('connections')),
        ).toBe(true);
        expect(
            isConnectionsPathname(appRoutePaths.settingsTab('projects')),
        ).toBe(false);
        expect(isConnectionsPathname('/settings/connections/extra')).toBe(
            false,
        );
    });
});
