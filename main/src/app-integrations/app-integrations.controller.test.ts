import { describe, expect, it, vi } from 'vitest';
import { AppIntegrationsController } from './app-integrations.controller.js';
import type { AppIntegrationsService } from './app-integrations.service.js';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

describe('AppIntegrationsController', () => {
    it('returns renderer-safe integration summaries', async () => {
        const summaries = [
            {
                id: 'github',
                displayName: 'GitHub',
                state: 'not-connected' as const,
                connectionStage: null,
                connections: [],
                connectionOptions: [],
            },
        ];
        const appIntegrations = {
            list: vi.fn(async () => summaries),
        } as unknown as AppIntegrationsService;
        const controller = new AppIntegrationsController(appIntegrations);

        await expect(controller.listIntegrations()).resolves.toEqual(summaries);
        expect(appIntegrations.list).toHaveBeenCalledOnce();
    });

    it('delegates connection actions', async () => {
        const result = {
            ok: true as const,
            integration: {
                id: 'github',
                displayName: 'GitHub',
                state: 'not-connected' as const,
                connectionStage: null,
                connections: [],
                connectionOptions: [],
            },
        };
        const appIntegrations = {
            connect: vi.fn(async () => result),
            finishConnections: vi.fn(async () => result),
            installConnection: vi.fn(async () => result),
            cancel: vi.fn(async () => result),
            reconnect: vi.fn(async () => result),
            refresh: vi.fn(async () => result),
            manageAccess: vi.fn(async () => result),
            disconnect: vi.fn(async () => result),
        } as unknown as AppIntegrationsService;
        const controller = new AppIntegrationsController(appIntegrations);

        await expect(controller.connect('github')).resolves.toEqual(result);
        await expect(
            controller.finishConnections('github', ['option-id']),
        ).resolves.toEqual(result);
        await expect(controller.installConnection('github')).resolves.toEqual(
            result,
        );
        await expect(controller.cancel('github')).resolves.toEqual(result);
        await expect(
            controller.reconnect('github', 'connection-id'),
        ).resolves.toEqual(result);
        await expect(controller.refresh('github')).resolves.toEqual(result);
        await expect(
            controller.manageAccess('github', 'connection-id', 'target-id'),
        ).resolves.toEqual(result);
        await expect(
            controller.disconnect('github', 'connection-id', 'target-id'),
        ).resolves.toEqual(result);
        expect(appIntegrations.finishConnections).toHaveBeenCalledWith(
            'github',
            ['option-id'],
        );
        expect(appIntegrations.installConnection).toHaveBeenCalledWith(
            'github',
        );
    });
});
