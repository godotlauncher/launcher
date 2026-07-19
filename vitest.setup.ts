import { vi } from 'vitest';

const loggerMock = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    initialize: vi.fn(),
    transports: {
        file: { level: 'info' },
        console: { level: 'info' },
    },
};

vi.mock('electron-log/main.js', () => ({
    default: loggerMock,
}));

vi.mock('electron-log/main', () => ({
    default: loggerMock,
}));
vi.mock('@mariodebono/di-electron/renderer', () => {
    type LegacyElectronApi = Record<string, (...args: unknown[]) => unknown>;
    type Listener = (...args: unknown[]) => void;

    const subscriptions = new WeakMap<Listener, () => void>();
    const subscriptionMethods = {
        'app-updates': 'subscribeAppUpdates',
        'projects-updated': 'subscribeProjects',
        'releases-updated': 'subscribeReleases',
        'release-install-progress': 'subscribeReleaseInstallProgress',
    } as const;

    function getLegacyElectronApi(): LegacyElectronApi {
        const electron = (
            globalThis as unknown as {
                window?: { electron?: LegacyElectronApi };
            }
        ).window?.electron;

        if (!electron) {
            throw new Error('Renderer bridge test double is not configured');
        }

        return electron;
    }

    return {
        createRendererBridge: () => ({
            app: new Proxy(
                {},
                {
                    get: (_target, property) => {
                        return (...args: unknown[]) => {
                            const method =
                                getLegacyElectronApi()[String(property)];
                            if (typeof method !== 'function') {
                                throw new Error(
                                    `Renderer bridge method ${String(property)} is not mocked`,
                                );
                            }
                            return method(...args);
                        };
                    },
                },
            ),
        }),
        createRendererEvents: () => ({
            on: (
                channel: keyof typeof subscriptionMethods,
                listener: Listener,
            ) => {
                const subscribe =
                    getLegacyElectronApi()[subscriptionMethods[channel]];
                const unsubscribe = subscribe((...args: unknown[]) => {
                    listener(...args);
                });
                if (typeof unsubscribe === 'function') {
                    subscriptions.set(listener, unsubscribe as () => void);
                }
            },
            off: (_channel: string, listener: Listener) => {
                subscriptions.get(listener)?.();
                subscriptions.delete(listener);
            },
        }),
        getPathForFile: (file: File) => {
            const method = getLegacyElectronApi().getPathForFile;
            return method(file);
        },
    };
});
