import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLifecycleService } from './app-lifecycle.service.js';

const mocks = vi.hoisted(() => ({
    ensurePreferencesStorage: vi.fn(),
    getUserPreferences: vi.fn(),
    ipcWebContentsSend: vi.fn(),
    configureI18n: vi.fn(),
    getLocale: vi.fn(() => 'de-DE'),
    appQuit: vi.fn(),
    appOn: vi.fn(),
    appRemoveListener: vi.fn(),
    autoUpdaterOn: vi.fn(),
    autoUpdaterRemoveListener: vi.fn(),
    createEditingMenu: vi.fn(),
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
vi.mock('./commands/userPreferences.js', () => ({
    getUserPreferences: mocks.getUserPreferences,
}));
vi.mock('./i18n/index.js', () => ({ configureI18n: mocks.configureI18n }));
vi.mock('./autoUpdater.js', () => ({
    setupAutoUpdate: mocks.setupAutoUpdate,
    stopAutoUpdateChecks: mocks.stopAutoUpdateChecks,
}));
vi.mock('./helpers/menu.helper.js', () => ({
    createEditingMenu: mocks.createEditingMenu,
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
vi.mock('./projects/projects.service.js', () => ({
    ProjectsService: class ProjectsService {},
}));
vi.mock('./utils/platform.utils.js', () => ({
    setAutoStart: mocks.setAutoStart,
}));
vi.mock('./utils.js', () => ({
    ipcWebContentsSend: mocks.ipcWebContentsSend,
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
    };

    const onActivate = vi.fn();
    const offActivate = vi.fn();
    const configService = {
        getAll: vi.fn(() => ({
            isDev: false,
            startHidden: false,
            e2eFixtures: false,
        })),
    };
    const electronAppService = {
        clearApplicationMenu: vi.fn(),
        offActivate,
        onActivate,
        quit: vi.fn(),
        setHideOnClose: vi.fn(),
    };
    const mainWindow = {
        hide: vi.fn(),
        webContents: {},
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
    const installedEditorService = {
        revalidateInstalledEditors: vi.fn(),
        refreshInstalledEditorHealth: vi.fn(),
    };
    const toolIntegrationService = {
        refreshAll: vi.fn(),
    };
    const trayAvailabilityService = {
        isAvailable: vi.fn(async () => true),
    };
    const projectsService = {
        checkAllProjectsValid: vi.fn(),
        getProjectsDetails: vi.fn(),
        launchProject: vi.fn(),
        refreshProjectHealth: vi.fn(),
    };

    function createService() {
        return new AppLifecycleService(
            configService as never,
            electronAppService as never,
            windowManager as never,
            i18nService as never,
            installedEditorService as never,
            toolIntegrationService as never,
            trayAvailabilityService as never,
            projectsService as never,
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
            updaterBeforeQuit: getRegisteredListener(
                mocks.autoUpdaterOn,
                'before-quit-for-update',
            ),
            windowClosed: getRegisteredListener(mainWindow.on, 'closed'),
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        configService.getAll.mockReturnValue({
            isDev: false,
            startHidden: false,
            e2eFixtures: false,
        });
        mocks.getUserPreferences.mockResolvedValue({ ...defaultPreferences });
        projectsService.checkAllProjectsValid.mockResolvedValue([]);
        projectsService.getProjectsDetails.mockResolvedValue([]);
        projectsService.launchProject.mockResolvedValue({ launched: true });
        toolIntegrationService.refreshAll.mockResolvedValue([]);
        installedEditorService.revalidateInstalledEditors.mockResolvedValue([]);
        mocks.setupFocusRevalidation.mockReturnValue(
            mocks.disposeFocusRevalidation,
        );
        trayAvailabilityService.isAvailable.mockResolvedValue(true);
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
        expect(projectsService.checkAllProjectsValid).toHaveBeenCalledOnce();
        expect(
            installedEditorService.revalidateInstalledEditors,
        ).toHaveBeenCalledOnce();
    });

    it('starts tool refresh before project checks without blocking startup', async () => {
        let resolveRefresh: (() => void) | undefined;
        toolIntegrationService.refreshAll.mockReturnValue(
            new Promise<void>((resolve) => {
                resolveRefresh = resolve;
            }),
        );
        const service = createService();

        await service.beforeWindowReady();

        expect(toolIntegrationService.refreshAll).toHaveBeenCalledOnce();
        expect(
            toolIntegrationService.refreshAll.mock.invocationCallOrder[0],
        ).toBeLessThan(
            projectsService.checkAllProjectsValid.mock.invocationCallOrder[0],
        );
        resolveRefresh?.();
    });

    it('applies a stored concrete locale', async () => {
        mocks.getUserPreferences.mockResolvedValue({ language: 'pt-BR' });
        const service = createService();

        await service.beforeWindowReady();

        expect(i18nService.setLocale).toHaveBeenCalledWith('pt-BR');
    });

    it('reveals a regular launch only after the renderer is ready', async () => {
        const service = createService();

        await initializeLifecycle(service);

        expect(mocks.setAutoStart).toHaveBeenCalledWith(false, false);
        expect(mocks.setupAutoUpdate).toHaveBeenCalledOnce();
        expect(mocks.setupFocusRevalidation).toHaveBeenCalledWith(
            mainWindow,
            expect.any(Function),
            expect.any(Function),
        );
        expect(windowManager.revealMainWindow).not.toHaveBeenCalled();

        service.revealInitialWindow();
        service.revealInitialWindow();

        expect(windowManager.revealMainWindow).toHaveBeenCalledOnce();
    });

    it('uses quick project and editor health checks on focus', async () => {
        const service = createService();

        await initializeLifecycle(service);
        const refreshEditors = mocks.setupFocusRevalidation.mock.calls[0]?.[1];
        const refreshProjects = mocks.setupFocusRevalidation.mock.calls[0]?.[2];

        await refreshEditors?.();
        await refreshProjects?.();

        expect(
            installedEditorService.refreshInstalledEditorHealth,
        ).toHaveBeenCalledOnce();
        expect(projectsService.refreshProjectHealth).toHaveBeenCalledOnce();
        expect(projectsService.checkAllProjectsValid).not.toHaveBeenCalled();
    });

    it('installs native editing commands in a production window', async () => {
        const service = createService();

        await initializeLifecycle(service);

        expect(mocks.createEditingMenu).toHaveBeenCalledOnce();
        expect(mocks.createMenu).not.toHaveBeenCalled();
    });

    it('does not install focus revalidation for E2E fixtures', async () => {
        configService.getAll.mockReturnValue({
            isDev: false,
            startHidden: false,
            e2eFixtures: true,
        });
        const service = createService();

        await initializeLifecycle(service);

        expect(mocks.setupFocusRevalidation).not.toHaveBeenCalled();
    });

    it('does not change login items or start updates for E2E fixtures', async () => {
        configService.getAll.mockReturnValue({
            isDev: false,
            startHidden: false,
            e2eFixtures: true,
        });
        const service = createService();

        await initializeLifecycle(service);

        expect(mocks.setAutoStart).not.toHaveBeenCalled();
        expect(mocks.setupAutoUpdate).not.toHaveBeenCalled();
    });

    it('keeps a hidden launch hidden after the renderer is ready', async () => {
        configService.getAll.mockReturnValue({
            isDev: false,
            startHidden: true,
            e2eFixtures: false,
        });
        const service = createService();

        await initializeLifecycle(service);
        service.revealInitialWindow();

        expect(mainWindow.hide).toHaveBeenCalledOnce();
        expect(windowManager.revealMainWindow).not.toHaveBeenCalled();
    });

    it('reveals a hidden Linux launch when the tray is unavailable', async () => {
        configService.getAll.mockReturnValue({
            isDev: false,
            startHidden: true,
            e2eFixtures: false,
        });
        trayAvailabilityService.isAvailable.mockResolvedValue(false);
        const service = createService();

        await initializeLifecycle(service);
        service.revealInitialWindow();

        expect(mainWindow.hide).not.toHaveBeenCalled();
        expect(windowManager.revealMainWindow).toHaveBeenCalledOnce();
    });

    it('lets the framework quit on close when the tray is unavailable', async () => {
        trayAvailabilityService.isAvailable.mockResolvedValue(false);
        const service = createService();

        await initializeLifecycle(service);
        await service.onMainWindowClose();

        expect(electronAppService.setHideOnClose).toHaveBeenCalledWith(false);
        expect(mocks.appQuit).not.toHaveBeenCalled();
    });
    it('routes tray launches through the code editor aware project command', async () => {
        const service = createService();
        const project = { path: '/projects/demo' };

        await initializeLifecycle(service);

        expect(mocks.createTray).toHaveBeenCalledWith(
            mainWindow,
            expect.any(Function),
            expect.any(Function),
            expect.any(Function),
        );
        const launchFromTray = mocks.createTray.mock.calls[0]?.[1] as (
            selectedProject: typeof project,
        ) => Promise<void>;

        await launchFromTray(project);

        expect(projectsService.launchProject).toHaveBeenCalledWith(project);
    });

    it('routes tray show requests through the standard window reveal path', async () => {
        const service = createService();

        await initializeLifecycle(service);
        const showFromTray = mocks.createTray.mock.calls[0]?.[2] as () => void;

        showFromTray();

        expect(windowManager.revealMainWindow).toHaveBeenCalledOnce();
    });

    it('routes tray project reads through the project service', async () => {
        const service = createService();

        await initializeLifecycle(service);
        const listProjects = mocks.createTray.mock
            .calls[0]?.[3] as () => Promise<unknown[]>;

        await listProjects();

        expect(projectsService.getProjectsDetails).toHaveBeenCalledOnce();
    });

    it('reveals the window and forwards unavailable tray launches to the renderer', async () => {
        const service = createService();
        const project = { path: '/projects/demo' };
        const result = {
            launched: false,
            reason: 'code_editor_unavailable',
            integration: {
                id: 'vscode',
                displayName: 'Visual Studio Code',
                capabilities: { dotnet: true },
            },
        };
        projectsService.launchProject.mockResolvedValue(result);

        await initializeLifecycle(service);
        const launchFromTray = mocks.createTray.mock.calls[0]?.[1] as (
            selectedProject: typeof project,
        ) => Promise<void>;

        await launchFromTray(project);

        expect(windowManager.revealMainWindow).toHaveBeenCalledOnce();
        expect(mocks.ipcWebContentsSend).toHaveBeenCalledWith(
            'project-launch-code-editor-warning',
            mainWindow.webContents,
            { project, result },
        );
    });

    it('requests a framework quit when the updater event precedes app.before-quit', async () => {
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
    });

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
