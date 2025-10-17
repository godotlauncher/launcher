import { expect, Mock, test, vi, beforeEach } from 'vitest';
import { createTray } from "./tray.helper.js";
import path from 'node:path';

// Define platform before mocks
Object.defineProperty(process, 'platform', {
    value: 'darwin'
});

// Mock the path module
vi.mock('node:path', () => ({
    resolve: vi.fn().mockReturnValue('/some/path'),
    join: vi.fn().mockReturnValue('/some/path')
}));

// Mock the modules imported by tray.helper.ts
vi.mock('../pathResolver.js', () => ({
    getAssetPath: vi.fn().mockReturnValue('/assets')
}));

vi.mock('../utils/projects.utils.js', () => ({
    getStoredProjectsList: vi.fn().mockResolvedValue([])
}));

vi.mock('../utils/prefs.utils.js', () => ({
    getConfigDir: vi.fn().mockReturnValue('/config/dir')
}));

vi.mock('../constants.js', () => ({
    PROJECTS_FILENAME: 'projects.json'
}));

vi.mock('../commands/projects.js', () => ({
    launchProject: vi.fn()
}));

vi.mock('../i18n/index.js', () => {
    const translations = {
        'menus:tray.recentProjects': 'Recent Projects',
        'menus:tray.showGodotLauncher': 'Show Godot Launcher',
        'menus:tray.quit': 'Quit',
    } as const;

    return {
        t: vi.fn((key: string) => translations[key as keyof typeof translations] ?? key),
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
            currentVersion: '1.0.0'
        }
    },
    UpdateCheckResult: {}
}));

// Create a mock menu instance that we can control
const mockMenu = {
    popup: vi.fn()
};

// Create a mock for the Tray class and its instance
const mockTrayInstance = {
    setContextMenu: vi.fn(),
    setToolTip: vi.fn(),
    on: vi.fn(),
    popUpContextMenu: vi.fn()
};

// Create a mock for electron
vi.mock("electron", () => {
    // Mock Menu.buildFromTemplate to return a menu
    const buildFromTemplate = vi.fn().mockImplementation((template) => {
        // Store the template in a closure variable for later access
        (buildFromTemplate as any).mockTemplate = template;
        return mockMenu;
    });

    return {
        Tray: vi.fn().mockImplementation(() => mockTrayInstance),
        app: {
            getAppPath: vi.fn().mockReturnValue("/"),
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
            }
        },
        Menu: {
            buildFromTemplate,
            setApplicationMenu: vi.fn()
        },
        BrowserWindow: vi.fn(),
        shell: {
            showItemInFolder: vi.fn(),
            openExternal: vi.fn()
        },
        dialog: {
            showOpenDialog: vi.fn(),
            showMessageBox: vi.fn()
        },
    };
});

// Import electron after mocking
const electron = await import('electron');
const { Menu, app } = electron;

const mainWindow = {
    show: vi.fn(),
    isVisible: vi.fn().mockReturnValue(false)
};

beforeEach(() => {
    vi.clearAllMocks();
});

test("Should have tray menu with show and quit", async () => {
    // Mock implementation for Menu.buildFromTemplate to capture the template
    let capturedTemplate: any[] = [];
    (Menu.buildFromTemplate as any).mockImplementation((template: any[]) => {
        capturedTemplate = template;
        return mockMenu;
    });

    await createTray(mainWindow as any);

    // Mac platform will not show menu on load but Linux would
    // Force call updateMenu to test template creation
    const { updateMenu } = await import("./tray.helper.js");
    await updateMenu(mockTrayInstance as any, mainWindow as any);

    // Verify the template structure
    expect(capturedTemplate.length).toBeGreaterThan(0);

    // Find the relevant menu items for testing
    const showMenuItem = capturedTemplate.find((item) => item.label === "Show Godot Launcher");
    const separatorItem = capturedTemplate.find((item) => item.type === "separator");
    const quitMenuItem = capturedTemplate.find((item) => item.label === "Quit");

    // Verify they exist
    expect(showMenuItem).toBeDefined();
    expect(separatorItem).toBeDefined();
    expect(quitMenuItem).toBeDefined();

    // Test the click handlers
    showMenuItem?.click?.();
    expect(mainWindow.show).toHaveBeenCalled();
    expect(app.dock?.show).toHaveBeenCalled();

    quitMenuItem?.click?.();
    expect(app.quit).toHaveBeenCalled();
});

test("Should show window on tray click", async () => {
    await createTray(mainWindow as any);

    // Check that the event handler was registered
    expect(mockTrayInstance.on).toHaveBeenCalledWith('click', expect.any(Function));

    // Extract the handler function
    const clickHandlerCall = (mockTrayInstance.on as any).mock.calls.find(
        call => call[0] === 'click'
    );

    // Make sure the handler was found
    expect(clickHandlerCall).toBeDefined();

    // Call the handler
    if (clickHandlerCall) {
        const clickHandler = clickHandlerCall[1];
        // Mock popUpContextMenu since it's called by the handler
        mockTrayInstance.popUpContextMenu.mockImplementation(() => { });

        // Call the click handler
        await clickHandler();

        // Since it's darwin, it should try to pop up context menu not show window directly
        expect(mockTrayInstance.popUpContextMenu).toHaveBeenCalled();
    }
});
