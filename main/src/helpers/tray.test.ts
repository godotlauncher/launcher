import type { ProjectDetails } from '@shared/contracts';
import type {
    BrowserWindow,
    Menu as ElectronMenuType,
    MenuItem,
    MenuItemConstructorOptions,
    Tray,
} from 'electron';
import { beforeEach, expect, test, vi } from 'vitest';
import { createTray } from './tray.helper.js';

// Define platform before mocks
Object.defineProperty(process, 'platform', {
    value: 'darwin',
});

// Mock the path module
vi.mock('node:path', () => ({
    resolve: vi.fn().mockReturnValue('/some/path'),
    join: vi.fn().mockReturnValue('/some/path'),
}));

// Mock the modules imported by tray.helper.ts
vi.mock('../pathResolver.js', () => ({
    getAssetPath: vi.fn().mockReturnValue('/assets'),
}));

vi.mock('../i18n/index.js', () => {
    const translations = {
        'menus:tray.recentProjects': 'Recent Projects',
        'menus:tray.invalidProject': '{{project}} (Invalid)',
        'menus:tray.showGodotLauncher': 'Show Godot Launcher',
        'menus:tray.quit': 'Quit',
    } as const;

    return {
        t: vi.fn((key: string, options?: { project?: string }) =>
            (translations[key as keyof typeof translations] ?? key).replace(
                '{{project}}',
                options?.project ?? '',
            ),
        ),
    };
});

// Create a mock for electron-updater first
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

// Create a mock menu instance that we can control
const mockMenu = {
    popup: vi.fn(),
};

// Hoist tray mocks so they are available inside the vi.mock factory
const { mockTrayInstance, trayInstance, MockTray } = vi.hoisted(() => {
    const instance = {
        setContextMenu: vi.fn(),
        setToolTip: vi.fn(),
        on: vi.fn(),
        popUpContextMenu: vi.fn(),
    };

    const TrayMock = vi.fn(function TrayMock() {
        return instance;
    });

    return {
        mockTrayInstance: instance,
        trayInstance: instance as unknown as Tray,
        MockTray: TrayMock,
    };
});

// Create a mock for electron
vi.mock('electron', () => {
    const buildFromTemplate = vi
        .fn<
            (
                template: Array<MenuItemConstructorOptions | MenuItem>,
            ) => ElectronMenuType
        >()
        .mockImplementation(
            () => mockMenu as unknown as ElectronMenuType, // minimal stub to satisfy typing
        );

    return {
        Tray: MockTray,
        app: {
            getAppPath: vi.fn().mockReturnValue('/'),
            quit: vi.fn(),
            isPackaged: false,
            getName: vi.fn(),
            getVersion: vi.fn(() => '1.0.0'),
            getLocale: vi.fn(),
            getPath: vi.fn(),
            on: vi.fn(),
            whenReady: vi.fn(),
            requestSingleInstanceLock: vi.fn(() => true),
            dock: {
                show: vi.fn(),
                hide: vi.fn(),
            },
        },
        Menu: {
            buildFromTemplate,
            setApplicationMenu: vi.fn(),
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
    };
});

// Import electron after mocking
const electron = await import('electron');
const { Menu: ElectronMenu, app } = electron;

const mainWindowMock = {
    show: vi.fn(),
    isVisible: vi.fn().mockReturnValue(false),
};
const browserWindow = mainWindowMock as unknown as BrowserWindow;
const showMainWindow = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
});

test('Should have tray menu with show and quit', async () => {
    const buildFromTemplateMock = vi.mocked(ElectronMenu.buildFromTemplate);
    let capturedTemplate: Array<MenuItemConstructorOptions | MenuItem> = [];
    buildFromTemplateMock.mockImplementation((template) => {
        capturedTemplate = template;
        return mockMenu as unknown as ElectronMenuType;
    });

    await createTray(
        browserWindow,
        vi.fn(async () => undefined),
        showMainWindow,
        vi.fn(async () => []),
    );

    // Mac platform will not show menu on load but Linux would
    // Force call updateMenu to test template creation
    const { updateMenu } = await import('./tray.helper.js');
    await updateMenu(trayInstance, browserWindow);

    // Verify the template structure
    expect(capturedTemplate.length).toBeGreaterThan(0);

    const callClick = (item?: MenuItemConstructorOptions | MenuItem) => {
        const handler = (item as { click?: unknown })?.click;
        if (typeof handler === 'function') {
            (handler as () => void)();
        }
    };

    // Find the relevant menu items for testing
    const showMenuItem = capturedTemplate.find(
        (item) => 'label' in item && item.label === 'Show Godot Launcher',
    );
    const separatorItem = capturedTemplate.find(
        (item) => 'type' in item && item.type === 'separator',
    );
    const quitMenuItem = capturedTemplate.find(
        (item) => 'label' in item && item.label === 'Quit',
    );

    // Verify they exist
    expect(showMenuItem).toBeDefined();
    expect(separatorItem).toBeDefined();
    expect(quitMenuItem).toBeDefined();

    // Test the click handlers
    callClick(showMenuItem);
    expect(showMainWindow).toHaveBeenCalledOnce();
    expect(mainWindowMock.show).not.toHaveBeenCalled();

    callClick(quitMenuItem);
    expect(app.quit).toHaveBeenCalled();
});

test('Should show window on tray click', async () => {
    await createTray(
        browserWindow,
        vi.fn(async () => undefined),
        showMainWindow,
        vi.fn(async () => []),
    );

    // Check that the event handler was registered
    expect(mockTrayInstance.on).toHaveBeenCalledWith(
        'click',
        expect.any(Function),
    );

    // Extract the handler function
    const onMock = vi.mocked(mockTrayInstance.on);
    const clickHandlerCall = onMock.mock.calls.find(
        ([event]) => event === 'click',
    );

    // Make sure the handler was found
    expect(clickHandlerCall).toBeDefined();

    // Call the handler
    if (clickHandlerCall) {
        const clickHandler = clickHandlerCall[1] as (
            ...args: unknown[]
        ) => unknown;
        // Mock popUpContextMenu since it's called by the handler
        mockTrayInstance.popUpContextMenu.mockImplementation(() => {});

        // Call the click handler
        await clickHandler();

        // Since it's darwin, it should try to pop up context menu not show window directly
        expect(mockTrayInstance.popUpContextMenu).toHaveBeenCalled();
    }
});

test('Should show recently opened invalid projects as disabled', async () => {
    const buildFromTemplateMock = vi.mocked(ElectronMenu.buildFromTemplate);
    let capturedTemplate: Array<MenuItemConstructorOptions | MenuItem> = [];
    buildFromTemplateMock.mockImplementation((template) => {
        capturedTemplate = template;
        return mockMenu as unknown as ElectronMenuType;
    });
    const launchProject = vi.fn(async () => undefined);
    const invalidProject = {
        name: 'Missing Editor',
        path: '/projects/missing-editor',
        valid: false,
        last_opened: new Date('2026-08-19T10:00:00.000Z'),
    } as ProjectDetails;

    await createTray(
        browserWindow,
        launchProject,
        showMainWindow,
        vi.fn(async () => [invalidProject]),
    );

    const { updateMenu } = await import('./tray.helper.js');
    await updateMenu(trayInstance, browserWindow);

    const invalidItem = capturedTemplate.find(
        (item) => 'label' in item && item.label === 'Missing Editor (Invalid)',
    );
    expect(invalidItem).toMatchObject({ enabled: false });

    const handler = (invalidItem as { click?: () => Promise<void> })?.click;
    await handler?.();
    expect(launchProject).not.toHaveBeenCalled();
});
