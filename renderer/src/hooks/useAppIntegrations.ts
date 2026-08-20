import type { AppIntegrationSummary } from '@shared/contracts';
import { useCallback } from 'react';
import { appIntegrationsBridge } from '../bridge.ts';

export type AppIntegrationsHook = {
    listIntegrations: () => Promise<AppIntegrationSummary[]>;
};

/**
 * Provides stable access to renderer-safe app integration summaries.
 *
 * @returns App integration listing operations.
 */
export function useAppIntegrations(): AppIntegrationsHook {
    const listIntegrations = useCallback(
        () => appIntegrationsBridge.listIntegrations(),
        [],
    );

    return { listIntegrations };
}
