import type { ToolIntegrationSummary } from '@shared/contracts';
import { useCallback } from 'react';
import { toolIntegrationBridge } from '../bridge.ts';

export type ToolIntegrationsHook = {
    listIntegrations: () => Promise<ToolIntegrationSummary[]>;
    rescanIntegrations: () => Promise<ToolIntegrationSummary[]>;
};

/**
 * Provides stable functions for the tool integration bridge.
 *
 * @returns Tool integration listing and rescan operations.
 */
export function useToolIntegrations(): ToolIntegrationsHook {
    const listIntegrations = useCallback(
        () => toolIntegrationBridge.listIntegrations(),
        [],
    );
    const rescanIntegrations = useCallback(
        () => toolIntegrationBridge.rescanIntegrations(),
        [],
    );

    return { listIntegrations, rescanIntegrations };
}
