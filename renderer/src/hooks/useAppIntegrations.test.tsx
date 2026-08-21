import type { AppIntegrationSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppIntegrations } from './useAppIntegrations.ts';

const mocks = vi.hoisted(() => ({
    listIntegrations: vi.fn(),
    connect: vi.fn(),
    finishConnections: vi.fn(),
    installConnection: vi.fn(),
    cancel: vi.fn(),
    reconnect: vi.fn(),
    refresh: vi.fn(),
    manageAccess: vi.fn(),
    disconnect: vi.fn(),
}));

vi.mock('../bridge.ts', () => ({
    appIntegrationsBridge: {
        listIntegrations: mocks.listIntegrations,
        connect: mocks.connect,
        finishConnections: mocks.finishConnections,
        installConnection: mocks.installConnection,
        cancel: mocks.cancel,
        reconnect: mocks.reconnect,
        refresh: mocks.refresh,
        manageAccess: mocks.manageAccess,
        disconnect: mocks.disconnect,
    },
}));

const github: AppIntegrationSummary = {
    id: 'github',
    displayName: 'GitHub',
    state: 'not-connected',
    connectionStage: null,
    connections: [],
    connectionOptions: [],
};

describe('useAppIntegrations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listIntegrations.mockResolvedValue([github]);
    });

    /**
     * Captures the hook result through a server-rendered test component.
     *
     * @returns The rendered hook operations.
     */
    function renderHook(): ReturnType<typeof useAppIntegrations> {
        let captured: ReturnType<typeof useAppIntegrations> | undefined;

        const Capture = () => {
            captured = useAppIntegrations();
            return null;
        };

        renderToStaticMarkup(<Capture />);

        if (!captured) {
            throw new Error('Hook was not rendered');
        }

        return captured;
    }

    it('delegates integration listing to the app integrations bridge', async () => {
        const hook = renderHook();

        await expect(hook.listIntegrations()).resolves.toEqual([github]);
        expect(mocks.listIntegrations).toHaveBeenCalledOnce();
    });

    it('delegates connection actions to the app integrations bridge', async () => {
        const hook = renderHook();

        await hook.connect('github');
        await hook.finishConnections('github', ['option-id']);
        await hook.installConnection('github');
        await hook.cancel('github');
        await hook.reconnect('github', 'connection-id');
        await hook.refresh('github');
        await hook.manageAccess('github', 'connection-id', 'target-id');
        await hook.disconnect('github', 'connection-id', 'target-id');

        expect(mocks.connect).toHaveBeenCalledWith('github');
        expect(mocks.finishConnections).toHaveBeenCalledWith('github', [
            'option-id',
        ]);
        expect(mocks.installConnection).toHaveBeenCalledWith('github');
        expect(mocks.cancel).toHaveBeenCalledWith('github');
        expect(mocks.reconnect).toHaveBeenCalledWith('github', 'connection-id');
        expect(mocks.refresh).toHaveBeenCalledWith('github');
        expect(mocks.manageAccess).toHaveBeenCalledWith(
            'github',
            'connection-id',
            'target-id',
        );
        expect(mocks.disconnect).toHaveBeenCalledWith(
            'github',
            'connection-id',
            'target-id',
        );
    });
});
