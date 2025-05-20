import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { createProjectFile, getProjectDefinition } from './godot.utils.js';

// Mock electron-updater
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

// Mock electron
vi.mock('electron', () => ({
    Menu: {
        setApplicationMenu: vi.fn()
    },
    app: {
        getAppPath: vi.fn(() => '/app/path'),
        isPackaged: false,
        getName: vi.fn(),
        getVersion: vi.fn(() => '1.0.0'),
        getLocale: vi.fn(),
        getPath: vi.fn(),
        on: vi.fn(),
        whenReady: vi.fn(),
        quit: vi.fn(),
        requestSingleInstanceLock: vi.fn(() => true),
        dock: {
            show: vi.fn(),
            hide: vi.fn()
        }
    },
    BrowserWindow: vi.fn(),
    shell: {
        showItemInFolder: vi.fn(),
        openExternal: vi.fn()
    },
    dialog: {
        showOpenDialog: vi.fn(),
        showMessageBox: vi.fn()
    }
}));



describe(' Godot Utils ', () => {

    describe('Project template for version 5', () => {
        it('should render forward plus godot project file', async () => {
            const templateDir = path.resolve('src/assets/templates/');
            const projectFile = await createProjectFile(templateDir, 5, 4.4, 'test', 'FORWARD_PLUS');
            expect(projectFile).toBeDefined();
            expect(
                projectFile
                    .replaceAll("\r\n", "\n")
                    .replaceAll("\n", ""))
                .toMatch(`config_version=5[application]config/name="test"config/features=PackedStringArray("4.4")config/icon="res://assets/icon.svg"`);
        });

        it('should render mobile godot project file', async () => {
            const templateDir = path.resolve('src/assets/templates/');
            const projectFile = await createProjectFile(templateDir, 5, 4.4, 'test', 'MOBILE');
            expect(projectFile).toBeDefined();
            expect(
                projectFile
                    .replaceAll("\r\n", "\n")
                    .replaceAll("\n", ""))
                .toMatch(`config_version=5[application]config/name="test"config/features=PackedStringArray("4.4")config/icon="res://assets/icon.svg"[rendering]renderer/rendering_method="mobile"`);
        });

        it('should render gl compatibility godot project file', async () => {
            const templateDir = path.resolve('src/assets/templates/');
            const projectFile = await createProjectFile(templateDir, 5, 4.4, 'test', 'COMPATIBLE');
            expect(projectFile).toBeDefined();
            expect(
                projectFile
                    .replaceAll("\r\n", "\n")
                    .replaceAll("\n", ""))
                .toMatch(`config_version=5[application]config/name="test"config/features=PackedStringArray("4.4")config/icon="res://assets/icon.svg"[rendering]renderer/rendering_method="gl_compatibility"renderer/rendering_method.mobile="gl_compatibility"`);
        });

    });



    describe("Get the correct project definition", () => {
        it("should get the exact project definition for version if exist ", () => {
            const projectDefinition = getProjectDefinition(3.0);
            expect(projectDefinition).toBeNull();
        });


        it("should get the closest project definition for version if not exist ", () => {
            const projectDefinition = getProjectDefinition(4.4);
            expect(projectDefinition).toBeDefined();
            expect(projectDefinition!.configVersion).toBe(5);
            expect(projectDefinition!.defaultRenderer).toBe("FORWARD_PLUS");
            expect(projectDefinition!.resources).toEqual([{
                "dst": "assets/icon.svg",
                "src": "icon.svg",
            }]);
            expect(projectDefinition!.projectFilename).toBe("project.godot");
        });

        it("should get the closest project definition for version if not exist ", () => {
            const projectDefinition = getProjectDefinition(4.0);
            expect(projectDefinition).toBeDefined();
            expect(projectDefinition!.configVersion).toBe(5);
            expect(projectDefinition!.defaultRenderer).toBe("FORWARD_PLUS");
            expect(projectDefinition!.resources).toEqual([{
                "dst": "assets/icon.svg",
                "src": "icon.svg",
            }]);
            expect(projectDefinition!.projectFilename).toBe("project.godot");
        });

    });
});
