import type { ToolIntegrationSummary } from '@shared/contracts';
import { useCallback } from 'react';
import { toolIntegrationBridge } from '../bridge.ts';

export type ToolIntegrationsHook = {
    listIntegrations: () => Promise<ToolIntegrationSummary[]>;
    rescanIntegrations: () => Promise<ToolIntegrationSummary[]>;
    refreshIntegration: (toolId: string) => Promise<ToolIntegrationSummary>;
    rescanIntegration: (toolId: string) => Promise<ToolIntegrationSummary>;
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
    const refreshIntegration = useCallback(
        (toolId: string) => toolIntegrationBridge.refreshIntegration(toolId),
        [],
    );
    const rescanIntegration = useCallback(
        (toolId: string) => toolIntegrationBridge.rescanIntegration(toolId),
        [],
    );

    return {
        listIntegrations,
        rescanIntegrations,
        refreshIntegration,
        rescanIntegration,
    };
}
