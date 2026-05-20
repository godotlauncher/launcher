import { describe, expect, it } from 'vitest';
import { parseCliArgs } from './app-config.cli.js';

function argv(...args: string[]): string[] {
    return ['node', 'main.js', ...args];
}

describe('parseCliArgs', () => {
    it('parses debug aliases', () => {
        expect(parseCliArgs(argv('--debug')).debug).toBe(true);
        expect(parseCliArgs(argv('-d')).debug).toBe(true);
    });

    it('parses sandbox disable aliases', () => {
        expect(parseCliArgs(argv('--no-sandbox')).disableSandbox).toBe(true);
        expect(parseCliArgs(argv('--disable-sandbox')).disableSandbox).toBe(
            true,
        );
    });

    it('parses dev menu and hidden flags', () => {
        const parsed = parseCliArgs(argv('--no-dev-menu', '--hidden'));

        expect(parsed.disableDevMenu).toBe(true);
        expect(parsed.startHidden).toBe(true);
    });

    it('supports Electron args after a separator', () => {
        const parsed = parseCliArgs(argv('--', '--hidden', '--no-sandbox'));

        expect(parsed.startHidden).toBe(true);
        expect(parsed.disableSandbox).toBe(true);
    });
});
