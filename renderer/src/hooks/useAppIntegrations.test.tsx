import type { AppIntegrationSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppIntegrations } from './useAppIntegrations.ts';

const mocks = vi.hoisted(() => ({
    listIntegrations: vi.fn(),
}));

vi.mock('../bridge.ts', () => ({
    appIntegrationsBridge: {
        listIntegrations: mocks.listIntegrations,
    },
}));

const github: AppIntegrationSummary = {
    id: 'github',
    displayName: 'GitHub',
    state: 'not-connected',
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
});
