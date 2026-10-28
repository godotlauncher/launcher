import type {
    AutomaticAliasChangePreview,
    AutomaticAliasChangeResult,
} from '@shared/contracts';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConfirmLayout } from '../components/confirm.component';
import { editorInstallsBridge } from '../renderer.bridge';
import { useAlerts } from './alerts.hook';
import { useNotifications } from './notifications.hook';

/**
 * Presents counted command choices in a layout that stays steady when selection changes.
 * @param props - Requested preference, dialog layout and explicit selection callbacks.
 */
function AutomaticAliasChangeConfirm({
    enabled,
    renderLayout,
    onChoose,
    onCancel,
}: {
    enabled: boolean;
    renderLayout: ConfirmLayout;
    onChoose: (preview: AutomaticAliasChangePreview) => Promise<void>;
    onCancel: () => void;
}) {
    const { t } = useTranslation('installs');
    const [selected, setSelected] = useState('keep');
    const [previews, setPreviews] = useState<
        AutomaticAliasChangePreview[] | null
    >(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [applying, setApplying] = useState(false);
    const [operationError, setOperationError] = useState<string>();
    const applyingRef = useRef(false);
    const confirmRef = useRef<
        (preview: AutomaticAliasChangePreview) => Promise<void>
    >(async () => undefined);
    const previewRequest = useRef<
        | {
              enabled: boolean;
              attempt: number;
              promise: Promise<AutomaticAliasChangePreview[]>;
          }
        | undefined
    >(undefined);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const onChooseRef = useRef(onChoose);
    onChooseRef.current = onChoose;
    /**
     * Keeps the current confirmation open until its explicit action has settled.
     * @param preview - Reviewed choice to apply or retain as an onboarding draft.
     */
    const confirm = async (
        preview: AutomaticAliasChangePreview,
    ): Promise<void> => {
        if (applyingRef.current) return;
        applyingRef.current = true;
        setApplying(true);
        setOperationError(undefined);
        try {
            await onChooseRef.current(preview);
        } catch (cause) {
            setOperationError(
                cause instanceof Error ? cause.message : String(cause),
            );
            setPreviews(null);
        } finally {
            applyingRef.current = false;
            setApplying(false);
        }
    };
    confirmRef.current = confirm;
    const group = useId();
    const modes = enabled
        ? (['keep', 'create-missing'] as const)
        : (['keep', 'remove-automatic', 'remove-all'] as const);
    useEffect(() => {
        let active = true;
        setPreviews(null);
        setError(false);
        setOperationError(undefined);
        const requestedModes = enabled
            ? (['keep', 'create-missing'] as const)
            : (['keep', 'remove-automatic', 'remove-all'] as const);
        if (
            previewRequest.current?.enabled !== enabled ||
            previewRequest.current.attempt !== attempt
        ) {
            previewRequest.current = {
                enabled,
                attempt,
                promise: Promise.all(
                    requestedModes.map((mode) =>
                        editorInstallsBridge.previewAutomaticAliasChange({
                            enabled,
                            mode,
                        }),
                    ),
                ),
            };
        }
        void previewRequest.current.promise
            .then((loaded) => {
                if (!active) return;
                if (enabled && loaded[1].items.length === 0) {
                    void confirmRef.current(loaded[0]);
                    return;
                }
                setPreviews(loaded);
            })
            .catch(() => {
                if (active) setError(true);
            });
        return () => {
            active = false;
        };
    }, [enabled, attempt]);
    const current = previews?.find((preview) => preview.mode === selected);
    const loading = previews === null && !error && !operationError;
    const summaryKeys = {
        keep: 'unchanged',
        'create-missing': 'createSummary',
        'remove-automatic': 'automaticSummary',
        'remove-all': 'allSummary',
    } as const;
    const count =
        current?.items.filter((item) => item.action !== 'skip').length ?? 0;
    const skipped =
        current?.items.filter((item) => item.action === 'skip').length ?? 0;
    const labelKeys = {
        keep: enabled ? 'future' : 'keep',
        'create-missing': 'create',
        'remove-automatic': 'removeAutomatic',
        'remove-all': 'removeAll',
    } as const;
    return renderLayout(
        <div className="flex flex-col gap-4">
            <fieldset
                disabled={!previews || applying}
                className="flex flex-col gap-3"
            >
                <legend className="sr-only">
                    {t(
                        `aliases.automatic.bulk.${enabled ? 'enableTitle' : 'disableTitle'}`,
                    )}
                </legend>
                {modes.map((mode) => (
                    <label
                        key={mode}
                        className="flex items-center gap-3 cursor-pointer"
                    >
                        <input
                            type="radio"
                            className="radio radio-primary radio-sm"
                            name={group}
                            value={mode}
                            checked={selected === mode}
                            onChange={() => setSelected(mode)}
                        />
                        <span>
                            {t(`aliases.automatic.bulk.${labelKeys[mode]}`, {
                                total:
                                    previews
                                        ?.find(
                                            (preview) => preview.mode === mode,
                                        )
                                        ?.items.filter(
                                            (item) => item.action !== 'skip',
                                        ).length ?? '...',
                            })}
                        </span>
                    </label>
                ))}
            </fieldset>
            <div className="grid text-base-content/75">
                {modes.map((mode) => (
                    <div
                        key={mode}
                        aria-hidden="true"
                        className="invisible col-start-1 row-start-1 flex flex-col gap-2"
                    >
                        <p>
                            {t(`aliases.automatic.bulk.${summaryKeys[mode]}`, {
                                count:
                                    previews
                                        ?.find(
                                            (preview) => preview.mode === mode,
                                        )
                                        ?.items.filter(
                                            (item) => item.action !== 'skip',
                                        ).length ?? 0,
                            })}
                        </p>
                        <p className="text-sm">
                            {t('aliases.automatic.bulk.skippedSummary', {
                                count: skipped,
                            })}
                        </p>
                    </div>
                ))}
                <div
                    role={error || operationError ? 'alert' : 'status'}
                    aria-busy={loading || applying}
                    className="col-start-1 row-start-1 flex flex-col gap-2"
                >
                    {applying ? (
                        <p className="flex items-center gap-2">
                            <span
                                className="loading loading-spinner loading-xs"
                                aria-hidden="true"
                            />
                            {t('aliases.pending')}
                        </p>
                    ) : loading ? (
                        <p className="flex items-center gap-2">
                            <span
                                className="loading loading-spinner loading-xs"
                                aria-hidden="true"
                            />
                            {t('aliases.automatic.bulk.loading')}
                        </p>
                    ) : error || operationError ? (
                        <p>{operationError ?? t('aliases.error')}</p>
                    ) : (
                        <>
                            <p>
                                {t(
                                    `aliases.automatic.bulk.${count === 0 ? 'unchanged' : summaryKeys[current?.mode ?? 'keep']}`,
                                    { count },
                                )}
                            </p>
                            {skipped > 0 && (
                                <p className="text-sm">
                                    {t(
                                        'aliases.automatic.bulk.skippedSummary',
                                        { count: skipped },
                                    )}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
            {!enabled && (
                <p className="text-sm text-base-content/70">
                    {t('aliases.automatic.bulk.defaultKept')}
                </p>
            )}
        </div>,
        <>
            <button
                ref={cancelRef}
                type="button"
                className="btn btn-ghost text-base"
                disabled={applying}
                onClick={onCancel}
            >
                {t('common:buttons.cancel')}
            </button>
            <button
                type="button"
                className="btn btn-primary text-base"
                disabled={loading || applying}
                aria-busy={loading || applying}
                onClick={() => {
                    if (error || operationError)
                        setAttempt((value) => value + 1);
                    else if (current) void confirm(current);
                }}
            >
                {error || operationError
                    ? t('common:buttons.retry')
                    : t(
                          `aliases.automatic.bulk.${enabled ? 'enable' : 'disable'}`,
                      )}
            </button>
        </>,
        {
            initialFocusRef: cancelRef,
            onRequestClose: () => {
                if (!applyingRef.current) onCancel();
            },
        },
    );
}

/** Shares explicit, cancellable bulk choices between Settings and onboarding. */
export function useAutomaticAliasChange() {
    const { t } = useTranslation('installs');
    const { addCustomConfirm } = useAlerts();
    const { showNotification } = useNotifications();
    /**
     * Opens immediately and resolves only after a loaded choice or cancellation.
     * @param enabled - Requested future automatic creation state.
     * @param onConfirm - Optional Settings action that finishes before the dialog closes.
     */
    const choose = async (
        enabled: boolean,
        onConfirm?: (preview: AutomaticAliasChangePreview) => Promise<void>,
    ): Promise<AutomaticAliasChangePreview | null> => {
        return new Promise((resolve) => {
            addCustomConfirm(
                t(
                    `aliases.automatic.bulk.${enabled ? 'enableTitle' : 'disableTitle'}`,
                ),
                (renderLayout, close) => (
                    <AutomaticAliasChangeConfirm
                        enabled={enabled}
                        renderLayout={renderLayout}
                        onChoose={async (preview) => {
                            await onConfirm?.(preview);
                            close();
                            resolve(preview);
                        }}
                        onCancel={() => {
                            close();
                            resolve(null);
                        }}
                    />
                ),
                [],
            );
        });
    };
    /**
     * Keeps successful completion quiet and reports only actionable problems.
     * @param result - Persisted preference and completed command outcomes.
     */
    const report = (result: AutomaticAliasChangeResult) => {
        const problems = result.outcomes.filter(
            (item) => item.status === 'failed' || item.status === 'skipped',
        );
        if (!problems.length) return;
        const failed = problems.filter(
            (item) => item.status === 'failed',
        ).length;
        const skipped = problems.length - failed;
        const summary = [
            failed ? `${t('aliases.automatic.bulk.failed')}: ${failed}` : '',
            skipped ? `${t('aliases.automatic.bulk.skipped')}: ${skipped}` : '',
            problems[0].error || problems[0].reason || '',
        ]
            .filter(Boolean)
            .join('. ');
        showNotification({
            title: t('aliases.automatic.bulk.resultsTitle'),
            description: summary,
            tone: 'warning',
            durationMs: 15000,
        });
    };
    return { choose, report };
}
