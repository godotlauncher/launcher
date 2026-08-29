import type {
    AppIntegrationActionFailureReason,
    AppIntegrationConnectionSummary,
    AppIntegrationSummary,
} from '@shared/contracts';
import { Building2, Plug, Plus, Settings2, UserRound } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import githubInvertocatBlack from '../../../assets/icons/github-invertocat-black.svg';
import githubInvertocatWhite from '../../../assets/icons/github-invertocat-white.svg';
import { Drawer } from '../../../components/ui/drawer/drawer.component';
import { useTheme } from '../../../hooks/useTheme';
import { SettingsPanelSection } from './settingsPanelSection.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ConnectionsSettingsPanelProps = {
    active: boolean;
    t: Translate;
    integrations: AppIntegrationSummary[];
    loading: boolean;
    loadError: boolean;
    actionErrors: Partial<
        Record<string, AppIntegrationActionFailureReason | undefined>
    >;
    onRetry: () => void;
    onConnect: (integrationId: string) => void;
    onFinishConnections: (
        integrationId: string,
        optionIds: string[],
    ) => Promise<boolean>;
    onInstallConnection: (integrationId: string) => void;
    onCancel: (integrationId: string) => void;
    onRefresh: (integrationId: string) => void;
    onReconnect: (integrationId: string, connectionId: string) => void;
    onManageAccess: (
        integrationId: string,
        connectionId: string,
        accessTargetId: string,
    ) => void;
    onDisconnect: (
        integration: AppIntegrationSummary,
        connection: AppIntegrationConnectionSummary,
        accessTarget: AppIntegrationConnectionSummary['accessTargets'][number],
    ) => void;
};

/**
 * Presents registered app integrations and their connection actions.
 *
 * @param props - Panel state and presentation callbacks.
 * @returns The Connections settings panel.
 */
export const ConnectionsSettingsPanel: React.FC<
    ConnectionsSettingsPanelProps
> = ({
    active,
    t,
    integrations,
    loading,
    loadError,
    actionErrors,
    onRetry,
    onConnect,
    onFinishConnections,
    onInstallConnection,
    onCancel,
    onRefresh,
    onReconnect,
    onManageAccess,
    onDisconnect,
}) => {
    const { theme, systemTheme } = useTheme();
    const effectiveTheme = (theme ?? 'auto') === 'auto' ? systemTheme : theme;
    const [managedIntegrationId, setManagedIntegrationId] = useState<
        string | null
    >(null);
    const managedIntegration =
        integrations.find(
            (integration) => integration.id === managedIntegrationId,
        ) ?? null;
    const hasIntegrations = integrations.length > 0;
    const initialLoading = loading && !hasIntegrations;

    useEffect(() => {
        if (!active) {
            setManagedIntegrationId(null);
        }
    }, [active]);

    useEffect(() => {
        if (active && managedIntegrationId) {
            onRefresh(managedIntegrationId);
        }
    }, [active, managedIntegrationId, onRefresh]);

    useEffect(() => {
        const pending = integrations.find(
            (integration) =>
                integration.connectionStage === 'choosing' ||
                integration.connectionStage === 'installing',
        );
        if (active && pending) {
            setManagedIntegrationId(pending.id);
        }
    }, [active, integrations]);

    useEffect(() => {
        if (!active) {
            return;
        }
        const handleFocus = () => {
            const pending = integrations.find(
                (integration) =>
                    integration.connectionStage === 'choosing' ||
                    integration.connectionStage === 'installing',
            );
            if (pending) {
                setManagedIntegrationId(pending.id);
            }
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [active, integrations]);

    return (
        <SettingsPanelSection active={active}>
            <div>
                <h2 className="text-lg font-semibold">
                    {t('connections.title')}
                </h2>
                <p className="mt-1 text-sm text-base-content/70">
                    {t('connections.overview')}
                </p>
            </div>

            {initialLoading && (
                <div className="flex items-center gap-2" role="status">
                    <span className="loading loading-spinner loading-sm" />
                    <span>{t('connections.loading')}</span>
                </div>
            )}

            {!loading && loadError && (
                <div
                    className="flex items-center justify-between gap-4 rounded-box border border-error/30 bg-error/10 p-4"
                    role="alert"
                >
                    <span>{t('connections.loadError')}</span>
                    <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={onRetry}
                    >
                        {t('common:buttons.retry')}
                    </button>
                </div>
            )}

            {hasIntegrations && (
                <div className="grid gap-4">
                    {integrations.map((integration) => (
                        <IntegrationCard
                            key={integration.id}
                            integration={integration}
                            actionError={actionErrors[integration.id]}
                            effectiveTheme={effectiveTheme}
                            t={t}
                            onConnect={onConnect}
                            onCancel={onCancel}
                            onManageConnections={setManagedIntegrationId}
                        />
                    ))}
                </div>
            )}

            <GitHubConnectionsDrawer
                open={Boolean(
                    managedIntegration &&
                        (managedIntegration.connections.length > 0 ||
                            managedIntegration.connectionStage === 'choosing' ||
                            managedIntegration.connectionStage ===
                                'installing'),
                )}
                integration={managedIntegration}
                actionError={
                    managedIntegration
                        ? actionErrors[managedIntegration.id]
                        : undefined
                }
                t={t}
                onOpenChange={(open) => {
                    if (!open) {
                        setManagedIntegrationId(null);
                    }
                }}
                onConnect={onConnect}
                onFinishConnections={onFinishConnections}
                onInstallConnection={onInstallConnection}
                onCancel={onCancel}
                onReconnect={onReconnect}
                onManageAccess={onManageAccess}
                onDisconnect={onDisconnect}
            />
        </SettingsPanelSection>
    );
};

type IntegrationCardProps = Pick<
    ConnectionsSettingsPanelProps,
    't' | 'onConnect' | 'onCancel'
> & {
    integration: AppIntegrationSummary;
    actionError?: AppIntegrationActionFailureReason;
    effectiveTheme: string | null | undefined;
    onManageConnections: (integrationId: string) => void;
};

/**
 * Renders one compact provider card.
 *
 * @param props - Provider summary, theme, translations, and actions.
 * @returns One provider card.
 */
const IntegrationCard: React.FC<IntegrationCardProps> = ({
    integration,
    actionError,
    effectiveTheme,
    t,
    onConnect,
    onCancel,
    onManageConnections,
}) => {
    const github = integration.id === 'github';
    const connectionCount = integration.connections.reduce(
        (count, connection) => count + connection.accessTargets.length,
        0,
    );
    const hasConnections = connectionCount > 0;
    const choosing = integration.state === 'selection-required';

    return (
        <section
            className="rounded-box border border-base-300 bg-base-200/40 p-5"
            data-testid={`app-integration-${integration.id}`}
        >
            <div className="flex items-start justify-between gap-6">
                <div className="flex min-w-0 gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-box bg-base-100 shadow-sm">
                        {github ? (
                            <img
                                src={
                                    effectiveTheme === 'dark'
                                        ? githubInvertocatWhite
                                        : githubInvertocatBlack
                                }
                                className="size-10"
                                alt=""
                                aria-hidden="true"
                            />
                        ) : (
                            <Plug className="size-6" aria-hidden="true" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">
                                {integration.displayName}
                            </h3>
                            <span className="badge badge-sm badge-ghost">
                                {t(statusTranslationKey(integration.state))}
                            </span>
                        </div>
                        <p className="mt-2 text-sm text-base-content/70">
                            {t(
                                github
                                    ? 'connections.github.description'
                                    : 'connections.genericDescription',
                            )}
                        </p>
                        {hasConnections && (
                            <p className="mt-2 text-sm font-medium">
                                {t('connections.github.summary', {
                                    count: connectionCount,
                                })}
                            </p>
                        )}
                        {github && !hasConnections && (
                            <p className="mt-2 text-xs text-base-content/60">
                                {t('connections.github.accessNote')}
                            </p>
                        )}
                        {integration.state === 'secure-storage-unavailable' && (
                            <p className="mt-2 text-xs text-warning">
                                {t('connections.secureStorageUnavailable')}
                            </p>
                        )}
                        {actionError && actionError !== 'cancelled' && (
                            <p className="mt-2 text-xs text-error" role="alert">
                                {t(errorTranslationKey(actionError))}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {choosing && (
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => onManageConnections(integration.id)}
                        >
                            {t('connections.status.selectionRequired')}
                        </button>
                    )}
                    {!hasConnections &&
                        integration.state !== 'connecting' &&
                        !choosing && (
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={
                                    integration.state ===
                                    'secure-storage-unavailable'
                                }
                                onClick={() => onConnect(integration.id)}
                            >
                                {t('connections.actions.connect', {
                                    provider: integration.displayName,
                                })}
                            </button>
                        )}
                    {hasConnections &&
                        integration.state !== 'connecting' &&
                        !choosing && (
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={
                                    integration.state ===
                                    'secure-storage-unavailable'
                                }
                                onClick={() => onConnect(integration.id)}
                            >
                                <Plus size={15} aria-hidden="true" />
                                {t('connections.actions.addConnection')}
                            </button>
                        )}
                    {integration.state === 'connecting' && (
                        <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => onCancel(integration.id)}
                        >
                            <span className="loading loading-spinner loading-xs" />
                            {t('connections.actions.cancel')}
                        </button>
                    )}
                    {hasConnections && github && (
                        <button
                            type="button"
                            className="btn btn-sm btn-ghost btn-square"
                            aria-label={t(
                                'connections.actions.manageConnections',
                            )}
                            title={t('connections.actions.manageConnections')}
                            onClick={() => onManageConnections(integration.id)}
                        >
                            <Settings2 size={18} aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
};

type GitHubConnectionsDrawerProps = Pick<
    ConnectionsSettingsPanelProps,
    | 't'
    | 'onConnect'
    | 'onFinishConnections'
    | 'onInstallConnection'
    | 'onCancel'
    | 'onReconnect'
    | 'onManageAccess'
    | 'onDisconnect'
> & {
    open: boolean;
    integration: AppIntegrationSummary | null;
    actionError?: AppIntegrationActionFailureReason;
    onOpenChange: (open: boolean) => void;
};

/**
 * Displays verified GitHub App installation connections.
 *
 * @param props - Drawer state, integration summary, and targeted actions.
 * @returns The GitHub connections management drawer.
 */
export const GitHubConnectionsDrawer: React.FC<
    GitHubConnectionsDrawerProps
> = ({
    open,
    integration,
    actionError,
    t,
    onOpenChange,
    onConnect,
    onFinishConnections,
    onInstallConnection,
    onCancel,
    onReconnect,
    onManageAccess,
    onDisconnect,
}) => {
    const connecting = integration?.state === 'connecting';
    const choosing = integration?.state === 'selection-required';
    const installing = integration?.connectionStage === 'installing';
    const storageUnavailable =
        integration?.state === 'secure-storage-unavailable';
    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
    const [savingSelections, setSavingSelections] = useState(false);
    const chooserKey = choosing
        ? `${integration?.id}:${integration?.connectionOptions
              .map((option) => option.id)
              .join(':')}`
        : null;

    useEffect(() => {
        if (chooserKey !== null) {
            setSelectedOptionIds([]);
        }
    }, [chooserKey]);

    return (
        <Drawer
            open={open && Boolean(integration)}
            onOpenChange={onOpenChange}
            side="right"
            ariaLabel={t('connections.drawer.title')}
            width={560}
            panelClassName="max-w-[100vw]"
        >
            <Drawer.Header>
                <div className="min-w-0">
                    <Drawer.Title>{t('connections.drawer.title')}</Drawer.Title>
                    <p className="mt-1 text-sm text-base-content/65">
                        {t('connections.drawer.description')}
                    </p>
                </div>
                <Drawer.CloseButton />
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-4">
                {actionError && actionError !== 'cancelled' && (
                    <p
                        className="rounded-box bg-error/10 p-3 text-sm text-error"
                        role="alert"
                    >
                        {t(errorTranslationKey(actionError))}
                    </p>
                )}

                <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">
                        {t('connections.drawer.connections')}
                    </h3>
                    {connecting || choosing ? (
                        <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() =>
                                integration && onCancel(integration.id)
                            }
                        >
                            {connecting && (
                                <span className="loading loading-spinner loading-xs" />
                            )}
                            {t('connections.actions.cancel')}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            disabled={storageUnavailable}
                            onClick={() =>
                                integration && onConnect(integration.id)
                            }
                        >
                            <Plus size={15} aria-hidden="true" />
                            {t('connections.actions.addConnection')}
                        </button>
                    )}
                </div>

                {choosing && integration && (
                    <section className="rounded-box border border-primary/25 bg-primary/5 p-4">
                        <h4 className="font-semibold">
                            {t('connections.drawer.chooseConnection')}
                        </h4>
                        <p className="mt-1 text-sm text-base-content/65">
                            {t(
                                'connections.drawer.chooseConnectionDescription',
                            )}
                        </p>
                        <div className="mt-4 flex flex-col gap-3">
                            {integration.connectionOptions.length > 0 && (
                                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-sm"
                                        checked={
                                            selectedOptionIds.length ===
                                            integration.connectionOptions.length
                                        }
                                        disabled={savingSelections}
                                        onChange={(event) =>
                                            setSelectedOptionIds(
                                                event.target.checked
                                                    ? integration.connectionOptions.map(
                                                          (option) => option.id,
                                                      )
                                                    : [],
                                            )
                                        }
                                    />
                                    {t('connections.actions.selectAll')}
                                </label>
                            )}
                            {integration.connectionOptions.map((option) => (
                                <ConnectionTargetRow
                                    key={option.id}
                                    login={option.login}
                                    type={option.type}
                                    availability="available"
                                    t={t}
                                    action={
                                        <input
                                            type="checkbox"
                                            className="checkbox checkbox-sm"
                                            aria-label={t(
                                                'connections.actions.selectInstallation',
                                                { connection: option.login },
                                            )}
                                            checked={selectedOptionIds.includes(
                                                option.id,
                                            )}
                                            disabled={savingSelections}
                                            onChange={(event) =>
                                                setSelectedOptionIds(
                                                    (current) =>
                                                        event.target.checked
                                                            ? [
                                                                  ...current,
                                                                  option.id,
                                                              ]
                                                            : current.filter(
                                                                  (id) =>
                                                                      id !==
                                                                      option.id,
                                                              ),
                                                )
                                            }
                                        />
                                    }
                                />
                            ))}
                            {integration.connectionOptions.length > 0 && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm self-start"
                                    disabled={
                                        selectedOptionIds.length === 0 ||
                                        savingSelections
                                    }
                                    onClick={() => {
                                        setSavingSelections(true);
                                        void onFinishConnections(
                                            integration.id,
                                            selectedOptionIds,
                                        ).finally(() =>
                                            setSavingSelections(false),
                                        );
                                    }}
                                >
                                    {savingSelections && (
                                        <span className="loading loading-spinner loading-xs" />
                                    )}
                                    {t('connections.actions.connectSelected', {
                                        count: selectedOptionIds.length,
                                    })}
                                </button>
                            )}
                            <div className="border-base-300 border-t pt-3">
                                <button
                                    type="button"
                                    className="btn btn-outline btn-sm self-start"
                                    disabled={savingSelections}
                                    onClick={() => {
                                        setSelectedOptionIds([]);
                                        onInstallConnection(integration.id);
                                    }}
                                >
                                    <Plus size={15} aria-hidden="true" />
                                    {t('connections.actions.installAnother')}
                                </button>
                            </div>
                        </div>
                    </section>
                )}

                {installing && (
                    <section
                        className="rounded-box border border-primary/25 bg-primary/5 p-4"
                        role="status"
                    >
                        <div className="flex items-start gap-3">
                            <span className="loading loading-spinner loading-sm mt-0.5" />
                            <div>
                                <h4 className="font-semibold">
                                    {t('connections.drawer.finishSetup')}
                                </h4>
                                <p className="mt-1 text-sm text-base-content/65">
                                    {t(
                                        'connections.drawer.finishSetupDescription',
                                    )}
                                </p>
                            </div>
                        </div>
                    </section>
                )}

                {integration?.connections.map((connection) => (
                    <section
                        key={connection.id}
                        className="rounded-box border border-base-300 bg-base-200/35 p-4"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h4 className="truncate font-semibold">
                                    {connection.accountDisplayName ??
                                        connection.accountLogin}
                                </h4>
                                {connection.accountDisplayName && (
                                    <p className="truncate text-xs text-base-content/60">
                                        @{connection.accountLogin}
                                    </p>
                                )}
                            </div>
                            {connection.state !== 'connected' && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-xs"
                                    disabled={connecting || storageUnavailable}
                                    onClick={() =>
                                        onReconnect(
                                            integration.id,
                                            connection.id,
                                        )
                                    }
                                >
                                    {t('connections.actions.reconnect')}
                                </button>
                            )}
                        </div>
                        <div className="mt-3 flex flex-col gap-2 border-base-300 border-t pt-3">
                            {connection.accessTargets.map((target) => (
                                <div
                                    key={target.id}
                                    data-testid={`github-connection-${target.id}`}
                                >
                                    <ConnectionTargetRow
                                        login={target.login}
                                        type={target.type}
                                        availability={target.availability}
                                        t={t}
                                        action={
                                            <div className="flex shrink-0 flex-wrap justify-end gap-2">
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-outline"
                                                    disabled={
                                                        target.availability ===
                                                        'unavailable'
                                                    }
                                                    onClick={() =>
                                                        onManageAccess(
                                                            integration.id,
                                                            connection.id,
                                                            target.id,
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'connections.actions.manageAccess',
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-ghost text-error"
                                                    disabled={connecting}
                                                    onClick={() =>
                                                        onDisconnect(
                                                            integration,
                                                            connection,
                                                            target,
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'connections.actions.disconnect',
                                                    )}
                                                </button>
                                            </div>
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </Drawer.Body>
        </Drawer>
    );
};

type ConnectionTargetRowProps = {
    login: string;
    type: 'organization' | 'user';
    availability: 'available' | 'unavailable';
    action: React.ReactNode;
    t: Translate;
};

/**
 * Renders one GitHub App installation as a user-facing connection.
 *
 * @param props - Installation identity, action, and translations.
 * @returns One connection row.
 */
const ConnectionTargetRow: React.FC<ConnectionTargetRowProps> = ({
    login,
    type,
    availability,
    action,
    t,
}) => (
    <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
            {type === 'organization' ? (
                <Building2 className="shrink-0" size={18} aria-hidden="true" />
            ) : (
                <UserRound className="shrink-0" size={18} aria-hidden="true" />
            )}
            <div className="min-w-0">
                <p className="truncate text-sm font-medium">{login}</p>
                <p className="text-xs text-base-content/60">
                    {t(
                        type === 'organization'
                            ? 'connections.drawer.organization'
                            : 'connections.drawer.personalAccount',
                    )}
                </p>
                <p
                    className={`text-xs ${
                        availability === 'unavailable'
                            ? 'text-warning'
                            : 'text-success'
                    }`}
                >
                    {t(
                        availability === 'unavailable'
                            ? 'connections.status.unavailable'
                            : 'connections.status.connected',
                    )}
                </p>
            </div>
        </div>
        {action}
    </div>
);

/**
 * Maps a connection state to its localised status key.
 *
 * @param state - Provider or account connection state.
 * @returns The translation key for the state.
 */
function statusTranslationKey(
    state:
        | AppIntegrationSummary['state']
        | AppIntegrationConnectionSummary['state'],
): string {
    switch (state) {
        case 'not-connected':
            return 'connections.status.notConnected';
        case 'connecting':
            return 'connections.status.connecting';
        case 'selection-required':
            return 'connections.status.selectionRequired';
        case 'connected':
            return 'connections.status.connected';
        case 'reauthorisation-required':
            return 'connections.status.reauthorisationRequired';
        case 'secure-storage-unavailable':
            return 'connections.status.secureStorageUnavailable';
    }
}

/**
 * Maps safe failure classifications to concise user-facing messages.
 *
 * @param reason - Renderer-safe action failure reason.
 * @returns The translation key for the failure.
 */
function errorTranslationKey(
    reason: AppIntegrationActionFailureReason,
): string {
    switch (reason) {
        case 'account-mismatch':
            return 'connections.errors.accountMismatch';
        case 'denied':
            return 'connections.errors.denied';
        case 'timed-out':
            return 'connections.errors.timedOut';
        case 'secure-storage-unavailable':
            return 'connections.errors.secureStorageUnavailable';
        case 'installation-required':
            return 'connections.errors.installationRequired';
        default:
            return 'connections.errors.generic';
    }
}
