import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    buildFromTemplate: vi.fn(() => ({ id: 'application-menu' })),
    setApplicationMenu: vi.fn(),
}));

vi.mock('electron', () => ({
    Menu: {
        buildFromTemplate: mocks.buildFromTemplate,
        setApplicationMenu: mocks.setApplicationMenu,
    },
    shell: { showItemInFolder: vi.fn() },
}));

vi.mock('../i18n/index.js', () => ({ t: (key: string) => key }));
vi.mock('../utils/prefs.utils.js', () => ({
    getPrefsPath: vi.fn(async () => '/config/preferences.json'),
}));
vi.mock('../utils.js', () => ({ isDev: vi.fn(() => true) }));

import { createEditingMenu, createMenu } from './menu.helper.js';

describe('menu helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('includes native editing commands in the development menu', () => {
        createMenu({} as never);

        expect(mocks.buildFromTemplate).toHaveBeenCalledWith(
            expect.arrayContaining([{ role: 'editMenu' }]),
        );
    });

    it('installs a minimal native editing menu on macOS', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');

        createEditingMenu();

        expect(mocks.buildFromTemplate).toHaveBeenCalledWith([
            { role: 'appMenu' },
            { role: 'editMenu' },
        ]);
        expect(mocks.setApplicationMenu).toHaveBeenCalledWith({
            id: 'application-menu',
        });
    });

    it('keeps the application menu hidden on Windows and Linux', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

        createEditingMenu();

        expect(mocks.buildFromTemplate).not.toHaveBeenCalled();
        expect(mocks.setApplicationMenu).toHaveBeenCalledWith(null);
    });
});
