import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_INTERNAL_NAME } from '../constants.js';
import { configuration, resolveAppPaths } from './app-config.js';

function argv(...args: string[]): string[] {
    return ['/path/Godot Launcher', ...args];
}

describe('configuration', () => {
    it('resolves development runtime flags from env and cli', () => {
        const config = configuration({
            args: argv('--debug', '--no-sandbox', '--no-dev-menu', '--hidden'),
            env: {
                NODE_ENV: 'development',
                GODOT_LAUNCHER_DOCS_SCREENSHOTS: '1',
            },
            platform: 'linux',
            homedir: '/home/user',
        });

        expect(config).toEqual(
            expect.objectContaining({
                appName: 'Godot Launcher',
                nodeEnv: 'development',
                isDev: true,
                debugMode: true,
                disableSandbox: true,
                disableDevMenu: true,
                startHidden: true,
                docsScreenshots: true,
            }),
        );
    });

    it('keeps cli true when env explicitly parses false', () => {
        const config = configuration({
            args: argv('--no-sandbox', '--no-dev-menu'),
            env: {
                NODE_ENV: 'production',
                GODOT_LAUNCHER_DISABLE_SANDBOX: '0',
                GODOT_LAUNCHER_NO_DEV_MENU: 'false',
            },
        });

        expect(config.disableSandbox).toBe(true);
        expect(config.disableDevMenu).toBe(true);
    });

    it('preserves existing default path layout for Windows and Linux', () => {
        const windowsHome = 'c:\\Users\\User';
        expect(
            resolveAppPaths({ platform: 'win32', homedir: windowsHome }),
        ).toEqual({
            configDir: path.win32.resolve(windowsHome, `.${APP_INTERNAL_NAME}`),
            dataDir: path.win32.resolve(windowsHome, 'Godot', 'Editors'),
            projectDir: path.win32.resolve(windowsHome, 'Godot', 'Projects'),
            prefsPath: path.win32.resolve(
                windowsHome,
                `.${APP_INTERNAL_NAME}`,
                'prefs.json',
            ),
            releaseCachePath: path.win32.resolve(
                windowsHome,
                `.${APP_INTERNAL_NAME}`,
                'releases.json',
            ),
            installedReleasesCachePath: path.win32.resolve(
                windowsHome,
                `.${APP_INTERNAL_NAME}`,
                'installed-releases.json',
            ),
            prereleaseCachePath: path.win32.resolve(
                windowsHome,
                `.${APP_INTERNAL_NAME}`,
                'prereleases.json',
            ),
            migrationStatePath: path.win32.resolve(
                windowsHome,
                `.${APP_INTERNAL_NAME}`,
                'migrations.json',
            ),
        });

        expect(
            resolveAppPaths({ platform: 'linux', homedir: '/home/user' }),
        ).toEqual({
            configDir: path.posix.resolve(
                '/home/user',
                `.${APP_INTERNAL_NAME}`,
            ),
            dataDir: path.posix.resolve('/home/user', 'Godot', 'Editors'),
            projectDir: path.posix.resolve('/home/user', 'Godot', 'Projects'),
            prefsPath: path.posix.resolve(
                '/home/user',
                `.${APP_INTERNAL_NAME}`,
                'prefs.json',
            ),
            releaseCachePath: path.posix.resolve(
                '/home/user',
                `.${APP_INTERNAL_NAME}`,
                'releases.json',
            ),
            installedReleasesCachePath: path.posix.resolve(
                '/home/user',
                `.${APP_INTERNAL_NAME}`,
                'installed-releases.json',
            ),
            prereleaseCachePath: path.posix.resolve(
                '/home/user',
                `.${APP_INTERNAL_NAME}`,
                'prereleases.json',
            ),
            migrationStatePath: path.posix.resolve(
                '/home/user',
                `.${APP_INTERNAL_NAME}`,
                'migrations.json',
            ),
        });
    });
});
