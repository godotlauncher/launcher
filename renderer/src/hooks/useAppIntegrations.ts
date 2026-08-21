import type {
    AppIntegrationActionResult,
    AppIntegrationSummary,
} from '@shared/contracts';
import { useCallback } from 'react';
import { appIntegrationsBridge } from '../bridge.ts';

export type AppIntegrationsHook = {
    listIntegrations: () => Promise<AppIntegrationSummary[]>;
    connect: (integrationId: string) => Promise<AppIntegrationActionResult>;
    finishConnections: (
        integrationId: string,
        optionIds: string[],
    ) => Promise<AppIntegrationActionResult>;
    installConnection: (
        integrationId: string,
    ) => Promise<AppIntegrationActionResult>;
    cancel: (integrationId: string) => Promise<AppIntegrationActionResult>;
    reconnect: (
        integrationId: string,
        connectionId: string,
    ) => Promise<AppIntegrationActionResult>;
    refresh: (integrationId: string) => Promise<AppIntegrationActionResult>;
    manageAccess: (
        integrationId: string,
        connectionId: string,
        accessTargetId: string,
    ) => Promise<AppIntegrationActionResult>;
    disconnect: (
        integrationId: string,
        connectionId: string,
        accessTargetId: string,
    ) => Promise<AppIntegrationActionResult>;
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
    const connect = useCallback(
        (integrationId: string) => appIntegrationsBridge.connect(integrationId),
        [],
    );
    const finishConnections = useCallback(
        (integrationId: string, optionIds: string[]) =>
            appIntegrationsBridge.finishConnections(integrationId, optionIds),
        [],
    );
    const installConnection = useCallback(
        (integrationId: string) =>
            appIntegrationsBridge.installConnection(integrationId),
        [],
    );
    const cancel = useCallback(
        (integrationId: string) => appIntegrationsBridge.cancel(integrationId),
        [],
    );
    const reconnect = useCallback(
        (integrationId: string, connectionId: string) =>
            appIntegrationsBridge.reconnect(integrationId, connectionId),
        [],
    );
    const refresh = useCallback(
        (integrationId: string) => appIntegrationsBridge.refresh(integrationId),
        [],
    );
    const manageAccess = useCallback(
        (integrationId: string, connectionId: string, accessTargetId: string) =>
            appIntegrationsBridge.manageAccess(
                integrationId,
                connectionId,
                accessTargetId,
            ),
        [],
    );
    const disconnect = useCallback(
        (integrationId: string, connectionId: string, accessTargetId: string) =>
            appIntegrationsBridge.disconnect(
                integrationId,
                connectionId,
                accessTargetId,
            ),
        [],
    );

    return {
        listIntegrations,
        connect,
        finishConnections,
        installConnection,
        cancel,
        reconnect,
        refresh,
        manageAccess,
        disconnect,
    };
}
