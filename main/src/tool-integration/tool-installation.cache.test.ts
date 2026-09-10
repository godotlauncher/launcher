import { describe, expect, it, vi } from 'vitest';
import { ToolInstallationCache } from './tool-installation.cache.js';
import type { ToolIntegrationRegistry } from './tool-integration.registry.js';
import type { ToolIntegrationStore } from './tool-integration.store.js';
import type {
    ToolInstallation,
    ToolIntegration,
    ToolSettings,
} from './tool-integration.types.js';

const settings: ToolSettings = {
    enabled: true,
    executablePathOverride: null,
    executableArgsOverride: null,
};

const installation: ToolInstallation = {
    executablePath: '/tools/example',
    executableArgs: [],
    version: '1.0.0',
    source: 'detected',
};

/** Creates a promise whose completion the test controls. */
function createDeferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

/**
 * Creates an isolated cache with mocked provider and persistence boundaries.
 *
 * @param integrationOverrides - Provider methods to replace.
 * @returns Cache and its mocked collaborators.
 */
function createCache(integrationOverrides: Partial<ToolIntegration> = {}): {
    cache: ToolInstallationCache;
    integration: ToolIntegration;
    settingsStore: ToolIntegrationStore;
} {
    const integration: ToolIntegration = {
        metadata: { id: 'example', displayName: 'Example', order: 10 },
        detectInstallation: vi.fn().mockResolvedValue(installation),
        validateInstallation: vi.fn().mockResolvedValue(installation),
        ...integrationOverrides,
    };
    const registry = {
        get: vi.fn(() => integration),
    } as unknown as ToolIntegrationRegistry;
    const settingsStore = {
        get: vi.fn().mockResolvedValue(settings),
        getDetectedInstallation: vi.fn().mockResolvedValue(undefined),
        setDetectedInstallation: vi.fn().mockResolvedValue(undefined),
    } as unknown as ToolIntegrationStore;

    return {
        cache: new ToolInstallationCache(registry, settingsStore),
        integration,
        settingsStore,
    };
}

describe('ToolInstallationCache', () => {
    it('does not scan while reading an empty snapshot', async () => {
        const { cache, integration } = createCache();

        await expect(cache.getSnapshot('example', settings)).resolves.toEqual({
            installation: null,
            status: 'unchecked',
            checkedAt: null,
        });
        expect(integration.detectInstallation).not.toHaveBeenCalled();
    });

    it('shares one explicit scan among concurrent callers', async () => {
        const { cache, integration } = createCache();

        const [first, second] = await Promise.all([
            cache.rescan('example', settings),
            cache.rescan('example', settings),
        ]);

        expect(first.status).toBe('available');
        expect(second).toEqual(first);
        expect(integration.detectInstallation).toHaveBeenCalledOnce();
        expect(integration.validateInstallation).toHaveBeenCalledOnce();
    });

    it('retries an invalidated scan in the latest generation without persisting its stale result', async () => {
        const staleInstallation: ToolInstallation = {
            ...installation,
            executablePath: '/tools/stale',
        };
        const currentInstallation: ToolInstallation = {
            ...installation,
            executablePath: '/tools/current',
        };
        const staleDetection = createDeferred<ToolInstallation | null>();
        let persistedInstallation: ToolInstallation | null = null;
        const { cache, integration, settingsStore } = createCache({
            detectInstallation: vi
                .fn()
                .mockImplementationOnce(() => staleDetection.promise)
                .mockResolvedValue(currentInstallation),
            validateInstallation: vi.fn(
                async (candidate: ToolInstallation) => candidate,
            ),
        });
        vi.mocked(settingsStore.setDetectedInstallation).mockImplementation(
            async (_toolId, candidate) => {
                persistedInstallation = candidate;
            },
        );

        const staleScan = cache.rescan('example', settings);
        expect(integration.detectInstallation).toHaveBeenCalledOnce();

        cache.invalidate('example');
        await expect(cache.rescan('example', settings)).resolves.toMatchObject({
            installation: currentInstallation,
            status: 'available',
        });
        expect(integration.detectInstallation).toHaveBeenCalledTimes(2);

        staleDetection.resolve(staleInstallation);
        await expect(staleScan).resolves.toMatchObject({
            installation: currentInstallation,
            status: 'available',
        });

        await expect(
            cache.getSnapshot('example', settings),
        ).resolves.toMatchObject({
            installation: currentInstallation,
            status: 'available',
        });
        expect(persistedInstallation).toEqual(currentInstallation);
        expect(integration.detectInstallation).toHaveBeenCalledTimes(3);
        expect(settingsStore.setDetectedInstallation).toHaveBeenCalledWith(
            'example',
            currentInstallation,
            expect.any(Number),
            expect.any(String),
        );
        expect(settingsStore.setDetectedInstallation).not.toHaveBeenCalledWith(
            'example',
            staleInstallation,
            expect.any(Number),
            expect.any(String),
        );
    });

    it('queues a newer persisted result behind an older write already in progress', async () => {
        const staleInstallation: ToolInstallation = {
            ...installation,
            executablePath: '/tools/stale',
        };
        const currentInstallation: ToolInstallation = {
            ...installation,
            executablePath: '/tools/current',
        };
        const stalePersistence = createDeferred<void>();
        let persistedInstallation: ToolInstallation | null = null;
        const { cache, settingsStore } = createCache({
            detectInstallation: vi
                .fn()
                .mockResolvedValueOnce(staleInstallation)
                .mockResolvedValue(currentInstallation),
            validateInstallation: vi.fn(
                async (candidate: ToolInstallation) => candidate,
            ),
        });
        vi.mocked(settingsStore.setDetectedInstallation)
            .mockImplementationOnce(async (_toolId, candidate) => {
                await stalePersistence.promise;
                persistedInstallation = candidate;
            })
            .mockImplementation(async (_toolId, candidate) => {
                persistedInstallation = candidate;
            });

        const staleScan = cache.rescan('example', settings);
        await vi.waitFor(() => {
            expect(
                settingsStore.setDetectedInstallation,
            ).toHaveBeenCalledOnce();
        });

        cache.invalidate('example');
        const currentScan = cache.rescan('example', settings);
        await vi.waitFor(() => {
            expect(
                settingsStore.setDetectedInstallation,
            ).toHaveBeenCalledOnce();
        });

        stalePersistence.resolve();
        await expect(currentScan).resolves.toMatchObject({
            installation: currentInstallation,
            status: 'available',
        });
        await expect(staleScan).resolves.toMatchObject({
            installation: currentInstallation,
            status: 'available',
        });

        expect(persistedInstallation).toEqual(currentInstallation);
    });

    it('revalidates immediately before use', async () => {
        const { cache, integration } = createCache();
        await cache.rescan('example', settings);

        await expect(
            cache.requireAvailable('example', settings),
        ).resolves.toMatchObject({
            installation,
            status: 'available',
        });
        expect(integration.validateInstallation).toHaveBeenCalledTimes(2);
    });

    it('does not fall back when an explicit executable path is invalid', async () => {
        const invalidSettings: ToolSettings = {
            ...settings,
            executablePathOverride: '/invalid/tool',
        };
        const { cache, integration } = createCache({
            detectInstallation: vi.fn().mockResolvedValue(null),
        });

        await expect(
            cache.rescan('example', invalidSettings),
        ).resolves.toMatchObject({
            installation: null,
            status: 'invalid',
        });
        expect(integration.detectInstallation).toHaveBeenCalledOnce();
    });

    it('bounds repeated execution checks after a negative scan', async () => {
        const { cache, integration } = createCache({
            detectInstallation: vi.fn().mockResolvedValue(null),
        });
        await cache.rescan('example', settings);

        await expect(
            cache.requireAvailable('example', settings),
        ).resolves.toMatchObject({
            installation: null,
            status: 'missing',
        });
        expect(integration.detectInstallation).toHaveBeenCalledOnce();
    });
});
