import * as fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as installedToolsModule from '../commands/installedTools.js';
import * as userPreferencesModule from '../commands/userPreferences.js';
import {
    getCachedTools,
    isCacheStale,
    isToolAvailable,
    refreshToolCache,
} from './toolCache.js';

vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
}));

vi.mock('../commands/userPreferences.js', () => ({
    getUserPreferences: vi.fn(),
    setUserPreferences: vi.fn(),
}));

vi.mock('../commands/installedTools.js', () => ({
    getInstalledTools: vi.fn(),
}));

const basePrefs: UserPreferences = {
    prefs_version: 3,
    install_location: '/install',
    config_location: '/config',
    projects_location: '/projects',
    post_launch_action: 'none',
    auto_check_updates: true,
    auto_start: false,
    start_in_tray: false,
    confirm_project_remove: true,
    first_run: false,
    windows_enable_symlinks: false,
    windows_symlink_win_notify: true,
    language: 'en',
};

const sampleTools: InstalledTool[] = [
    { name: 'VSCode', version: '1.0.0', path: '/usr/bin/code' },
    { name: 'Git', version: '2.44.0', path: '/usr/bin/git' },
];

const getUserPreferences = vi.mocked(userPreferencesModule.getUserPreferences);
const setUserPreferences = vi.mocked(userPreferencesModule.setUserPreferences);
const getInstalledTools = vi.mocked(installedToolsModule.getInstalledTools);
const existsSync = vi.mocked(fs.existsSync);

describe('toolCache service', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        existsSync.mockReturnValue(true);
        setUserPreferences.mockResolvedValue(basePrefs);
    });

    describe('getCachedTools', () => {
        it('returns cached tools when cache is fresh', async () => {
            getUserPreferences.mockResolvedValue({
                ...basePrefs,
                installed_tools: {
                    last_scan: Date.now(),
                    tools: [
                        {
                            name: 'VSCode',
                            path: '/usr/bin/code',
                            version: '1.0.0',
                            verified: true,
                        },
                    ],
                },
            });

            const tools = await getCachedTools();

            expect(tools).toEqual([
                {
                    name: 'VSCode',
                    path: '/usr/bin/code',
                    version: '1.0.0',
                    verified: true,
                },
            ]);
            expect(getInstalledTools).not.toHaveBeenCalled();
        });

        it('refreshes cache when none exists', async () => {
            getUserPreferences
                .mockResolvedValueOnce(basePrefs)
                .mockResolvedValueOnce(basePrefs);
            getInstalledTools.mockResolvedValue(sampleTools);

            const tools = await getCachedTools();

            expect(getInstalledTools).toHaveBeenCalledOnce();
            expect(setUserPreferences).toHaveBeenCalledWith(
                expect.objectContaining({
                    installed_tools: {
                        last_scan: expect.any(Number),
                        tools: sampleTools.map(({ name, path, version }) => ({
                            name,
                            path,
                            version,
                            verified: true,
                        })),
                    },
                }),
            );
            expect(tools).toEqual([
                {
                    name: 'VSCode',
                    path: '/usr/bin/code',
                    version: '1.0.0',
                    verified: true,
                },
                {
                    name: 'Git',
                    path: '/usr/bin/git',
                    version: '2.44.0',
                    verified: true,
                },
            ]);
        });

        it('refreshes cache when stale', async () => {
            const stalePrefs: UserPreferences = {
                ...basePrefs,
                installed_tools: {
                    last_scan: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago
                    tools: [
                        {
                            name: 'VSCode',
                            path: '/usr/bin/code',
                            version: '1.0.0',
                            verified: true,
                        },
                    ],
                },
            };

            getUserPreferences
                .mockResolvedValueOnce(stalePrefs)
                .mockResolvedValueOnce(basePrefs);
            getInstalledTools.mockResolvedValue(sampleTools);

            await getCachedTools();

            expect(getInstalledTools).toHaveBeenCalledOnce();
        });
    });

    describe('isCacheStale', () => {
        it('returns true when cache missing', async () => {
            getUserPreferences.mockResolvedValue(basePrefs);

            expect(await isCacheStale()).toBe(true);
        });

        it('returns false when cache fresh', async () => {
            getUserPreferences.mockResolvedValue({
                ...basePrefs,
                installed_tools: {
                    last_scan: Date.now(),
                    tools: [],
                },
            });

            expect(await isCacheStale()).toBe(false);
        });

        it('returns true when cache older than 24h', async () => {
            getUserPreferences.mockResolvedValue({
                ...basePrefs,
                installed_tools: {
                    last_scan: Date.now() - 1000 * 60 * 60 * 25,
                    tools: [],
                },
            });

            expect(await isCacheStale()).toBe(true);
        });
    });

    describe('refreshToolCache', () => {
        it('uses supplied tool list without re-scanning', async () => {
            getUserPreferences.mockResolvedValue(basePrefs);

            const tools = await refreshToolCache(sampleTools);

            expect(getInstalledTools).not.toHaveBeenCalled();
            expect(setUserPreferences).toHaveBeenCalledWith(
                expect.objectContaining({
                    installed_tools: {
                        last_scan: expect.any(Number),
                        tools: sampleTools.map(({ name, path, version }) => ({
                            name,
                            path,
                            version,
                            verified: true,
                        })),
                    },
                }),
            );
            expect(tools).toEqual([
                {
                    name: 'VSCode',
                    path: '/usr/bin/code',
                    version: '1.0.0',
                    verified: true,
                },
                {
                    name: 'Git',
                    path: '/usr/bin/git',
                    version: '2.44.0',
                    verified: true,
                },
            ]);
        });
    });

    describe('isToolAvailable', () => {
        it('returns true when tool present and verified', async () => {
            getUserPreferences.mockResolvedValue({
                ...basePrefs,
                installed_tools: {
                    last_scan: Date.now(),
                    tools: [
                        {
                            name: 'VSCode',
                            path: '/usr/bin/code',
                            version: '1.0.0',
                            verified: true,
                        },
                    ],
                },
            });

            expect(await isToolAvailable('VSCode')).toBe(true);
        });

        it('returns false when tool path missing', async () => {
            existsSync.mockReturnValue(false);
            getUserPreferences.mockResolvedValue({
                ...basePrefs,
                installed_tools: {
                    last_scan: Date.now(),
                    tools: [
                        {
                            name: 'VSCode',
                            path: '/usr/bin/code',
                            version: '1.0.0',
                            verified: true,
                        },
                    ],
                },
            });

            expect(await isToolAvailable('VSCode')).toBe(false);
        });
    });
});
