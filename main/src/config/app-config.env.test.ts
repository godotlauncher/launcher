import { describe, expect, it } from 'vitest';
import { parseProcessEnv } from './app-config.env.js';

describe('parseProcessEnv', () => {
    it('parses boolean env values', () => {
        expect(
            parseProcessEnv({
                GODOT_LAUNCHER_DISABLE_SANDBOX: '1',
                GODOT_LAUNCHER_NO_DEV_MENU: 'true',
                GODOT_LAUNCHER_E2E_FIXTURES: '0',
                GODOT_LAUNCHER_USE_LOCAL_GITHUB_BROKER: 'true',
            }).GODOT_LAUNCHER_DISABLE_SANDBOX,
        ).toBe(true);
        expect(
            parseProcessEnv({ GODOT_LAUNCHER_E2E_FIXTURES: '1' })
                .GODOT_LAUNCHER_E2E_FIXTURES,
        ).toBe(true);
        expect(
            parseProcessEnv({
                GODOT_LAUNCHER_DISABLE_SANDBOX: 'false',
            }).GODOT_LAUNCHER_DISABLE_SANDBOX,
        ).toBe(false);
        expect(
            parseProcessEnv({
                GODOT_LAUNCHER_USE_LOCAL_GITHUB_BROKER: '1',
            }).GODOT_LAUNCHER_USE_LOCAL_GITHUB_BROKER,
        ).toBe(true);
    });

    it('ignores invalid boolean env values', () => {
        expect(
            parseProcessEnv({
                GODOT_LAUNCHER_DISABLE_SANDBOX: 'maybe',
            }).GODOT_LAUNCHER_DISABLE_SANDBOX,
        ).toBeUndefined();
    });
});
