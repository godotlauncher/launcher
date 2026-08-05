import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeEditorInstallationCache } from './codeEditorInstallationCache.js';

vi.mock('./codeEditorIntegration.settingsStore.js', () => ({
    CodeEditorIntegrationSettingsStore: class {
        // Runtime placeholder for DI metadata; each test supplies a mock store.
    },
}));

import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import type { CodeEditorIntegrationSettingsStore } from './codeEditorIntegration.settingsStore.js';
import type {
    CodeEditorInstallation,
    CodeEditorIntegration,
} from './codeEditorIntegration.types.js';

const INTEGRATION_ID = 'vscode' as const;
const installation: CodeEditorInstallation = {
    path: path.resolve('tools', 'code'),
    version: null,
};

function createIntegration(): CodeEditorIntegration {
    return {
        metadata: {
            id: INTEGRATION_ID,
            displayName: 'Visual Studio Code',
            capabilities: { dotnet: true },
        },
        defaultSettings: { execFlags: '{file}' },
        detectInstallation: vi.fn().mockResolvedValue(installation),
        validateInstallation: vi
            .fn()
            .mockImplementation(async (candidate) => candidate),
        validatePath: vi.fn(),
        isConfiguredForProject: vi.fn(),
        resolveGodotConfiguration: vi.fn(),
        configureProject: vi.fn(),
    };
}

function createSettingsStore(): CodeEditorIntegrationSettingsStore {
    return {
        getDetectedInstallation: vi.fn().mockResolvedValue(undefined),
        setDetectedInstallation: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeEditorIntegrationSettingsStore;
}

function createCache(
    integration = createIntegration(),
    settingsStore = createSettingsStore(),
): {
    cache: CodeEditorInstallationCache;
    integration: CodeEditorIntegration;
    settingsStore: CodeEditorIntegrationSettingsStore;
} {
    return {
        cache: new CodeEditorInstallationCache(
            new CodeEditorIntegrationRegistry([integration]),
            settingsStore,
        ),
        integration,
        settingsStore,
    };
}

describe('CodeEditorInstallationCache', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-05T10:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('discovers once, persists the platform hint, and serves snapshots from memory', async () => {
        const { cache, integration, settingsStore } = createCache();

        await expect(cache.getSnapshot(INTEGRATION_ID)).resolves.toEqual(
            installation,
        );
        await expect(cache.getSnapshot(INTEGRATION_ID)).resolves.toEqual(
            installation,
        );

        expect(integration.detectInstallation).toHaveBeenCalledOnce();
        expect(settingsStore.setDetectedInstallation).toHaveBeenCalledWith(
            INTEGRATION_ID,
            installation,
            Date.now(),
        );
    });

    it('revalidates a persisted hint before using it', async () => {
        const integration = createIntegration();
        const settingsStore = createSettingsStore();
        vi.mocked(settingsStore.getDetectedInstallation).mockResolvedValue({
            installation,
            checkedAt: Date.now() - 60_000,
        });
        const { cache } = createCache(integration, settingsStore);

        await expect(cache.getSnapshot(INTEGRATION_ID)).resolves.toEqual(
            installation,
        );

        expect(integration.validateInstallation).toHaveBeenCalledWith(
            installation,
        );
        expect(integration.detectInstallation).not.toHaveBeenCalled();
    });

    it('uses bounded validation on focus and falls back to discovery when stale', async () => {
        const { cache, integration } = createCache();
        await cache.getSnapshot(INTEGRATION_ID);
        vi.mocked(integration.validateInstallation).mockResolvedValueOnce(null);

        vi.advanceTimersByTime(29_000);
        await cache.revalidate(INTEGRATION_ID);
        expect(integration.validateInstallation).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1_000);
        await cache.revalidate(INTEGRATION_ID);
        expect(integration.validateInstallation).toHaveBeenCalledOnce();
        expect(integration.detectInstallation).toHaveBeenCalledTimes(2);
    });

    it('keeps a recent persisted not-found result without rescanning', async () => {
        const settingsStore = createSettingsStore();
        vi.mocked(settingsStore.getDetectedInstallation).mockResolvedValue({
            installation: null,
            checkedAt: Date.now() - 60_000,
        });
        const { cache, integration } = createCache(
            createIntegration(),
            settingsStore,
        );

        await expect(cache.getSnapshot(INTEGRATION_ID)).resolves.toBeNull();
        expect(integration.detectInstallation).not.toHaveBeenCalled();

        vi.advanceTimersByTime(4 * 60_000);
        await expect(cache.revalidate(INTEGRATION_ID)).resolves.toEqual(
            installation,
        );
        expect(integration.detectInstallation).toHaveBeenCalledOnce();
    });

    it('forces explicit rescans and does not persist custom-path results', async () => {
        const { cache, integration, settingsStore } = createCache();
        const customPath = path.resolve('custom', 'code');

        await cache.getSnapshot(INTEGRATION_ID);
        await cache.rescan(INTEGRATION_ID);
        await cache.rescan(INTEGRATION_ID, customPath);

        expect(integration.detectInstallation).toHaveBeenNthCalledWith(
            2,
            undefined,
        );
        expect(integration.detectInstallation).toHaveBeenNthCalledWith(
            3,
            customPath,
        );
        expect(settingsStore.setDetectedInstallation).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent discovery requests', async () => {
        const integration = createIntegration();
        let finishDiscovery:
            | ((value: CodeEditorInstallation | null) => void)
            | undefined;
        vi.mocked(integration.detectInstallation).mockImplementation(
            () =>
                new Promise((resolve) => {
                    finishDiscovery = resolve;
                }),
        );
        const { cache } = createCache(integration);

        const first = cache.getSnapshot(INTEGRATION_ID);
        const second = cache.getSnapshot(INTEGRATION_ID);
        await vi.waitFor(() => {
            expect(integration.detectInstallation).toHaveBeenCalledOnce();
        });
        finishDiscovery?.(installation);

        await expect(Promise.all([first, second])).resolves.toEqual([
            installation,
            installation,
        ]);
        expect(integration.detectInstallation).toHaveBeenCalledOnce();
    });
});
