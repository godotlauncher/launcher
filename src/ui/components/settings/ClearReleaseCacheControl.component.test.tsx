import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClearReleaseCacheControl } from './ClearReleaseCacheControl.component';

const STORAGE_KEY = 'gdlauncher.clearReleaseCache.lastClearedAt';

vi.mock('react-i18next', () => {
    const dictionary: Record<string, string> = {
        'settings:behavior.clearReleaseCache.title': 'Clear release cache',
        'settings:behavior.clearReleaseCache.description': 'Delete cached release metadata and fetch the latest builds from GitHub.',
        'settings:behavior.clearReleaseCache.cta': 'Clear cache',
        'settings:behavior.clearReleaseCache.clearing': 'Clearing...',
        'settings:behavior.clearReleaseCache.cooldownNotice': 'Cache clearing is temporarily disabled to avoid hitting GitHub rate limits.',
    };

    return {
        useTranslation: (namespace?: string) => ({
            t: (key: string, opts?: { ns?: string }) => {
                const resolvedNamespace = opts?.ns ?? namespace;
                const dictKey = resolvedNamespace ? `${resolvedNamespace}:${key}` : key;
                return dictionary[dictKey] ?? key;
            },
        }),
    };
});

const addAlertMock = vi.fn();
const clearReleaseCacheMock = vi.fn();
const refreshAvailableReleasesMock = vi.fn();

vi.mock('../../hooks/useAlerts', () => ({
    useAlerts: () => ({
        addAlert: addAlertMock,
        clearAlerts: vi.fn(),
        closeAlert: vi.fn(),
        addConfirm: vi.fn(),
        addCustomConfirm: vi.fn(),
    }),
}));

vi.mock('../../hooks/useRelease', () => ({
    useRelease: () => ({
        clearReleaseCache: clearReleaseCacheMock,
        refreshAvailableReleases: refreshAvailableReleasesMock,
        loading: false,
    }),
}));

vi.mock('electron-log', () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

describe('ClearReleaseCacheControl', () => {
    const store = new Map<string, string>();

    beforeEach(() => {
        addAlertMock.mockReset();
        clearReleaseCacheMock.mockReset();
        refreshAvailableReleasesMock.mockReset();
        store.clear();
        (globalThis as unknown as { window: Partial<Window> }).window = {
            localStorage: {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    store.set(key, value);
                },
                removeItem: (key: string) => {
                    store.delete(key);
                },
                clear: () => store.clear(),
            } as Storage,
            setInterval: setInterval.bind(globalThis),
            clearInterval: clearInterval.bind(globalThis),
        };
    });

    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (globalThis as { window?: Partial<Window> }).window;
    });

    it('renders an enabled button when no cooldown is stored', () => {
        const html = renderToStaticMarkup(
            <ClearReleaseCacheControl />
        );

        expect(html).toContain('Clear cache');
        expect(html).not.toContain('(');
        expect(html).not.toContain('disabled');
        expect(html).not.toContain('Cache clearing is temporarily disabled');
    });

    it('renders cooldown messaging when a recent timestamp exists', () => {
        const now = Date.now();
        const thirtySecondsAgo = now - 30_000;
        (globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem(STORAGE_KEY, thirtySecondsAgo.toString());

        const html = renderToStaticMarkup(
            <ClearReleaseCacheControl />
        );

        expect(html).toContain('disabled');
        expect(html).toContain('(30)');
        expect(html).toContain('Cache clearing is temporarily disabled');
    });
});
