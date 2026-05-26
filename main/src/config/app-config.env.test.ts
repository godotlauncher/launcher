import { describe, expect, it } from 'vitest';
import { parseProcessEnv } from './app-config.env.js';

describe('parseProcessEnv', () => {
    it('parses boolean env values', () => {
        expect(
            parseProcessEnv({
                GODOT_LAUNCHER_DISABLE_SANDBOX: '1',
                GODOT_LAUNCHER_NO_DEV_MENU: 'true',
                GODOT_LAUNCHER_DOCS_SCREENSHOTS: '0',
            }).GODOT_LAUNCHER_DISABLE_SANDBOX,
        ).toBe(true);
        expect(
            parseProcessEnv({
                GODOT_LAUNCHER_DISABLE_SANDBOX: 'false',
            }).GODOT_LAUNCHER_DISABLE_SANDBOX,
        ).toBe(false);
    });

    it('ignores invalid boolean env values', () => {
        expect(
            parseProcessEnv({
                GODOT_LAUNCHER_DISABLE_SANDBOX: 'maybe',
            }).GODOT_LAUNCHER_DISABLE_SANDBOX,
        ).toBeUndefined();
    });

    it('parses supported node env values', () => {
        expect(parseProcessEnv({ NODE_ENV: 'development' }).NODE_ENV).toBe(
            'development',
        );
        expect(
            parseProcessEnv({ NODE_ENV: 'invalid' }).NODE_ENV,
        ).toBeUndefined();
    });
});
