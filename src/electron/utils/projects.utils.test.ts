import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    __resetProjectsStoreForTesting,
    addProjectToList,
    getStoredProjectsList,
    removeProjectFromList,
    storeProjectsList,
} from './projects.utils.js';

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

vi.mock('electron', () => ({
    Menu: {
        setApplicationMenu: vi.fn(),
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
            hide: vi.fn(),
        },
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
}));

describe('projects.utils', () => {
    const tmpRoot = path.join(os.tmpdir(), 'godot-launcher-projects-tests');
    let projectsFile: string;

    beforeEach(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
        fs.mkdirSync(tmpRoot, { recursive: true });
        projectsFile = path.join(tmpRoot, 'projects.json');
        __resetProjectsStoreForTesting();
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
        __resetProjectsStoreForTesting();
    });

    it('normalises last_opened values and sorts consistently', async () => {
        await storeProjectsList(projectsFile, []);

        await addProjectToList(projectsFile, {
            name: 'First Project',
            path: '/projects/first',
            editor_settings_file: '',
            editor_settings_path: '',
            last_opened: null,
            config_version: 5,
            launch_path: '',
            renderer: 'forward_plus',
            valid: true,
            version_number: 4,
            version: '4.2.0',
            withGit: false,
            withVSCode: false,
            open_windowed: false,
            release: {
                version: '4.2.0',
                version_number: 40200,
                renderer: 'forward_plus',
                launch_path: '',
                editor_path: '',
                install_path: '',
                arch: 'x86_64',
                config_version: 5,
                platform: 'linux',
                prerelease: false,
                published_at: '2024-01-01T00:00:00.000Z',
                mono: false,
                valid: true,
            },
        } as ProjectDetails);

        await addProjectToList(projectsFile, {
            name: 'Second Project',
            path: '/projects/second',
            editor_settings_file: '',
            editor_settings_path: '',
            last_opened: new Date('2024-01-01T00:00:00.000Z'),
            config_version: 5,
            launch_path: '',
            renderer: 'forward_plus',
            valid: true,
            version_number: 4,
            version: '4.1.0',
            withGit: false,
            withVSCode: false,
            open_windowed: false,
            release: {
                version: '4.1.0',
                version_number: 4,
                arch: 'x86_64',
                config_version: 5,
                platform: 'linux',
                prerelease: false,
                published_at: '2023-12-01T00:00:00.000Z',
                renderer: 'forward_plus',
                launch_path: '',
                editor_path: '',
                install_path: '',
                mono: false,
                valid: true,
            },
        } as ProjectDetails);

        const projects = await getStoredProjectsList(projectsFile);
        expect(projects).toHaveLength(2);
        expect(projects[0].path).toBe('/projects/second');
        expect(projects[0].last_opened).toBeInstanceOf(Date);
        expect(projects[1].last_opened).toBeInstanceOf(Date);
    });

    it('removes projects by path', async () => {
        await storeProjectsList(projectsFile, [
            {
                name: 'Keep',
                path: '/projects/keep',
                editor_settings_file: '',
                editor_settings_path: '',
                last_opened: null,
                config_version: 5,
                launch_path: '',
                renderer: 'forward_plus',
                valid: true,
                version_number: 4,
                version: '4.2.0',
                withGit: false,
                withVSCode: false,
                open_windowed: false,
                release: {
                    version: '4.2.0',
                    version_number: 4,
                    arch: 'x86_64',
                    config_version: 5,
                    platform: 'linux',
                    prerelease: false,
                    published_at: '2024-01-01T00:00:00.000Z',
                    editor_path: '',
                    install_path: '',
                    mono: false,
                    valid: true,
                },
            },
            {
                name: 'Remove',
                path: '/projects/remove',
                editor_settings_file: '',
                editor_settings_path: '',
                last_opened: null,
                config_version: 5,
                launch_path: '',
                renderer: 'forward_plus',
                valid: true,
                version_number: 4,
                version: '4.2.0',
                withGit: false,
                withVSCode: false,
                open_windowed: false,
                release: {
                    version: '4.2.0',
                    version_number: 4,
                    arch: 'x86_64',
                    config_version: 5,
                    platform: 'linux',
                    prerelease: false,
                    published_at: '2024-01-01T00:00:00.000Z',
                    launch_path: '',
                    editor_path: '',
                    install_path: '',
                    mono: false,
                    valid: true,
                },
            },
        ] as ProjectDetails[]);

        const updated = await removeProjectFromList(
            projectsFile,
            '/projects/remove',
        );
        expect(updated).toHaveLength(1);
        expect(updated[0].path).toBe('/projects/keep');
    });
});
