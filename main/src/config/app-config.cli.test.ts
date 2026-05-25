import { describe, expect, it } from 'vitest';
import { parseCliArgs } from './app-config.cli.js';

function argv(...args: string[]): string[] {
    return ['/path/Godot Launcher', ...args];
}

function defaultElectronArgv(...args: string[]): string[] {
    return ['/path/electron', '.', ...args];
}

describe('parseCliArgs', () => {
    it('parses launcher debug flag', () => {
        expect(parseCliArgs(argv('--launcher-debug')).debug).toBe(true);
    });

    it('does not use Electron reserved debug flag', () => {
        expect(parseCliArgs(argv('--debug')).debug).toBeUndefined();
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

    it('does not drop the first packaged app flag', () => {
        const parsed = parseCliArgs(argv('--hidden', '--launcher-debug'));

        expect(parsed.startHidden).toBe(true);
        expect(parsed.debug).toBe(true);
    });

    it('parses sandbox flags from packaged app argv', () => {
        const parsed = parseCliArgs(argv('--no-sandbox'));

        expect(parsed.disableSandbox).toBe(true);
    });

    it('parses default Electron argv', () => {
        const parsed = parseCliArgs(
            defaultElectronArgv('--hidden', '--no-sandbox'),
        );

        expect(parsed.startHidden).toBe(true);
        expect(parsed.disableSandbox).toBe(true);
    });

    it('parses default Electron argv after a separator', () => {
        const parsed = parseCliArgs(
            defaultElectronArgv('--', '--hidden', '--no-sandbox'),
        );

        expect(parsed.startHidden).toBe(true);
        expect(parsed.disableSandbox).toBe(true);
    });

    it('parses packaged app flags after an app path and separator', () => {
        const parsed = parseCliArgs(
            argv(
                '/Applications/Godot Launcher.app/Contents/Resources/app.asar',
                '--',
                '--launcher-debug',
                '--hidden',
            ),
        );

        expect(parsed.debug).toBe(true);
        expect(parsed.startHidden).toBe(true);
    });
});
