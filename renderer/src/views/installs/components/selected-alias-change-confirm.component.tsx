import type {
    InstalledRelease,
    SelectedAliasChangePreview,
    SelectedAliasChangeRequest,
    SelectedAliasChangeResult,
} from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { ConfirmLayout } from '../../../components/confirm.component';
import { editorInstallsBridge } from '../../../renderer.bridge';

/** Reviews a counted selected-editor command change and keeps progress visible.
 * @param props - Immutable selection, command mode and completion callbacks.
 */
export function SelectedAliasChangeConfirm({
    editors,
    mode,
    renderLayout,
    close,
    onBusy,
    onRetry,
    initialPreview,
    onComplete,
}: {
    editors: InstalledRelease[];
    mode: SelectedAliasChangeRequest['mode'];
    renderLayout: ConfirmLayout;
    close: () => void;
    onBusy: (busy: boolean) => void;
    onRetry: () => Promise<void>;
    initialPreview?: SelectedAliasChangePreview;
    onComplete: (result: SelectedAliasChangeResult) => Promise<void>;
}) {
    const { t } = useTranslation('installs');
    const [preview, setPreview] = useState<
        SelectedAliasChangePreview | undefined
    >(initialPreview);
    const [error, setError] = useState<string>();
    const [result, setResult] = useState<SelectedAliasChangeResult>();
    const [attempt, setAttempt] = useState(0);
    const [applying, setApplying] = useState(false);
    const lock = useRef(false);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const request = useRef<
        | { attempt: number; promise: Promise<SelectedAliasChangePreview> }
        | undefined
    >(undefined);
    const failed =
        result?.outcomes.filter((item) => item.status === 'failed') ?? [];
    const problems =
        result?.outcomes.filter(
            (item) => item.status === 'failed' || item.status === 'skipped',
        ) ?? [];
    const details = result
        ? problems
        : (preview?.items.filter((item) => item.action === 'skip') ?? []);
    const targets = useRef(editors);
    useEffect(() => {
        let active = true;
        if (request.current?.attempt !== attempt)
            request.current = {
                attempt,
                promise:
                    attempt === 0 && initialPreview
                        ? Promise.resolve(initialPreview)
                        : editorInstallsBridge.previewSelectedAliasChange({
                              mode,
                              editors: targets.current,
                          }),
            };
        void request.current.promise
            .then((value) => {
                if (active) {
                    setPreview(value);
                    if (
                        attempt > 0 &&
                        mode === 'remove' &&
                        value.items.length === 0
                    )
                        close();
                }
            })
            .catch((cause) => {
                if (active)
                    setError(
                        cause instanceof Error ? cause.message : String(cause),
                    );
            });
        return () => {
            active = false;
        };
    }, [attempt, mode, initialPreview, close]);
    const count =
        preview?.items.filter((item) => item.action !== 'skip').length ?? 0;
    const skipped =
        preview?.items.filter((item) => item.action === 'skip').length ?? 0;
    /** Reloads a fresh preview without repeating completed command changes. */
    const retry = async () => {
        if (lock.current) return;
        lock.current = true;
        setApplying(true);
        onBusy(true);
        try {
            await onRetry();
            if (result && failed.length > 0)
                targets.current = editors.filter((editor) =>
                    failed.some(
                        (item) =>
                            item.version === editor.version &&
                            item.mono === editor.mono,
                    ),
                );
            setPreview(undefined);
            setError(undefined);
            setResult(undefined);
            setAttempt((value) => value + 1);
        } finally {
            lock.current = false;
            setApplying(false);
            onBusy(false);
        }
    };
    /** Commits the reviewed token once, reporting only actionable problems. */
    const apply = async () => {
        if (!preview || lock.current || count === 0) return;
        lock.current = true;
        setApplying(true);
        onBusy(true);
        try {
            const completed =
                await editorInstallsBridge.commitSelectedAliasChange(
                    preview.token,
                );
            setResult(completed);
            await onComplete(completed);
            if (
                completed.outcomes.every(
                    (item) =>
                        item.status === 'created' || item.status === 'removed',
                )
            )
                close();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            lock.current = false;
            setApplying(false);
            onBusy(false);
        }
    };
    return renderLayout(
        <div className="flex flex-col gap-3">
            <div
                role={error ? 'alert' : 'status'}
                aria-busy={applying || (!preview && !error)}
            >
                {applying ? (
                    <p className="flex items-center gap-2">
                        <span
                            className="loading loading-spinner loading-sm"
                            aria-hidden="true"
                        />
                        {t('aliases.pending')}
                    </p>
                ) : error ? (
                    <p className="text-error">{error}</p>
                ) : result ? (
                    <p>
                        {t('selection.problemSummary', {
                            failed: failed.length,
                            skipped: problems.length - failed.length,
                        })}
                    </p>
                ) : !preview ? (
                    <p>{t('aliases.automatic.bulk.loading')}</p>
                ) : (
                    <>
                        <p>
                            {t(
                                `selection.aliases.${mode === 'remove' ? 'removeSummary' : 'createSummary'}`,
                                { count },
                            )}
                        </p>
                        {skipped > 0 && (
                            <p className="mt-2 text-base-content/75">
                                {t('aliases.automatic.bulk.skippedSummary', {
                                    count: skipped,
                                })}
                            </p>
                        )}
                    </>
                )}
            </div>
            {mode === 'remove' ? (
                <p className="text-base-content/75">
                    <Trans
                        ns="installs"
                        i18nKey="selection.aliases.kept"
                        components={{
                            code: (
                                <code className="rounded bg-base-300 px-1 font-mono" />
                            ),
                        }}
                    />
                </p>
            ) : (
                <p className="text-base-content/75">
                    {t('selection.aliases.creationHelp')}
                </p>
            )}
            {details.length > 0 && (
                <details>
                    <summary className="cursor-pointer">
                        {t('selection.details')}
                    </summary>
                    <ul className="max-h-48 overflow-auto mt-2 flex flex-col gap-2">
                        {details.map((item) => (
                            <li key={`${item.version}_${item.mono}`}>
                                <code>{item.name}</code>:{' '}
                                {('error' in item &&
                                typeof item.error === 'string'
                                    ? item.error
                                    : undefined) ?? item.reason}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>,
        <>
            <button
                ref={cancelRef}
                type="button"
                className="btn btn-ghost text-base"
                disabled={applying}
                onClick={close}
            >
                {t(result ? 'selection.done' : 'common:buttons.cancel')}
            </button>
            {error ||
            failed.length > 0 ||
            (!result && preview && count === 0 && skipped > 0) ? (
                <button
                    type="button"
                    className="btn btn-primary text-base"
                    disabled={applying}
                    onClick={() => void retry()}
                >
                    {t('common:buttons.retry')}
                </button>
            ) : (
                !result && (
                    <button
                        type="button"
                        className={`btn ${mode === 'remove' ? 'btn-error' : 'btn-primary'} text-base`}
                        disabled={!preview || count === 0 || applying}
                        aria-busy={applying}
                        onClick={() => void apply()}
                    >
                        {t(
                            `selection.aliases.${mode === 'remove' ? 'remove' : 'create'}`,
                            { count },
                        )}
                    </button>
                )
            )}
        </>,
        {
            initialFocusRef: cancelRef,
            onRequestClose: () => {
                if (!lock.current) close();
            },
        },
    );
}
