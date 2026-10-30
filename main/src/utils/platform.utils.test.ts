import { execFile } from 'node:child_process';
import * as os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import which from 'which';
import { __resetCurrentAppConfigForTesting } from '../config/index';
import { APP_INTERNAL_NAME } from '../constants';
import {
    findExecutable,
    getCommandVersion,
    getDefaultDirs,
} from './platform.utils';

vi.mock('which', () => ({ default: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

const platformMock = os.platform as unknown as vi.Mock<[], string>;
const homedirMock = os.homedir as unknown as vi.Mock<[], string>;

// Mock electron-updater
vi.mock('electron-updater', () => ({
    default: {
        autoUpdater: {
            on: vi.fn(),
            logger: null,
            channel: null,
            checkForUpdates: vi.fn(),
            checkForUpdatesAndNotify: vi.fn(),
            downloadUpdate: vi.fn(),
            quitAndInstall: vi.fn(),
            setFeedURL: vi.fn(),
            addAuthHeader: vi.fn(),
            isUpdaterActive: vi.fn(),
            currentVersion: '1.0.0',
        },
    },
    UpdateCheckResult: {},
}));

// Mock electron
vi.mock('electron', () => ({
    Menu: {
        setApplicationMenu: vi.fn(),
    },
    app: {
        getAppPath: vi.fn(() => '/app/path'),
        isPackaged: false,
        getName: vi.fn(),
        getVersion: vi.fn(() => '1.0.0'),
        getLocale: vi.fn(),
        getPath: vi.fn(),
        on: vi.fn(),
        whenReady: vi.fn(),
        quit: vi.fn(),
        requestSingleInstanceLock: vi.fn(() => true),
        dock: {
            show: vi.fn(),
            hide: vi.fn(),
        },
    },
    BrowserWindow: vi.fn(),
    shell: {
        showItemInFolder: vi.fn(),
        openExternal: vi.fn(),
    },
    dialog: {
        showOpenDialog: vi.fn(),
        showMessageBox: vi.fn(),
    },
}));

vi.mock('node:os', () => ({
    // Provide default mocks, these will be overridden in beforeEach
    homedir: vi.fn(() => '/home/user'),
    platform: vi.fn(() => 'linux'),
}));

describe('platform.utils', () => {
    afterEach(() => {
        __resetCurrentAppConfigForTesting();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('uses the cleaned PATH for command discovery and a clean environment for version probes', async () => {
        vi.stubGlobal('process', { ...process, platform: 'linux' });
        vi.stubEnv('APPDIR', '/tmp/.mount_launcher');
        vi.stubEnv('APPIMAGE', '/downloads/launcher.AppImage');
        vi.stubEnv('PATH', '/tmp/.mount_launcher:/usr/bin');
        vi.stubEnv('LD_LIBRARY_PATH', '/tmp/.mount_launcher/usr/lib');
        vi.mocked(which).mockResolvedValue('/usr/bin/git');
        await expect(findExecutable('git')).resolves.toBe('/usr/bin/git');
        expect(which).toHaveBeenCalledWith('git', {
            nothrow: true,
            path: '/usr/bin',
        });
        vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
            (args.at(-1) as (error: null, stdout: string) => void)(
                null,
                'git version 2.50\n',
            );
            return {} as never;
        });
        await expect(getCommandVersion('/usr/bin/git')).resolves.toBe(
            'git version 2.50',
        );
        const environment = vi.mocked(execFile).mock.lastCall?.[2] as {
            env: NodeJS.ProcessEnv;
        };
        expect(environment.env.APPDIR).toBeUndefined();
        expect(environment.env.LD_LIBRARY_PATH).toBeUndefined();
    });

    it('uses the native host fallback when AppImage cleanup removes every PATH entry', async () => {
        vi.stubGlobal('process', { ...process, platform: 'linux' });
        vi.stubEnv('APPDIR', '/tmp/.mount_launcher');
        vi.stubEnv('APPIMAGE', '/downloads/launcher.AppImage');
        vi.stubEnv(
            'PATH',
            '/tmp/.mount_launcher:/tmp/.mount_launcher/usr/sbin',
        );
        vi.mocked(which).mockResolvedValue('/usr/bin/git');
        await findExecutable('git');
        expect(which).toHaveBeenLastCalledWith('git', {
            nothrow: true,
            path: '/usr/bin:/bin',
        });
    });

    describe('Windows paths', () => {
        beforeEach(() => {
            platformMock.mockReturnValue('win32');
            homedirMock.mockReturnValue('c:\\Users\\User');
        });

        it('should get default paths for Windows', () => {
            const dirs = getDefaultDirs();
            const expectedHomeDir = 'c:\\Users\\User';
            expect(dirs).toEqual({
                configDir: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                ),
                dataDir: path.win32.join(expectedHomeDir, 'Godot', 'Editors'),
                templateDir: path.win32.join(
                    expectedHomeDir,
                    'Godot',
                    'ExportTemplates',
                ),
                prefsPath: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'prefs.json',
                ),
                installedReleasesCachePath: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'installed-releases.json',
                ),
                prereleaseCachePath: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'prereleases.json',
                ),
                migrationStatePath: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'migrations.json',
                ),
                projectDir: path.win32.join(
                    expectedHomeDir,
                    'Godot',
                    'Projects',
                ),
                releaseCachePath: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'releases.json',
                ),
            });
        });
    });

    describe('Linux paths', () => {
        beforeEach(() => {
            platformMock.mockReturnValue('linux');
            homedirMock.mockReturnValue('/home/user');
        });

        it('should get default paths for Linux', () => {
            const dirs = getDefaultDirs();
            const expectedHomeDir = '/home/user';
            expect(dirs).toEqual({
                configDir: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                ),
                dataDir: path.posix.join(expectedHomeDir, 'Godot', 'Editors'),
                templateDir: path.posix.join(
                    expectedHomeDir,
                    'Godot',
                    'ExportTemplates',
                ),
                prefsPath: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'prefs.json',
                ),
                installedReleasesCachePath: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'installed-releases.json',
                ),
                prereleaseCachePath: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'prereleases.json',
                ),
                migrationStatePath: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'migrations.json',
                ),
                projectDir: path.posix.join(
                    expectedHomeDir,
                    'Godot',
                    'Projects',
                ),
                releaseCachePath: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'releases.json',
                ),
            });
        });
    });
});
