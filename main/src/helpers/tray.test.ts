import type { ProjectDetails } from '@shared/contracts';
import type {
    BrowserWindow,
    Menu as ElectronMenuType,
    MenuItem,
    MenuItemConstructorOptions,
    Tray,
} from 'electron';
import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { createTray, updateLinuxTray, updateMenu } from './tray.helper.js';

// Define platform before mocks
const originalPlatform = process.platform;
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

vi.mock('electron-log', () => ({
    default: { warn: vi.fn() },
}));

vi.mock('../i18n/index.js', () => {
    const translations = {
        'menus:tray.pinnedProjects': 'Pinned Projects',
        'menus:tray.moreProjects': 'More...',
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
        isDestroyed: vi.fn(() => false),
        setToolTip: vi.fn(),
        on: vi.fn(),
        popUpContextMenu: vi.fn(),
    };

    const TrayMock = vi.fn(function createTrayMock() {
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
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockTrayInstance.isDestroyed.mockReturnValue(false);
});

afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
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

/**
 * Creates a project whose tray fields can be overridden for one scenario.
 * @param name - Display name and unique path suffix.
 * @param fields - Fields relevant to the scenario.
 */
function project(name: string, fields: Partial<ProjectDetails> = {}) {
    return {
        name,
        path: `/projects/${name}`,
        valid: true,
        last_opened: null,
        ...fields,
    } as ProjectDetails;
}

/**
 * Builds the menu through the same callbacks as the application lifecycle.
 * @param projects - Stored projects offered to the tray.
 */
async function buildMenu(projects: ProjectDetails[]) {
    const launchProject = vi.fn(async () => undefined);
    await createTray(
        browserWindow,
        launchProject,
        showMainWindow,
        vi.fn(async () => projects),
    );
    await updateMenu(trayInstance, browserWindow);
    const template = vi
        .mocked(ElectronMenu.buildFromTemplate)
        .mock.calls.at(-1)?.[0] as MenuItemConstructorOptions[];
    return { template, launchProject };
}

test('shows never-opened pins in saved order before recents', async () => {
    const { template } = await buildMenu([
        project('Third', { pinned: true, pinned_order: 2 }),
        project('Recent', { last_opened: new Date(500) }),
        project('First', { pinned: true, pinned_order: 0 }),
        project('Second', { pinned: true, pinned_order: 1 }),
    ]);
    expect(template.map((item) => item.label ?? item.type)).toEqual([
        'Pinned Projects',
        'First',
        'Second',
        'Third',
        'separator',
        'Recent Projects',
        'Recent',
        'separator',
        'Show Godot Launcher',
        'separator',
        'Quit',
    ]);
});

test('excludes only visible pins and fills the recent section from remaining projects', async () => {
    const pins = [0, 1, 2, 3, 4].map((order) =>
        project(`Pin ${order}`, {
            pinned: true,
            pinned_order: order,
            last_opened: new Date(1000 - order),
        }),
    );
    const { template } = await buildMenu([
        ...pins.toReversed(),
        project('Oldest', { last_opened: new Date(100) }),
        project('Recent', { last_opened: new Date(200) }),
    ]);
    const more = template.find((item) => item.label === 'More...');
    expect(
        ((more?.submenu ?? []) as MenuItemConstructorOptions[]).map(
            (item) => item.label,
        ),
    ).toEqual(['Pin 3', 'Pin 4']);
    const recentIndex = template.findIndex(
        (item) => item.label === 'Recent Projects',
    );
    expect(
        template
            .slice(recentIndex + 1, recentIndex + 4)
            .map((item) => item.label),
    ).toEqual(['Pin 3', 'Pin 4', 'Recent']);
});

test.each([0, 1, 3, 4, 7])(
    'only shows overflow when %i pins exceed the main menu limit',
    async (count) => {
        const { template } = await buildMenu(
            Array.from({ length: count }, (_, order) =>
                project(`Pin ${order}`, { pinned: true, pinned_order: order }),
            ),
        );
        expect(template.some((item) => item.label === 'Pinned Projects')).toBe(
            count > 0,
        );
        expect(template.some((item) => item.label === 'Recent Projects')).toBe(
            false,
        );
        const more = template.find((item) => item.label === 'More...');
        if (count > 3) {
            expect(more?.submenu).toHaveLength(count - 3);
        } else {
            expect(more).toBeUndefined();
        }
        if (count === 0) {
            expect(template.map((item) => item.label ?? item.type)).toEqual([
                'Show Godot Launcher',
                'separator',
                'Quit',
            ]);
        }
    },
);

test('uses the existing date and name fallback for missing or invalid pin order', async () => {
    const { template } = await buildMenu([
        project('Zulu', { pinned: true, pinned_order: -1 }),
        project('Alpha', { pinned: true }),
        project('Recent Legacy', { pinned: true, last_opened: new Date(10) }),
        project('Saved', { pinned: true, pinned_order: 0 }),
    ]);
    expect(template.slice(1, 4).map((item) => item.label)).toEqual([
        'Saved',
        'Recent Legacy',
        'Alpha',
    ]);
    const more = template.find((item) => item.label === 'More...');
    expect(
        ((more?.submenu ?? []) as MenuItemConstructorOptions[])[0].label,
    ).toBe('Zulu');
});

test('keeps invalid pins, overflow and recents disabled and launches valid overflow projects', async () => {
    const pins = [0, 1, 2, 3, 4].map((order) =>
        project(`Pin ${order}`, {
            pinned: true,
            pinned_order: order,
            valid: order !== 0 && order !== 3,
        }),
    );
    const { template, launchProject } = await buildMenu([
        ...pins,
        project('Invalid Recent', { valid: false, last_opened: new Date(100) }),
    ]);
    const overflow = template.find((item) => item.label === 'More...')
        ?.submenu as MenuItemConstructorOptions[];
    const actions = [...template, ...overflow];
    for (const label of [
        'Pin 0 (Invalid)',
        'Pin 3 (Invalid)',
        'Invalid Recent (Invalid)',
    ]) {
        const action = actions.find((item) => item.label === label);
        expect(action).toMatchObject({ enabled: false });
        const click = action?.click as unknown as
            | (() => Promise<void>)
            | undefined;
        expect(click).toBeTypeOf('function');
        await click?.();
    }
    expect(launchProject).not.toHaveBeenCalled();
    await (overflow[1].click as unknown as () => Promise<void>)();
    expect(launchProject).toHaveBeenCalledExactlyOnceWith(pins[4]);
});

test('hides recents when all recently opened projects are visible pins', async () => {
    const { template } = await buildMenu([
        project('Only', {
            pinned: true,
            pinned_order: 0,
            last_opened: new Date(100),
        }),
    ]);
    expect(template.some((item) => item.label === 'Recent Projects')).toBe(
        false,
    );
});

test.each(['darwin', 'win32'])(
    'rebuilds from current project data when the menu opens on %s',
    async (platform) => {
        Object.defineProperty(process, 'platform', { value: platform });
        let projects = [project('Before', { pinned: true, pinned_order: 0 })];
        await createTray(
            browserWindow,
            vi.fn(),
            showMainWindow,
            async () => projects,
        );
        const callback = mockTrayInstance.on.mock.calls.find(
            ([event]) => event === 'right-click',
        )?.[1];
        projects = [project('After', { pinned: true, pinned_order: 0 })];
        await callback?.();
        const template = vi
            .mocked(ElectronMenu.buildFromTemplate)
            .mock.calls.at(-1)?.[0];
        expect(template?.map((item) => item.label)).toContain('After');
        expect(template?.map((item) => item.label)).not.toContain('Before');
    },
);

test('ignores Linux refresh before the tray has been created', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    vi.resetModules();
    const freshModule = await import('./tray.helper.js');
    await expect(freshModule.updateLinuxTray()).resolves.toBeUndefined();
    expect(mockTrayInstance.setContextMenu).not.toHaveBeenCalled();
});

test('ignores a destroyed Linux tray', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const listProjects = vi.fn(async () => []);
    await createTray(browserWindow, vi.fn(), showMainWindow, listProjects);
    listProjects.mockClear();
    mockTrayInstance.isDestroyed.mockReturnValue(true);
    await updateLinuxTray();
    expect(listProjects).not.toHaveBeenCalled();
});

test('does not replace a newer Linux menu with a slower earlier rebuild', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    let finishEarlier!: (projects: ProjectDetails[]) => void;
    const listProjects = vi
        .fn<() => Promise<ProjectDetails[]>>()
        .mockResolvedValue([]);
    await createTray(browserWindow, vi.fn(), showMainWindow, listProjects);
    mockTrayInstance.setContextMenu.mockClear();
    listProjects.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finishEarlier = resolve;
            }),
    );
    const earlier = updateLinuxTray();
    listProjects.mockResolvedValueOnce([project('Latest', { pinned: true })]);
    await updateLinuxTray();
    expect(mockTrayInstance.setContextMenu).toHaveBeenCalledOnce();
    finishEarlier([project('Older', { pinned: true })]);
    await earlier;
    expect(mockTrayInstance.setContextMenu).toHaveBeenCalledOnce();
});

test('contains Linux menu failures so saved project changes can still succeed', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const listProjects = vi
        .fn<() => Promise<ProjectDetails[]>>()
        .mockResolvedValue([]);
    await createTray(browserWindow, vi.fn(), showMainWindow, listProjects);
    listProjects.mockRejectedValueOnce(new Error('menu unavailable'));
    await expect(updateLinuxTray()).resolves.toBeUndefined();
    mockTrayInstance.setContextMenu.mockImplementationOnce(() => {
        throw new Error('no tray host');
    });
    await expect(updateLinuxTray()).resolves.toBeUndefined();
});
