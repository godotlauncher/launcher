import { describe, expect, it, vi } from 'vitest';
import { validateEventFrame } from './utils';

// Mock imported modules
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
    ipcMain: {
        on: vi.fn(),
        handle: vi.fn(),
    },
    app: {
        isPackaged: false,
        getName: vi.fn(),
        getVersion: vi.fn(() => '1.0.0'),
        getLocale: vi.fn(),
        getPath: vi.fn(),
        on: vi.fn(),
        whenReady: vi.fn(),
        quit: vi.fn(),
        getAppPath: vi.fn(),
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
    nativeImage: {
        createFromPath: vi.fn(() => ({
            resize: vi.fn(() => ({})),
        })),
    },
    nativeTheme: {
        shouldUseDarkColors: false,
    },
    WebFrameMain: class {
        url: string = '';
        constructor(url: string = '') {
            this.url = url;
        }
    },
}));

describe('Utils', () => {
    describe('Validation', async () => {
        it('should error without a frame', () => {
            expect(() => validateEventFrame(null)).toThrowError(
                /Invalid Frame/i,
            );
        });

        it('should return undefined if dev and localhost:5123', () => {
            vi.stubEnv('NODE_ENV', 'development');
            const frame = {
                url: 'http://localhost:5123',
            };

            expect(validateEventFrame(frame as any)).toBeUndefined();
        });

        it('should throw if not dev and localhost:5123', () => {
            vi.stubEnv('NODE_ENV', 'production');
            const frame = {
                url: 'http://localhost:5123',
            };

            expect(() => validateEventFrame(frame as any)).toThrow();
        });

        it('should throw if dev and not localhost:5123', () => {
            vi.stubEnv('NODE_ENV', 'development');
            const frame = {
                url: 'http://localhost:123',
            };

            expect(() => validateEventFrame(frame as any)).toThrow();
        });

        it('it should throw if not dev and path is not file://', () => {
            vi.stubEnv('NODE_ENV', 'production');
            const frame = {
                url: 'file://localhost:5123',
            };

            expect(() => validateEventFrame(frame as any)).toThrow();
        });
    });
});
