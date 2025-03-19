import { expect, Mock, test, vi } from 'vitest';
import { createTray } from "./tray.helper.js";
import { app, BrowserWindow, Menu, Tray } from "electron";

vi.mock("electron", () => {
    return {
        Tray: vi.fn().mockReturnValue({
            setContextMenu: vi.fn(),
            setToolTip: vi.fn(),
            on: vi.fn(),
        }),
        app: {
            getAppPath: vi.fn().mockReturnValue("/"),
            quit: vi.fn(),
            dock: {
                show: vi.fn(),
                hide: vi.fn(),
            }
        },
        Menu: {
            buildFromTemplate: vi.fn(),
        },
    };

});

const mainWindow = {
    show: vi.fn(),
    isVisible: vi.fn().mockReturnValue(false),

} satisfies Partial<BrowserWindow> as any as BrowserWindow;

test("Should have tray menu with show and quit", async () => {
    createTray(mainWindow);

    const calls = (Menu.buildFromTemplate as any as Mock).mock.calls;
    const args = calls[0] as Parameters<typeof Menu.buildFromTemplate>;

    const template = args[0];
    expect(template.length).gte(3);
    expect(template[0]).toMatchObject({ label: "Show Godot Launcher" });
    expect(template[1]).toMatchObject({ type: "separator" });
    expect(template[2]).toMatchObject({ label: "Quit" });

    const show = template[0];
    show.click?.(null as any, null as any, null as any);
    expect(mainWindow.show).toHaveBeenCalled();
    expect(app.dock?.show).toHaveBeenCalled();

    expect(template[1]).toMatchObject({ type: "separator" });

    const quit = template[2];
    quit.click?.(null as any, null as any, null as any);
    expect(app.quit).toHaveBeenCalled();

    expect(Menu.buildFromTemplate).toHaveBeenCalled();

});

test("Should show window on tray click", async () => {
    const tray = createTray(mainWindow);

    expect(tray.on).toHaveBeenCalled();
    const click = (tray.on as any as Mock).mock.calls[0][1] as () => void;
    click();
    expect(mainWindow.show).toHaveBeenCalled();
    expect(app.dock?.show).toHaveBeenCalled();
});
