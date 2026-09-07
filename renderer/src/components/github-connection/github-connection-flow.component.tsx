import type {
    AppIntegrationActionFailureReason,
    AppIntegrationActionResult,
    AppIntegrationConnectionOption,
    AppIntegrationSummary,
} from '@shared/contracts';
import {
    Building2,
    ExternalLink,
    Plus,
    ShieldCheck,
    UserRound,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppIntegrations } from '../../hooks/useAppIntegrations';
import {
    GitHubConnectionFlowSessionGuard,
    type GitHubConnectionFlowState,
    getGitHubConnectionFlowState,
} from './github-connection-flow.model';

export type GitHubConnectionFlowProps = {
    onConnected: () => void;
    onCancel: () => void;
    connectionId?: string;
    description?: string;
    showAccessManagement?: boolean;
    renderLayout?: (
        content: React.ReactNode,
        footer: React.ReactNode,
    ) => React.ReactNode;
};

/**
 * Guides one GitHub authorisation, installation choice, or reconnect attempt.
 *
 * @param props - Completion, cancellation, and optional targeted connection callbacks.
 * @returns The shared GitHub connection content without an outer dialog.
 */
export const GitHubConnectionFlow: React.FC<GitHubConnectionFlowProps> = ({
    onConnected,
    onCancel,
    connectionId,
    renderLayout,
    description,
    showAccessManagement = false,
}) => {
    const { t } = useTranslation(['settings', 'common']);
    const {
        connect,
        finishConnections,
        installConnection,
        cancel,
        reconnect,
        listIntegrations,
        manageAccess,
        refresh,
    } = useAppIntegrations();
    const [state, setState] = useState<GitHubConnectionFlowState>('intro');
    const [integration, setIntegration] =
        useState<AppIntegrationSummary | null>(null);
    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
    const [failure, setFailure] =
        useState<AppIntegrationActionFailureReason | null>(null);
    const [reconnectChoices, setReconnectChoices] = useState<
        AppIntegrationSummary['connections']
    >([]);
    const [selectedReconnectId, setSelectedReconnectId] = useState(
        connectionId ?? '',
    );
    const [loadingInitialState, setLoadingInitialState] = useState(true);
    const [initialLoadFailed, setInitialLoadFailed] = useState(false);
    const [initialLoadVersion, setInitialLoadVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [accessFailure, setAccessFailure] = useState(false);
    const sessionGuardRef = useRef(new GitHubConnectionFlowSessionGuard());
    const mountedRef = useRef(true);
    const connectionSessionOpenRef = useRef(false);
    const operationBusyRef = useRef(false);
    const cancellingRef = useRef(false);
    const onConnectedRef = useRef(onConnected);
    const onCancelRef = useRef(onCancel);
    onConnectedRef.current = onConnected;
    onCancelRef.current = onCancel;

    /** Cancels this flow's pending provider session once. */
    const cancelOwnedSession = useCallback(() => {
        if (!connectionSessionOpenRef.current || cancellingRef.current) {
            return;
        }
        connectionSessionOpenRef.current = false;
        cancellingRef.current = true;
        sessionGuardRef.current.invalidate();
        void cancel('github')
            .catch(() => undefined)
            .finally(() => {
                cancellingRef.current = false;
            });
    }, [cancel]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            sessionGuardRef.current.invalidate();
            cancelOwnedSession();
        };
    }, [cancelOwnedSession]);

    useEffect(() => {
        let active = true;
        const requestedVersion = initialLoadVersion;
        setLoadingInitialState(true);
        setInitialLoadFailed(false);
        void listIntegrations()
            .then((integrations) => {
                if (!active || requestedVersion !== initialLoadVersion) return;
                const github = integrations.find(
                    (candidate) => candidate.id === 'github',
                );
                if (github?.state === 'secure-storage-unavailable') {
                    setFailure('secure-storage-unavailable');
                    setInitialLoadFailed(true);
                    setState('error');
                    return;
                }
                setIntegration(github ?? null);
                if (connectionId) return;
                const reconnectable = (github?.connections ?? []).filter(
                    (connection) => connection.state !== 'connected',
                );
                setReconnectChoices(reconnectable);
            })
            .catch(() => {
                if (!active || requestedVersion !== initialLoadVersion) return;
                setFailure('unknown');
                setInitialLoadFailed(true);
                setState('error');
            })
            .finally(() => {
                if (active && requestedVersion === initialLoadVersion) {
                    setLoadingInitialState(false);
                }
            });
        return () => {
            active = false;
        };
    }, [connectionId, initialLoadVersion, listIntegrations]);

    /**
     * Applies a response only to the flow that started it.
     * @param result - Safe connection result returned by the bridge.
     * @param version - Request generation captured before the operation.
     */
    const applyResult = useCallback(
        (result: AppIntegrationActionResult, version: number): void => {
            if (
                !mountedRef.current ||
                !sessionGuardRef.current.isCurrent(version)
            ) {
                return;
            }

            setIntegration(result.integration);
            const nextState = getGitHubConnectionFlowState(result);
            if (nextState === 'completed') {
                connectionSessionOpenRef.current = false;
                onConnectedRef.current();
                return;
            }

            if (nextState === 'choosing') {
                setSelectedOptionIds([]);
                setFailure(result.ok ? null : result.reason);
                setState(nextState);
                return;
            }

            if (nextState === 'installing') {
                setFailure(null);
                setState(nextState);
                return;
            }

            connectionSessionOpenRef.current = false;
            setFailure(result.ok ? 'installation-required' : result.reason);
            setState('error');
        },
        [],
    );

    /**
     * Runs one connection action while blocking duplicate submissions.
     * @param action - Existing integration bridge operation.
     * @param pendingState - Progress state shown while the operation runs.
     */
    const runAction = useCallback(
        async (
            action: () => Promise<AppIntegrationActionResult>,
            pendingState: Extract<
                GitHubConnectionFlowState,
                'authorising' | 'installing' | 'saving'
            >,
        ): Promise<void> => {
            if (operationBusyRef.current) return;

            const version = sessionGuardRef.current.begin();
            connectionSessionOpenRef.current = true;
            operationBusyRef.current = true;
            setBusy(true);
            setFailure(null);
            setState(pendingState);
            try {
                applyResult(await action(), version);
            } catch {
                applyResult(
                    {
                        ok: false,
                        reason: 'unknown',
                        integration: integration ?? emptyGitHubIntegration,
                    },
                    version,
                );
            } finally {
                if (
                    mountedRef.current &&
                    sessionGuardRef.current.isCurrent(version)
                ) {
                    operationBusyRef.current = false;
                    setBusy(false);
                }
            }
        },
        [applyResult, integration],
    );

    /** Starts authorisation for a new or explicitly selected existing account. */
    const handleStart = useCallback(() => {
        if (loadingInitialState) return;
        void runAction(
            () =>
                selectedReconnectId
                    ? reconnect('github', selectedReconnectId)
                    : connect('github'),
            'authorising',
        );
    }, [
        connect,
        loadingInitialState,
        reconnect,
        runAction,
        selectedReconnectId,
    ]);

    /** Retries the failed initial load or browser authorisation. */
    const handleRetry = useCallback(() => {
        if (initialLoadFailed) {
            setState('intro');
            setInitialLoadVersion((version) => version + 1);
            return;
        }
        handleStart();
    }, [handleStart, initialLoadFailed]);

    /** Saves the selected verified GitHub connections. */
    const handleFinishConnections = useCallback(() => {
        if (selectedOptionIds.length === 0) return;
        void runAction(
            () => finishConnections('github', selectedOptionIds),
            'saving',
        );
    }, [finishConnections, runAction, selectedOptionIds]);

    /** Opens GitHub to install access for another account or organisation. */
    const handleInstallConnection = useCallback(() => {
        void runAction(() => installConnection('github'), 'installing');
    }, [installConnection, runAction]);

    /** Cancels setup and returns to the originating task. */
    const handleCancel = useCallback(() => {
        cancelOwnedSession();
        onCancelRef.current();
    }, [cancelOwnedSession]);

    /**
     * Runs an existing account-access action without starting an auth session.
     * @param action - Browser access management or refreshed account permissions.
     * @param complete - Whether success returns to repository selection.
     */
    const runAccessAction = async (
        action: () => Promise<AppIntegrationActionResult>,
        complete = false,
    ): Promise<void> => {
        if (operationBusyRef.current) return;
        operationBusyRef.current = true;
        setBusy(true);
        setAccessFailure(false);
        const version = sessionGuardRef.current.begin();
        try {
            const result = await action();
            if (
                !mountedRef.current ||
                !sessionGuardRef.current.isCurrent(version)
            )
                return;
            if (!result.ok) {
                setAccessFailure(true);
            } else if (complete) {
                onConnectedRef.current();
            }
        } catch {
            if (
                mountedRef.current &&
                sessionGuardRef.current.isCurrent(version)
            )
                setAccessFailure(true);
        } finally {
            if (
                mountedRef.current &&
                sessionGuardRef.current.isCurrent(version)
            ) {
                operationBusyRef.current = false;
                setBusy(false);
            }
        }
    };

    const footer = (
        <>
            <button
                type="button"
                className="btn btn-ghost"
                onClick={handleCancel}
            >
                {t('common:buttons.cancel')}
            </button>
            {state === 'intro' && (
                <button
                    type="button"
                    className={
                        showAccessManagement
                            ? 'btn btn-neutral'
                            : 'btn btn-primary'
                    }
                    disabled={loadingInitialState || busy}
                    onClick={handleStart}
                >
                    {t(
                        selectedReconnectId
                            ? 'connections.flow.reconnect'
                            : showAccessManagement
                              ? 'connections.flow.addAccount'
                              : 'connections.flow.continueInBrowser',
                    )}
                    {!showAccessManagement && (
                        <ExternalLink size={16} aria-hidden="true" />
                    )}
                </button>
            )}
            {state === 'intro' && showAccessManagement && (
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={loadingInitialState || busy}
                    onClick={() =>
                        void runAccessAction(() => refresh('github'), true)
                    }
                >
                    {busy && (
                        <span className="loading loading-spinner loading-xs" />
                    )}
                    {t('connections.flow.refreshRepositories')}
                </button>
            )}
            {state === 'choosing' &&
                (integration?.connectionOptions.length ?? 0) > 0 && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy || selectedOptionIds.length === 0}
                        onClick={handleFinishConnections}
                    >
                        {t('connections.actions.connectSelected', {
                            count: selectedOptionIds.length,
                        })}
                    </button>
                )}
            {state === 'error' && (
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleRetry}
                >
                    {t('common:buttons.retry')}
                </button>
            )}
        </>
    );
    const content = (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            {state === 'intro' && (
                <>
                    <p className="text-sm font-medium text-base-content">
                        {showAccessManagement
                            ? t('connections.flow.accessDescription')
                            : (description ??
                              t('connections.github.description'))}
                    </p>
                    {!showAccessManagement && (
                        <>
                            <p className="text-sm text-base-content/70">
                                {t('connections.flow.browserDescription')}
                            </p>
                            <div className="flex items-center gap-3 text-sm text-base-content/65">
                                <ShieldCheck
                                    className="shrink-0"
                                    size={18}
                                    aria-hidden="true"
                                />
                                <span>
                                    {t('connections.github.accessNote')}
                                </span>
                            </div>
                        </>
                    )}
                    {accessFailure && (
                        <p className="text-sm text-error" role="alert">
                            {t('connections.errors.generic')}
                        </p>
                    )}
                    {loadingInitialState && (
                        <div className="flex items-center gap-2" role="status">
                            <span className="loading loading-spinner loading-sm" />
                            <span>{t('connections.loading')}</span>
                        </div>
                    )}
                    {showAccessManagement && integration && (
                        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-[16px] [scrollbar-gutter:stable]">
                            {integration.connections.flatMap((connection) =>
                                connection.accessTargets.map((target) => (
                                    <div
                                        key={`${connection.id}:${target.id}`}
                                        className="flex shrink-0 items-center justify-between gap-3 rounded-box border border-base-300 p-3"
                                    >
                                        <span className="min-w-0 truncate">
                                            {target.login}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-outline btn-sm"
                                            disabled={
                                                busy ||
                                                target.availability ===
                                                    'unavailable'
                                            }
                                            onClick={() =>
                                                void runAccessAction(() =>
                                                    manageAccess(
                                                        'github',
                                                        connection.id,
                                                        target.id,
                                                    ),
                                                )
                                            }
                                        >
                                            {t(
                                                'connections.actions.manageAccess',
                                            )}
                                        </button>
                                    </div>
                                )),
                            )}
                        </div>
                    )}
                    {!connectionId && reconnectChoices.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <p className="text-sm font-medium">
                                {t('connections.flow.reconnect')}
                            </p>
                            <label className="flex cursor-pointer items-center gap-3 rounded-box border border-base-300 p-3">
                                <input
                                    type="radio"
                                    name="github-reconnect-connection"
                                    className="radio radio-sm"
                                    checked={!selectedReconnectId}
                                    onChange={() => setSelectedReconnectId('')}
                                />
                                <span>
                                    {t('connections.actions.addConnection')}
                                </span>
                            </label>
                            {reconnectChoices.map((connection) => (
                                <label
                                    key={connection.id}
                                    className="flex cursor-pointer items-center gap-3 rounded-box border border-base-300 p-3"
                                >
                                    <input
                                        type="radio"
                                        name="github-reconnect-connection"
                                        className="radio radio-sm"
                                        checked={
                                            selectedReconnectId ===
                                            connection.id
                                        }
                                        onChange={() =>
                                            setSelectedReconnectId(
                                                connection.id,
                                            )
                                        }
                                    />
                                    <span>
                                        {connection.accountDisplayName ??
                                            connection.accountLogin}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                </>
            )}

            {state === 'authorising' && <WaitingState t={t} />}

            {state === 'saving' && (
                <div className="flex items-center gap-3" role="status">
                    <span className="loading loading-spinner loading-sm" />
                    <span>{t('connections.status.connecting')}</span>
                </div>
            )}

            {state === 'choosing' && integration && (
                <ConnectionChooser
                    integration={integration}
                    selectedOptionIds={selectedOptionIds}
                    busy={busy}
                    t={t}
                    failure={failure}
                    onSelectedOptionIdsChange={setSelectedOptionIds}
                    onInstall={handleInstallConnection}
                />
            )}

            {state === 'installing' && <WaitingState t={t} />}

            {state === 'error' && (
                <p
                    className="rounded-box bg-error/10 p-3 text-sm text-error"
                    role="alert"
                >
                    {t(errorTranslationKey(failure ?? 'unknown'))}
                </p>
            )}
        </div>
    );
    return renderLayout ? (
        renderLayout(content, footer)
    ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {content}
            <footer className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
                {footer}
            </footer>
        </div>
    );
};

const emptyGitHubIntegration: AppIntegrationSummary = {
    id: 'github',
    displayName: 'GitHub',
    state: 'not-connected',
    connectionStage: null,
    connections: [],
    connectionOptions: [],
};

type WaitingStateProps = {
    t: (key: string) => string;
};

/**
 * Explains that the user must finish the provider-owned browser step.
 *
 * @param props - Translation helper.
 * @returns A browser-waiting status.
 */
const WaitingState: React.FC<WaitingStateProps> = ({ t }) => (
    <>
        <div className="flex items-start gap-3" role="status">
            <span className="loading loading-spinner loading-sm mt-0.5" />
            <p>{t('connections.flow.waiting')}</p>
        </div>
    </>
);

type ConnectionChooserProps = {
    integration: AppIntegrationSummary;
    selectedOptionIds: string[];
    busy: boolean;
    t: (key: string, options?: Record<string, unknown>) => string;
    failure: AppIntegrationActionFailureReason | null;
    onSelectedOptionIdsChange: (optionIds: string[]) => void;
    onInstall: () => void;
};

/**
 * Lets the user choose verified GitHub App installations after authorisation.
 *
 * @param props - Available installation choices and flow actions.
 * @returns The installation chooser.
 */
const ConnectionChooser: React.FC<ConnectionChooserProps> = ({
    integration,
    selectedOptionIds,
    busy,
    t,
    failure,
    onSelectedOptionIdsChange,
    onInstall,
}) => {
    const options = integration.connectionOptions;

    return (
        <>
            <div>
                <h2 className="font-semibold">
                    {t('connections.drawer.chooseConnection')}
                </h2>
                <p className="mt-1 text-sm text-base-content/65">
                    {t('connections.drawer.chooseConnectionDescription')}
                </p>
            </div>
            {failure && (
                <p
                    className="rounded-box bg-error/10 p-3 text-sm text-error"
                    role="alert"
                >
                    {t(errorTranslationKey(failure))}
                </p>
            )}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-base-300 border-t pt-4">
                {options.length > 0 && (
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={
                                selectedOptionIds.length === options.length
                            }
                            disabled={busy}
                            onChange={(event) =>
                                onSelectedOptionIdsChange(
                                    event.target.checked
                                        ? options.map((option) => option.id)
                                        : [],
                                )
                            }
                        />
                        {t('connections.actions.selectAll')}
                    </label>
                )}
                <button
                    type="button"
                    className="btn btn-outline btn-sm ml-auto"
                    disabled={busy}
                    onClick={onInstall}
                >
                    <Plus size={15} aria-hidden="true" />
                    {t('connections.flow.addAccount')}
                </button>
            </div>
            <div
                className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-[16px] [scrollbar-gutter:stable]"
                data-testid="github-connection-options"
            >
                {options.map((option) => (
                    <ConnectionOption
                        key={option.id}
                        option={option}
                        checked={selectedOptionIds.includes(option.id)}
                        disabled={busy}
                        t={t}
                        onCheckedChange={(checked) =>
                            onSelectedOptionIdsChange(
                                checked
                                    ? [...selectedOptionIds, option.id]
                                    : selectedOptionIds.filter(
                                          (id) => id !== option.id,
                                      ),
                            )
                        }
                    />
                ))}
            </div>
        </>
    );
};

type ConnectionOptionProps = {
    option: AppIntegrationConnectionOption;
    checked: boolean;
    disabled: boolean;
    t: (key: string, options?: Record<string, unknown>) => string;
    onCheckedChange: (checked: boolean) => void;
};

/**
 * Renders one verified GitHub App installation choice.
 *
 * @param props - Installation option and controlled selection state.
 * @returns One selectable installation row.
 */
const ConnectionOption: React.FC<ConnectionOptionProps> = ({
    option,
    checked,
    disabled,
    t,
    onCheckedChange,
}) => (
    <label
        className={`flex shrink-0 cursor-pointer items-center gap-3 rounded-box border p-3 ${checked ? 'border-primary bg-primary/5' : 'border-base-300'}`}
    >
        <input
            type="checkbox"
            className="checkbox checkbox-sm shrink-0"
            aria-label={t('connections.actions.selectInstallation', {
                connection: option.login,
            })}
            checked={checked}
            disabled={disabled}
            onChange={(event) => onCheckedChange(event.target.checked)}
        />
        <span className="flex min-w-0 items-center gap-3">
            {option.type === 'organization' ? (
                <Building2 size={18} aria-hidden="true" />
            ) : (
                <UserRound size={18} aria-hidden="true" />
            )}
            <span className="flex min-w-0 items-baseline gap-3">
                <span className="truncate text-sm font-medium">
                    {option.login}
                </span>
                <span className="shrink-0 text-xs text-base-content/60">
                    {t(
                        option.type === 'organization'
                            ? 'connections.drawer.organization'
                            : 'connections.drawer.personalAccount',
                    )}
                </span>
            </span>
        </span>
    </label>
);

/**
 * Maps safe bridge failures to Settings translations.
 *
 * @param reason - Renderer-safe failure reason.
 * @returns The matching translation key.
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
