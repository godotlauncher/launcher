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
