import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createElectronApplication: vi.fn(async () => ({ status: 'redirected' })),
    showSplashscreen: vi.fn(),
    closeSplashscreen: vi.fn(),
    quit: vi.fn(),
}));

vi.mock('@mariodebono/di-electron', () => ({
    createElectronApplication: mocks.createElectronApplication,
}));
vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getAppPath: () => '/fixture/app',
        getVersion: () => '1.12.0',
        commandLine: {},
        quit: mocks.quit,
    },
    Menu: { setApplicationMenu: vi.fn() },
}));
vi.mock('electron-log/main.js', () => ({
    default: {
        transports: { file: {}, console: {} },
        initialize: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));
vi.mock('./app.module.js', () => ({ AppModule: class AppModule {} }));
vi.mock('./config/index.js', () => ({
    configuration: () => ({
        appName: 'Godot Launcher',
        isDev: false,
        e2eFixtures: false,
        startHidden: true,
        debugMode: false,
        disableSandbox: false,
        paths: { prefsPath: '/fixture/prefs.json' },
    }),
    setCurrentAppConfig: vi.fn(),
}));
vi.mock('./linux-credential-storage.utils.js', () => ({
    configureLinuxCredentialStorage: () => undefined,
}));
vi.mock('./pathResolver.js', () => ({
    getAppIconPath: () => '/fixture/icon.png',
    getUIPath: () => '/fixture/ui.html',
}));
vi.mock('./splashscreen/splashscreen.js', () => ({
    showSplashscreen: mocks.showSplashscreen,
    closeSplashscreen: mocks.closeSplashscreen,
}));

it('closes the splashscreen after redirecting a secondary launch', async () => {
    await import('./main.js');
    await vi.waitFor(() => {
        expect(mocks.createElectronApplication).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ instanceMode: 'single' }),
        );
        expect(mocks.closeSplashscreen).toHaveBeenCalledOnce();
    });

    expect(mocks.quit).not.toHaveBeenCalled();
});
