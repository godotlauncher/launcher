import { describe, expect, it, vi } from 'vitest';
import type { ToolInstallationCache } from './tool-installation.cache.js';
import type { ToolIntegrationRegistry } from './tool-integration.registry.js';
import { ToolIntegrationService } from './tool-integration.service.js';
import type { ToolIntegrationStore } from './tool-integration.store.js';
import type {
    ToolInstallation,
    ToolIntegration,
    ToolSettings,
} from './tool-integration.types.js';
import type { ToolProcessExecutor } from './tool-process.executor.js';
import type { ToolStreamingProcessExecutor } from './tool-streaming-process.executor.js';

const settings: ToolSettings = {
    enabled: true,
    executablePathOverride: null,
    executableArgsOverride: null,
};

const installation: ToolInstallation = {
    executablePath: '/tools/example',
    executableArgs: ['--prefix'],
    version: '1.0.0',
    source: 'detected',
};

/**
 * Creates the facade with mocked registry, settings, cache, and process edges.
 *
 * @returns Tool service and its mocked collaborators.
 */
function createService(): {
    service: ToolIntegrationService;
    integration: ToolIntegration;
    settingsStore: ToolIntegrationStore;
    installationCache: ToolInstallationCache;
    processExecutor: ToolProcessExecutor;
    streamingProcessExecutor: ToolStreamingProcessExecutor;
} {
    const integration: ToolIntegration = {
        metadata: { id: 'example', displayName: 'Example', order: 10 },
        detectInstallation: vi.fn().mockResolvedValue(installation),
        validateInstallation: vi.fn().mockResolvedValue(installation),
    };
    const registry = {
        get: vi.fn(() => integration),
        list: vi.fn(() => [integration]),
    } as unknown as ToolIntegrationRegistry;
    const settingsStore = {
        get: vi.fn().mockResolvedValue(settings),
        update: vi.fn().mockResolvedValue(settings),
        normalize: vi.fn((value: Partial<ToolSettings>) => ({
            enabled: value.enabled ?? true,
            executablePathOverride:
                value.executablePathOverride?.trim() || null,
            executableArgsOverride: value.executableArgsOverride?.length
                ? [...value.executableArgsOverride]
                : null,
        })),
    } as unknown as ToolIntegrationStore;
    const installationCache = {
        getSnapshot: vi.fn().mockResolvedValue({
            installation,
            status: 'available',
            checkedAt: 123,
        }),
        refresh: vi.fn(),
        rescan: vi.fn().mockResolvedValue({
            installation,
            status: 'available',
            checkedAt: 123,
        }),
        requireAvailable: vi.fn().mockResolvedValue({
            installation,
            status: 'available',
            checkedAt: 123,
        }),
        invalidate: vi.fn(),
    } as unknown as ToolInstallationCache;
    const processExecutor = {
        execute: vi.fn().mockResolvedValue({
            success: true,
            stdout: 'ok',
            stderr: '',
            exitCode: 0,
        }),
    } as unknown as ToolProcessExecutor;
    const streamingProcessExecutor = {
        execute: vi.fn().mockResolvedValue({ success: true, exitCode: 0 }),
    } as unknown as ToolStreamingProcessExecutor;

    return {
        service: new ToolIntegrationService(
            registry,
            settingsStore,
            installationCache,
            processExecutor,
            streamingProcessExecutor,
        ),
        integration,
        settingsStore,
        installationCache,
        processExecutor,
        streamingProcessExecutor,
    };
}

describe('ToolIntegrationService', () => {
    it('refreshes every registered integration in registry order', async () => {
        const { service, installationCache } = createService();
        vi.mocked(installationCache.refresh).mockResolvedValue({
            installation,
            status: 'available',
            checkedAt: 123,
        });

        await expect(service.refreshAll()).resolves.toEqual([
            {
                metadata: {
                    id: 'example',
                    displayName: 'Example',
                    order: 10,
                },
                settings,
                installation,
                status: 'available',
                checkedAt: 123,
            },
        ]);
        expect(installationCache.refresh).toHaveBeenCalledWith(
            'example',
            settings,
        );
    });

    it('revalidates and executes through the process boundary', async () => {
        const { service, installationCache, processExecutor } = createService();
        const request = { args: ['status'], cwd: '/project' };

        await expect(service.execute('example', request)).resolves.toEqual({
            success: true,
            stdout: 'ok',
            stderr: '',
            exitCode: 0,
        });
        expect(installationCache.requireAvailable).toHaveBeenCalledWith(
            'example',
            settings,
        );
        expect(processExecutor.execute).toHaveBeenCalledWith(
            installation,
            request,
        );
    });

    it('does not resolve or execute a disabled tool', async () => {
        const { service, settingsStore, installationCache, processExecutor } =
            createService();
        vi.mocked(settingsStore.get).mockResolvedValue({
            ...settings,
            enabled: false,
        });

        await expect(
            service.execute('example', { args: [] }),
        ).resolves.toMatchObject({
            success: false,
            reason: 'disabled',
        });
        expect(installationCache.requireAvailable).not.toHaveBeenCalled();
        expect(processExecutor.execute).not.toHaveBeenCalled();
    });

    it('revalidates and executes through the streaming process boundary', async () => {
        const { service, installationCache, streamingProcessExecutor } =
            createService();
        const request = {
            args: ['clone'],
            env: {},
            signal: new AbortController().signal,
            timeoutMs: 5_000,
        };

        await expect(
            service.executeStreaming('example', request),
        ).resolves.toEqual({ success: true, exitCode: 0 });
        expect(installationCache.requireAvailable).toHaveBeenCalledWith(
            'example',
            settings,
        );
        expect(streamingProcessExecutor.execute).toHaveBeenCalledWith(
            installation,
            request,
        );
    });

    it('rejects an invalid execution override before persistence', async () => {
        const { service, integration, settingsStore } = createService();
        vi.mocked(integration.detectInstallation).mockResolvedValue(null);

        await expect(
            service.updateSettings('example', {
                executablePathOverride: '/invalid/tool',
            }),
        ).rejects.toThrow('Invalid tool execution override: example');
        expect(settingsStore.update).not.toHaveBeenCalled();
    });

    it('invalidates and rescans after saving settings', async () => {
        const { service, settingsStore, installationCache } = createService();
        const updatedSettings: ToolSettings = {
            enabled: true,
            executablePathOverride: '/tools/example',
            executableArgsOverride: ['--prefix'],
        };
        vi.mocked(settingsStore.update).mockResolvedValue(updatedSettings);

        const summary = await service.updateSettings('example', {
            executablePathOverride: '/tools/example',
            executableArgsOverride: ['--prefix'],
        });

        expect(installationCache.invalidate).toHaveBeenCalledWith('example');
        expect(installationCache.rescan).toHaveBeenCalledWith(
            'example',
            updatedSettings,
        );
        expect(summary.settings).toEqual(updatedSettings);
    });

    it('normalizes execution overrides before provider validation', async () => {
        const { service, integration } = createService();

        await service.updateSettings('example', {
            executablePathOverride: ' /tools/example ',
        });

        expect(integration.detectInstallation).toHaveBeenCalledWith({
            enabled: true,
            executablePathOverride: '/tools/example',
            executableArgsOverride: null,
        });
    });
});
