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
    appQuit: vi.fn(),
    appOn: vi.fn(),
    appRemoveListener: vi.fn(),
    autoUpdaterOn: vi.fn(),
    autoUpdaterRemoveListener: vi.fn(),
    createMenu: vi.fn(),
    createTray: vi.fn(),
    disposeFocusRevalidation: vi.fn(),
    getAppIconPath: vi.fn(() => '/app/icon.png'),
    setAutoStart: vi.fn(),
    setMainWindow: vi.fn(),
    setupAutoUpdate: vi.fn(),
    setupFocusRevalidation: vi.fn(),
    stopAutoUpdateChecks: vi.fn(),
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
        getLoginItemSettings: vi.fn(() => ({ wasOpenedAtLogin: false })),
        getVersion: vi.fn(() => '1.10.0'),
        quit: mocks.appQuit,
        on: mocks.appOn,
        removeListener: mocks.appRemoveListener,
        setActivationPolicy: vi.fn(),
        dock: { hide: vi.fn(), show: vi.fn(), setIcon: vi.fn() },
    },
    autoUpdater: {
        on: mocks.autoUpdaterOn,
        removeListener: mocks.autoUpdaterRemoveListener,
    },
    dialog: { showMessageBox: vi.fn() },
}));

vi.mock('electron-log/main.js', () => ({
    default: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        log: vi.fn(),
    },
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
    setupAutoUpdate: mocks.setupAutoUpdate,
    stopAutoUpdateChecks: mocks.stopAutoUpdateChecks,
}));
vi.mock('./helpers/menu.helper.js', () => ({
    createMenu: mocks.createMenu,
}));
vi.mock('./helpers/revalidate.helper.js', () => ({
    setupFocusRevalidation: mocks.setupFocusRevalidation,
}));
vi.mock('./helpers/tray.helper.js', () => ({
    createTray: mocks.createTray,
}));
vi.mock('./mainWindow.js', () => ({
    setMainWindow: mocks.setMainWindow,
}));
vi.mock('./pathResolver.js', () => ({
    getAppIconPath: mocks.getAppIconPath,
}));
vi.mock('./utils/platform.utils.js', () => ({
    setAutoStart: mocks.setAutoStart,
}));

describe('AppLifecycleService', () => {
    const defaultPreferences = {
        language: 'system',
        auto_start: false,
        start_in_tray: false,
        auto_check_updates: false,
        receive_beta_updates: false,
        skipped_app_update_version: '',
        first_run: false,
        windows_symlink_win_notify: true,
    };

    const onActivate = vi.fn();
    const offActivate = vi.fn();
    const configService = {
        getAll: vi.fn(() => ({ isDev: false, startHidden: false })),
    };
    const electronAppService = {
        clearApplicationMenu: vi.fn(),
        offActivate,
        onActivate,
        quit: vi.fn(),
    };
    const mainWindow = {
        on: vi.fn(),
        setIcon: vi.fn(),
    };
    const windowManager = {
        getMainWindow: vi.fn(() => mainWindow),
        revealMainWindow: vi.fn(() => mainWindow),
    };
    const i18nService = {
        getSystemLocale: vi.fn(() => 'en'),
        setLocale: vi.fn(),
    };

    function createService() {
        return new AppLifecycleService(
            configService as never,
            electronAppService as never,
            windowManager as never,
            i18nService as never,
        );
    }

    function getRegisteredListener(
        listenerMock: typeof mocks.appOn,
        event: string,
    ): () => void {
        const listener = listenerMock.mock.calls.find(
            ([registeredEvent]) => registeredEvent === event,
        )?.[1];

        expect(listener).toBeTypeOf('function');
        return listener as () => void;
    }

    async function initializeLifecycle(service: AppLifecycleService) {
        await service.afterWindowReady();
        return {
            appBeforeQuit: getRegisteredListener(mocks.appOn, 'before-quit'),
            updaterBeforeQuit: getRegisteredListener(mocks.autoUpdaterOn, 'before-quit-for-update'),
            windowClosed: getRegisteredListener(mainWindow.on, 'closed'),
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getUserPreferences.mockResolvedValue({ ...defaultPreferences });
        mocks.isCacheStale.mockResolvedValue(false);
        mocks.setupFocusRevalidation.mockReturnValue(
            mocks.disposeFocusRevalidation,
        );
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

    it(
        'requests a framework quit when the updater event precedes app.before-quit',
        async () => {
            const service = createService();
            const { appBeforeQuit, updaterBeforeQuit, windowClosed } =
                await initializeLifecycle(service);

            electronAppService.quit.mockImplementationOnce(() => {
                expect(mocks.stopAutoUpdateChecks).toHaveBeenCalledOnce();
                expect(mocks.disposeFocusRevalidation).toHaveBeenCalledOnce();
            });

            updaterBeforeQuit();
            updaterBeforeQuit();

            expect(mocks.stopAutoUpdateChecks).toHaveBeenCalledOnce();
            expect(mocks.disposeFocusRevalidation).toHaveBeenCalledOnce();
            expect(electronAppService.quit).toHaveBeenCalledOnce();
            expect(mocks.appQuit).not.toHaveBeenCalled();

            await service.onMainWindowClose();
            expect(mocks.getUserPreferences).toHaveBeenCalledOnce();
            expect(mocks.appQuit).not.toHaveBeenCalled();

            appBeforeQuit();
            windowClosed();
            service.onAppQuit();

            expect(mocks.stopAutoUpdateChecks).toHaveBeenCalledOnce();
            expect(mocks.disposeFocusRevalidation).toHaveBeenCalledOnce();
            expect(electronAppService.quit).toHaveBeenCalledOnce();
            expect(mocks.autoUpdaterRemoveListener).toHaveBeenCalledWith(
                'before-quit-for-update',
                updaterBeforeQuit,
            );
            expect(mocks.appRemoveListener).toHaveBeenCalledWith(
                'before-quit',
                appBeforeQuit,
            );
        },
    );

    it('cleans up once during a regular quit', async () => {
        const service = createService();
        const { appBeforeQuit, updaterBeforeQuit, windowClosed } =
            await initializeLifecycle(service);

        appBeforeQuit();
        await service.onMainWindowClose();
        service.onAppQuit();
        windowClosed();

        expect(mocks.stopAutoUpdateChecks).toHaveBeenCalledOnce();
        expect(mocks.disposeFocusRevalidation).toHaveBeenCalledOnce();
        expect(electronAppService.quit).not.toHaveBeenCalled();
        expect(mocks.appQuit).not.toHaveBeenCalled();
        expect(mocks.autoUpdaterRemoveListener).toHaveBeenCalledWith(
            'before-quit-for-update',
            updaterBeforeQuit,
        );
        expect(mocks.appRemoveListener).toHaveBeenCalledWith(
            'before-quit',
            appBeforeQuit,
        );
    });
});
