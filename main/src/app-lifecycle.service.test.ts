import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLifecycleService } from './app-lifecycle.service.js';

const mocks = vi.hoisted(() => ({
    ensurePreferencesStorage: vi.fn(),
    runMigrations: vi.fn(),
    getUserPreferences: vi.fn(),
    checkAndUpdateProjects: vi.fn(),
    checkAndUpdateReleases: vi.fn(),
    isCacheStale: vi.fn(),
    configureI18n: vi.fn(),
    getLocale: vi.fn(() => 'de-DE'),
}));

vi.mock('@mariodebono/di-electron', () => {
    const hook = () => () => undefined;
    return {
        AppLaunchContext: class AppLaunchContext {},
        AppReady: hook,
        AppReadyOrder: {
            BeforeWindow: 'before-window',
            AfterWindow: 'after-window',
        },
        ElectronAppService: class ElectronAppService {},
        LifecycleHookOrder: { Before: 'before', After: 'after' },
        OnAppLaunch: hook,
        OnAppQuit: hook,
        OnMainWindowClose: hook,
        OnMainWindowShow: hook,
        WindowManagerService: class WindowManagerService {},
    };
});

vi.mock('@mariodebono/di-electron-i18n', () => ({
    I18nService: class I18nService {},
}));

vi.mock('electron', () => ({
    app: {
        getLocale: mocks.getLocale,
        getVersion: vi.fn(() => '1.10.0'),
        quit: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
        dock: { hide: vi.fn(), show: vi.fn(), setIcon: vi.fn() },
    },
    autoUpdater: {
        on: vi.fn(),
        removeListener: vi.fn(),
    },
    dialog: { showMessageBox: vi.fn() },
}));

vi.mock('./utils/prefs.utils.js', () => ({
    ensurePreferencesStorage: mocks.ensurePreferencesStorage,
}));
vi.mock('./migrations/index.js', () => ({
    runMigrations: mocks.runMigrations,
}));
vi.mock('./commands/userPreferences.js', () => ({
    getUserPreferences: mocks.getUserPreferences,
}));
vi.mock('./checks.js', () => ({
    checkAndUpdateProjects: mocks.checkAndUpdateProjects,
    checkAndUpdateReleases: mocks.checkAndUpdateReleases,
}));
vi.mock('./services/toolCache.js', () => ({
    isCacheStale: mocks.isCacheStale,
    refreshToolCache: vi.fn(),
}));
vi.mock('./i18n/index.js', () => ({ configureI18n: mocks.configureI18n }));
vi.mock('./autoUpdater.js', () => ({
    setupAutoUpdate: vi.fn(),
    stopAutoUpdateChecks: vi.fn(),
}));

describe('AppLifecycleService', () => {
    const onActivate = vi.fn();
    const offActivate = vi.fn();
    const i18nService = {
        getSystemLocale: vi.fn(() => 'en'),
        setLocale: vi.fn(),
    };

    function createService() {
        return new AppLifecycleService(
            { getAll: vi.fn(() => ({})) } as never,
            { onActivate, offActivate } as never,
            {} as never,
            i18nService as never,
        );
    }

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getUserPreferences.mockResolvedValue({ language: 'system' });
        mocks.isCacheStale.mockResolvedValue(false);
    });

    it('owns the Electron activation subscription', () => {
        const service = createService();

        service.onModuleInit();
        service.onModuleDestroy();

        expect(mocks.configureI18n).toHaveBeenCalledWith(i18nService);
        expect(onActivate).toHaveBeenCalledOnce();
        expect(offActivate).toHaveBeenCalledOnce();
        expect(offActivate).toHaveBeenCalledWith(onActivate.mock.calls[0]?.[0]);
    });

    it('applies the Electron system locale before startup checks', async () => {
        const service = createService();

        await service.beforeWindowReady();

        expect(mocks.ensurePreferencesStorage).toHaveBeenCalledOnce();
        expect(i18nService.setLocale).toHaveBeenCalledWith('de-DE');
        expect(mocks.checkAndUpdateProjects).toHaveBeenCalledOnce();
        expect(mocks.checkAndUpdateReleases).toHaveBeenCalledOnce();
    });

    it('applies a stored concrete locale', async () => {
        mocks.getUserPreferences.mockResolvedValue({ language: 'pt-BR' });
        const service = createService();

        await service.beforeWindowReady();

        expect(i18nService.setLocale).toHaveBeenCalledWith('pt-BR');
    });
});
