import {
    ChevronDown,
    CircleAlert,
    CircleCheck,
    Info,
    TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Dialog } from '../../../components/dialog.component';
import { StatusBadge } from '../../../components/ui/status-badge.component';
import { usePreferences } from '../../../hooks/preferences.hook';
import { appBridge } from '../../../renderer.bridge';

type Translate = (key: string, options?: Record<string, unknown>) => string;
type StorageChoice = 'automatic' | 'gnome-libsecret';
type StorageStatus = NonNullable<
    Awaited<ReturnType<typeof appBridge.getCredentialStorageStatus>>
>;
type StorageDialog = 'confirm' | 'saved' | 'failed' | 'restart-failed' | null;

/**
 * Shows the Linux storage preference and saves choices for the next startup.
 * @param props - Panel visibility and translator.
 */
export function CredentialStorageControl({
    active,
    t,
}: {
    active: boolean;
    t: Translate;
}) {
    const { platform, preferences, updatePreferences } = usePreferences();
    const [status, setStatus] = useState<StorageStatus | null>(null);
    const [statusError, setStatusError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [draft, setDraft] = useState<StorageChoice | null>(null);
    const [saving, setSaving] = useState(false);
    const [dialog, setDialog] = useState<StorageDialog>(null);
    const saved = preferences?.linux_credential_storage ?? 'automatic';

    // biome-ignore lint/correctness/useExhaustiveDependencies: An explicit retry must reload diagnostics.
    useEffect(() => {
        if (!active || platform !== 'linux') return;
        let cancelled = false;
        setStatusError(false);
        void appBridge
            .getCredentialStorageStatus()
            .then((value) => {
                if (!cancelled) setStatus(value);
            })
            .catch(() => {
                if (!cancelled) setStatusError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [active, platform, retry]);

    if (platform !== 'linux') return null;

    /** Saves after explicit confirmation without changing the current backend. */
    async function saveChoice() {
        if (saving || !preferences || draft === null || draft === saved) return;
        setSaving(true);
        try {
            await updatePreferences({ linux_credential_storage: draft });
            setDraft(null);
            setDialog('saved');
        } catch {
            setDraft(null);
            setDialog('failed');
        } finally {
            setSaving(false);
        }
    }

    return (
        <CredentialStorageView
            t={t}
            saved={saved}
            selected={draft ?? saved}
            status={status}
            statusError={statusError}
            saving={saving}
            disabled={!preferences}
            dialog={active ? dialog : null}
            onDialogChange={setDialog}
            onChange={setDraft}
            onSave={() => {
                void saveChoice();
            }}
            onRetry={() => setRetry((value) => value + 1)}
        />
    );
}

type StorageViewProps = {
    t: Translate;
    saved: StorageChoice;
    selected: StorageChoice;
    status: StorageStatus | null;
    statusError: boolean;
    saving: boolean;
    disabled: boolean;
    dialog: StorageDialog;
    onDialogChange: (dialog: StorageDialog) => void;
    onChange: (value: StorageChoice) => void;
    onSave: () => void;
    onRetry: () => void;
};

/**
 * Presents inline storage diagnostics with modal confirmation and save results.
 * @param props - Confirmed preference, draft, current status and modal actions.
 */
export function CredentialStorageView({
    t,
    saved,
    selected,
    status,
    statusError,
    saving,
    disabled,
    dialog,
    onDialogChange,
    onChange,
    onSave,
    onRetry,
}: StorageViewProps) {
    const prefix = 'connections.credentialStorage.';
    const [restarting, setRestarting] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const saveRef = useRef<HTMLButtonElement>(null);
    const choiceRef = useRef<HTMLSelectElement>(null);
    const overridden = status?.selectionSource === 'command-line';
    const restartPending =
        !!status && !overridden && saved !== status.startupPreference;
    const summaryKey = statusError
        ? 'statusError'
        : !status
          ? 'loading'
          : overridden
            ? 'overrideShort'
            : restartPending
              ? 'pendingShort'
              : status.available
                ? 'available'
                : 'unavailableShort';
    const needsAttention =
        statusError ||
        overridden ||
        restartPending ||
        (status && !status.available);
    const offerRestart =
        dialog === 'saved' &&
        !overridden &&
        (!status || saved !== status.startupPreference);

    /** Restarts through the existing application bridge after explicit input. */
    function restartNow() {
        if (restarting) return;
        setRestarting(true);
        void appBridge.relaunchApp().catch(() => {
            setRestarting(false);
            onDialogChange('restart-failed');
        });
    }
    /**
     * Translates supported storage choices.
     * @param choice - Saved or draft selection.
     */
    const choiceName = (choice: StorageChoice) =>
        t(`${prefix}${choice === 'automatic' ? 'automatic' : 'secretService'}`);
    const titleKey =
        dialog === 'confirm'
            ? 'confirmTitle'
            : dialog === 'saved'
              ? 'savedTitle'
              : dialog === 'restart-failed'
                ? 'restartFailedTitle'
                : 'failedTitle';

    return (
        <section
            className="flex flex-col gap-3 border-t border-base-content/10 pt-4"
            aria-labelledby="credential-storage-title"
        >
            <h3
                id="credential-storage-title"
                className="inline-flex flex-wrap items-center gap-2 font-semibold"
            >
                <button
                    type="button"
                    className="inline-flex items-center gap-2 text-left"
                    aria-expanded={expanded}
                    aria-controls="credential-storage-options"
                    onClick={() => setExpanded(!expanded)}
                >
                    <ChevronDown
                        className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                    />
                    {t(`${prefix}title`)}
                </button>
                <StatusBadge tone="info" className="font-normal">
                    {t(`${prefix}linuxOnly`)}
                </StatusBadge>
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p
                    role="status"
                    className={
                        needsAttention
                            ? 'text-warning-content dark:text-warning'
                            : 'text-base-content/75'
                    }
                >
                    {t(`${prefix}${summaryKey}`)}
                </p>
                {!expanded &&
                    (statusError || (status && !status.available)) && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm text-base"
                            onClick={() => setExpanded(true)}
                        >
                            {t(`${prefix}configure`)}
                        </button>
                    )}
            </div>
            <div
                id="credential-storage-options"
                className={expanded ? 'flex flex-col gap-3' : 'hidden'}
            >
                <div
                    className="flex flex-col gap-2 text-base-content/75"
                    aria-live="polite"
                >
                    <p>{t(`${prefix}description`)}</p>
                    <CredentialStorageDetails
                        t={t}
                        status={status}
                        statusError={statusError}
                        saved={saved}
                        onRetry={onRetry}
                    />
                </div>
                <label
                    className="flex flex-col gap-2"
                    htmlFor="credential-storage-choice"
                >
                    <span>
                        {t(`${prefix}savedChoice`)}: {choiceName(saved)}
                    </span>
                    <select
                        ref={choiceRef}
                        id="credential-storage-choice"
                        className="select select-bordered w-full max-w-sm text-base"
                        value={selected}
                        disabled={disabled || saving}
                        onChange={(event) =>
                            onChange(
                                event.target.value === 'gnome-libsecret'
                                    ? 'gnome-libsecret'
                                    : 'automatic',
                            )
                        }
                    >
                        <option value="automatic">
                            {t(`${prefix}automatic`)}
                        </option>
                        <option value="gnome-libsecret">
                            {t(`${prefix}secretService`)}
                        </option>
                    </select>
                </label>
                <button
                    ref={saveRef}
                    type="button"
                    className="btn btn-ghost w-fit text-base"
                    disabled={disabled || saving || selected === saved}
                    onClick={() => onDialogChange('confirm')}
                >
                    {t(`${prefix}save`)}
                </button>
            </div>
            {dialog && (
                <Dialog
                    key={dialog}
                    title={t(`${prefix}${titleKey}`)}
                    tone={
                        dialog === 'failed' || dialog === 'restart-failed'
                            ? 'error'
                            : dialog === 'confirm'
                              ? 'warning'
                              : dialog === 'saved'
                                ? 'success'
                                : 'neutral'
                    }
                    returnFocusRef={saveRef}
                    fallbackReturnFocusRef={choiceRef}
                    onRequestClose={() => {
                        if (!saving && !restarting) onDialogChange(null);
                    }}
                    footer={
                        dialog === 'confirm' ? (
                            <>
                                <button
                                    type="button"
                                    className="btn btn-ghost text-base"
                                    disabled={saving}
                                    onClick={() => onDialogChange(null)}
                                >
                                    {t('common:buttons.cancel')}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary text-base"
                                    disabled={saving}
                                    onClick={onSave}
                                >
                                    {t(
                                        `${prefix}${saving ? 'saving' : 'save'}`,
                                    )}
                                </button>
                            </>
                        ) : offerRestart ? (
                            <>
                                <button
                                    type="button"
                                    className="btn btn-ghost text-base"
                                    disabled={restarting}
                                    onClick={() => onDialogChange(null)}
                                >
                                    {t(`${prefix}notNow`)}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary text-base"
                                    disabled={restarting}
                                    onClick={restartNow}
                                >
                                    {t(`${prefix}restartNow`)}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-primary text-base"
                                onClick={() => onDialogChange(null)}
                            >
                                {t('common:buttons.ok')}
                            </button>
                        )
                    }
                >
                    <div className="flex flex-col gap-3">
                        {dialog === 'confirm' && (
                            <>
                                <p>
                                    {t(`${prefix}confirmChange`, {
                                        choice: choiceName(selected),
                                    })}
                                </p>
                                <p>{t(`${prefix}warning`)}</p>
                                {overridden ? (
                                    <p>
                                        {t(`${prefix}override`, {
                                            backend:
                                                status.requestedBackend ?? '',
                                        })}
                                    </p>
                                ) : (
                                    <p>{t(`${prefix}restart`)}</p>
                                )}
                            </>
                        )}
                        {dialog === 'saved' && (
                            <>
                                <p>
                                    {t(`${prefix}savedChoice`)}:{' '}
                                    {choiceName(saved)}
                                </p>
                                {overridden ? (
                                    <p>
                                        {t(`${prefix}override`, {
                                            backend:
                                                status.requestedBackend ?? '',
                                        })}
                                    </p>
                                ) : status &&
                                  saved === status.startupPreference ? (
                                    <p>{t(`${prefix}savedCurrent`)}</p>
                                ) : (
                                    <p>{t(`${prefix}restart`)}</p>
                                )}
                            </>
                        )}
                        {dialog === 'restart-failed' && (
                            <p role="alert">{t(`${prefix}restartFailed`)}</p>
                        )}
                        {dialog === 'failed' && (
                            <p role="alert">{t(`${prefix}saveError`)}</p>
                        )}
                    </div>
                </Dialog>
            )}
        </section>
    );
}

/**
 * Explains current-session diagnostics separately from the next-start choice.
 * @param props - Current diagnostics, saved preference and retry action.
 */
function CredentialStorageDetails({
    t,
    status,
    statusError,
    saved,
    onRetry,
}: Pick<
    StorageViewProps,
    't' | 'status' | 'statusError' | 'saved' | 'onRetry'
>) {
    const prefix = 'connections.credentialStorage.';
    if (statusError)
        return (
            <StorageMessage tone="error">
                <p>{t(`${prefix}statusError`)}</p>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm w-fit"
                    onClick={onRetry}
                >
                    {t('common:buttons.retry')}
                </button>
            </StorageMessage>
        );
    if (!status)
        return (
            <StorageMessage tone="info">
                <p>{t(`${prefix}loading`)}</p>
            </StorageMessage>
        );
    const overridden = status.selectionSource === 'command-line';
    const selectionFailed =
        status.requestedBackend === 'gnome-libsecret' &&
        status.activeBackend !== 'gnome_libsecret';
    return (
        <>
            {overridden ? (
                <StorageMessage tone="warning">
                    <p>
                        {t(`${prefix}override`, {
                            backend: status.requestedBackend ?? '',
                        })}
                    </p>
                </StorageMessage>
            ) : saved !== status.startupPreference ? (
                <StorageMessage tone="warning">
                    <p>{t(`${prefix}restartPending`)}</p>
                    <p>{t(`${prefix}restart`)}</p>
                </StorageMessage>
            ) : null}
            <StorageMessage
                tone={
                    status.available
                        ? selectionFailed
                            ? 'warning'
                            : 'success'
                        : 'error'
                }
            >
                <p>
                    {t(
                        `${prefix}${status.available ? 'available' : selectionFailed ? 'unavailableShort' : 'unavailable'}`,
                    )}
                </p>
                {selectionFailed && <p>{t(`${prefix}selectionFailed`)}</p>}
                <div className="flex flex-col gap-1 text-sm">
                    {!overridden && (
                        <p>
                            {t(`${prefix}sessionChoice`, {
                                choice: t(
                                    `${prefix}${status.startupPreference === 'automatic' ? 'automatic' : 'secretService'}`,
                                ),
                            })}
                        </p>
                    )}
                    <p>
                        {t(`${prefix}activeBackend`, {
                            backend: status.activeBackend,
                        })}
                    </p>
                </div>
            </StorageMessage>
        </>
    );
}

/**
 * Groups related storage guidance in a soft panel with a matching status icon.
 * @param props - Message severity and content.
 */
function StorageMessage({
    tone,
    children,
}: {
    tone: 'info' | 'warning' | 'error' | 'success';
    children: ReactNode;
}) {
    const styles = {
        info: 'alert-info text-info-content dark:text-info',
        warning: 'alert-warning text-warning-content dark:text-warning',
        error: 'alert-error text-error-content dark:text-error',
        success: 'alert-success text-success-content dark:text-success',
    };
    const Icon = {
        info: Info,
        warning: TriangleAlert,
        error: CircleAlert,
        success: CircleCheck,
    }[tone];
    return (
        <div
            className={`alert alert-soft items-start text-base ${styles[tone]}`}
            role={tone === 'error' ? 'alert' : 'status'}
        >
            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-2">{children}</div>
        </div>
    );
}
