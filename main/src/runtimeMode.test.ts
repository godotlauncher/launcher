import { describe, expect, it } from 'vitest';
import { isDevelopmentRuntime, isInstalledRuntime } from './runtimeMode.js';

describe('runtime mode', () => {
    it('treats source Electron as development', () => {
        const input = { isPackaged: false, appPath: '/workspace/launcher' };

        expect(isDevelopmentRuntime(input)).toBe(true);
        expect(isInstalledRuntime(input)).toBe(false);
    });

    it('treats an official package as installed', () => {
        const input = { isPackaged: true, appPath: '/opt/launcher/app' };

        expect(isDevelopmentRuntime(input)).toBe(false);
        expect(isInstalledRuntime(input)).toBe(true);
    });

    it.each([
        '/usr/lib/godot-launcher/app.asar',
        'C:\\Program Files\\Godot Launcher\\APP.ASAR',
    ])('treats an ASAR application path as installed: %s', (appPath) => {
        expect(isInstalledRuntime({ isPackaged: false, appPath })).toBe(true);
    });
});
