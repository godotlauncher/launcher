import type {
    AppIntegrationActionFailureReason,
    AppIntegrationActionResult,
    AppIntegrationConnectionOption,
    AppIntegrationSummary,
} from '@shared/contracts';
import {
    Building2,
    Check,
    ExternalLink,
    ShieldCheck,
    UserRound,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppIntegrations } from '../../hooks/app-integrations.hook';
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
    /** Starts a new connection directly when invoked from an explicit Add action. */
    autoStart?: boolean;
    /** Lets a toned dialog present the error without a second coloured panel. */
    plainError?: boolean;
    renderLayout?: (
        content: React.ReactNode,
        footer: React.ReactNode,
        state: GitHubConnectionFlowState,
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
    autoStart = false,
    plainError = false,
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
    const autoStartedRef = useRef(false);
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

    useEffect(() => {
        if (
            !autoStart ||
            loadingInitialState ||
            initialLoadFailed ||
            autoStartedRef.current
        )
            return;
        autoStartedRef.current = true;
        handleStart();
    }, [autoStart, loadingInitialState, initialLoadFailed, handleStart]);

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

    const showReconnectChoices = !connectionId && reconnectChoices.length > 0;

    /** Starts a separate account connection without reusing the selected account. */
    const handleConnectAnother = () => {
        setSelectedReconnectId('');
        void runAction(() => connect('github'), 'authorising');
    };

    const footer = (
        <>
            <button
                type="button"
                className="btn btn-ghost text-base"
                onClick={handleCancel}
            >
                {t('common:buttons.cancel')}
            </button>
            {state === 'intro' && (
                <button
                    type="button"
                    className={
                        showAccessManagement
                            ? 'btn btn-sm btn-ghost text-base'
                            : 'btn btn-primary text-base'
                    }
                    disabled={
                        loadingInitialState ||
                        busy ||
                        (showReconnectChoices && !selectedReconnectId)
                    }
                    onClick={handleStart}
                >
                    {t(
                        selectedReconnectId || showReconnectChoices
                            ? 'connections.flow.reconnect'
                            : showAccessManagement
                              ? 'connections.flow.addAccount'
                              : 'connections.flow.continueInBrowser',
                    )}
                    <ExternalLink
                        className="size-3.5 shrink-0 opacity-45"
                        aria-hidden="true"
                    />
                </button>
            )}
            {state === 'intro' && showAccessManagement && (
                <button
                    type="button"
                    className="btn btn-primary text-base"
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
                        className="btn btn-primary text-base"
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
                    className="btn btn-primary text-base"
                    onClick={handleRetry}
                >
                    {t('common:buttons.retry')}
                </button>
            )}
        </>
    );
    const content = (
        <div className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-hidden text-base">
            {state === 'intro' && (
                <>
                    <p>
                        {showReconnectChoices
                            ? t('connections.flow.reauthoriseDescription')
                            : showAccessManagement
                              ? t('connections.flow.accessDescription')
                              : (description ??
                                t('connections.github.description'))}
                    </p>
                    {!showAccessManagement && !showReconnectChoices && (
                        <>
                            <p className="text-base-content/75">
                                {t('connections.flow.browserDescription')}
                            </p>
                            <div className="flex items-start gap-2 text-base-content/75">
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
                        <p
                            className="alert alert-error alert-soft text-base text-error-content dark:text-error"
                            role="alert"
                        >
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
                                        className="flex shrink-0 items-center justify-between gap-3 p-3"
                                    >
                                        <span className="min-w-0 truncate font-semibold">
                                            {target.login}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-ghost text-base"
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
                                            <ExternalLink
                                                className="size-3.5 shrink-0 opacity-45"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </div>
                                )),
                            )}
                        </div>
                    )}
                    {showReconnectChoices && (
                        <>
                            <div className="flex shrink-0 justify-end">
                                <button
                                    type="button"
                                    className="btn btn-link h-auto min-h-0 p-0 text-base font-normal"
                                    disabled={busy || loadingInitialState}
                                    onClick={handleConnectAnother}
                                >
                                    {t(
                                        'connections.flow.connectAnotherAccount',
                                    )}
                                    <ExternalLink
                                        size={16}
                                        className="shrink-0 opacity-45"
                                        aria-hidden="true"
                                    />
                                </button>
                            </div>
                            <div
                                role="radiogroup"
                                aria-label={t('connections.flow.reconnect')}
                                className="flex min-h-0 flex-col gap-2 overflow-y-auto p-1 pr-[16px] [scrollbar-gutter:stable]"
                            >
                                {reconnectChoices.map((connection) => (
                                    <label
                                        key={connection.id}
                                        className="relative flex shrink-0 items-center gap-3 rounded-md bg-base-content/2 p-3 hover:bg-base-content/5 has-[:checked]:bg-primary/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
                                    >
                                        <input
                                            type="radio"
                                            name="github-reconnect-connection"
                                            className="peer sr-only"
                                            checked={
                                                selectedReconnectId ===
                                                connection.id
                                            }
                                            disabled={busy}
                                            onChange={() =>
                                                setSelectedReconnectId(
                                                    connection.id,
                                                )
                                            }
                                        />
                                        <UserRound
                                            size={18}
                                            className="shrink-0 text-base-content/75"
                                            aria-hidden="true"
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block break-words font-semibold">
                                                {connection.accountDisplayName ||
                                                    connection.accountLogin}
                                            </span>
                                            {connection.accountDisplayName &&
                                                connection.accountDisplayName !==
                                                    connection.accountLogin && (
                                                    <span className="block break-all text-sm text-base-content/60">
                                                        @
                                                        {
                                                            connection.accountLogin
                                                        }
                                                    </span>
                                                )}
                                        </span>
                                        <Check
                                            size={18}
                                            className="invisible shrink-0 text-primary peer-checked:visible"
                                            aria-hidden="true"
                                        />
                                    </label>
                                ))}
                            </div>
                        </>
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
                    className={
                        plainError
                            ? 'text-base'
                            : 'alert alert-error alert-soft text-base text-error-content dark:text-error'
                    }
                    role="alert"
                >
                    {t(errorTranslationKey(failure ?? 'unknown'))}
                </p>
            )}
        </div>
    );
    return renderLayout ? (
        renderLayout(content, footer, state)
    ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {content}
            <footer className="mt-[12px] flex shrink-0 flex-wrap justify-end gap-2">
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
            <div className="flex flex-col gap-[4px]">
                <h2 className="font-semibold">
                    {t('connections.drawer.chooseConnection')}
                </h2>
                <p className="text-base-content/75">
                    {t('connections.drawer.chooseConnectionDescription')}
                </p>
            </div>
            {failure && (
                <p
                    className="alert alert-error alert-soft text-base text-error-content dark:text-error"
                    role="alert"
                >
                    {t(errorTranslationKey(failure))}
                </p>
            )}
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                <p className="text-base-content/75">
                    {t('connections.flow.missingAccount')}
                </p>
                <button
                    type="button"
                    data-external-link=""
                    className="btn btn-link h-auto min-h-0 p-0 text-base font-normal"
                    disabled={busy}
                    onClick={onInstall}
                >
                    {t('connections.flow.manageGitHubAccess')}
                    <ExternalLink
                        className="size-3.5 shrink-0 opacity-45"
                        aria-hidden="true"
                    />
                </button>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                {options.length > 0 && (
                    <label className="flex min-h-8 items-center gap-2">
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
            </div>
            <div
                className="flex min-h-0 flex-col gap-2 overflow-y-auto p-1 pr-[16px] [scrollbar-gutter:stable]"
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
    <label className="relative flex shrink-0 items-center gap-3 rounded-md bg-base-content/2 p-3 hover:bg-base-content/5 has-[:checked]:bg-primary/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
        <input
            type="checkbox"
            className="peer sr-only"
            aria-label={t('connections.actions.selectInstallation', {
                connection: option.login,
            })}
            checked={checked}
            disabled={disabled}
            onChange={(event) => onCheckedChange(event.target.checked)}
        />
        <span className="flex min-w-0 flex-1 items-center gap-3">
            {option.type === 'organization' ? (
                <Building2 size={18} className="shrink-0" aria-hidden="true" />
            ) : (
                <UserRound size={18} className="shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
                <span className="block break-all font-semibold">
                    {option.login}
                </span>
                <span className="block text-sm text-base-content/60">
                    {t(
                        option.type === 'organization'
                            ? 'connections.drawer.organization'
                            : 'connections.drawer.personalAccount',
                    )}
                </span>
            </span>
        </span>
        <Check
            size={18}
            className="invisible shrink-0 text-primary peer-checked:visible"
            aria-hidden="true"
        />
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
