import type {
    TemplateStorageLocation,
    TemplateStorageMoveJob,
    TemplateStorageMoveReview,
    TemplateStorageSettings,
} from '@shared/contracts';
import { TriangleAlert } from 'lucide-react';
import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import { WaitingForDialogOverlay } from '../../../components/waiting-for-dialog-overlay.component';
import { appBridge, exportTemplatesBridge } from '../../../renderer.bridge';
import { formatTemplateBytes } from '../template-format.util';

/** Returns a safe translation key for a storage operation failure.
 * @param failure - Error returned by the main process.
 */
export function storageErrorKey(failure: unknown): string {
    return (
        String(failure).match(
            /exportTemplates:(storage\.errors\.[\w.]+)/,
        )?.[1] ?? 'storage.errors.failed'
    );
}

/** Identifies work that must keep the application locked.
 * @param job - Main-owned storage move.
 */
function moving(job: TemplateStorageMoveJob | null | undefined): boolean {
    return Boolean(
        job && !['complete', 'cancelled', 'error'].includes(job.stage),
    );
}

type StorageContext = {
    settings: TemplateStorageSettings | null;
    loadError: boolean;
    busy: boolean;
    watch: (active: boolean) => void;
    refresh: () => Promise<TemplateStorageSettings | null>;
    choose: (location: TemplateStorageLocation) => Promise<void>;
    returnToDefault: (location: TemplateStorageLocation) => Promise<void>;
    recover: () => Promise<void>;
};
const context = createContext<StorageContext | null>(null);

/** Shares storage settings and the application-wide move wizard. */
export function useTemplateStorage(): StorageContext {
    const value = useContext(context);
    if (!value) throw new Error('TemplateStorageProvider is required');
    return value;
}

/** Owns the move wizard outside page routes so an active move always blocks the app.
 * @param props - Application content beneath the modal.
 */
export function TemplateStorageProvider({ children }: PropsWithChildren) {
    const { t, i18n } = useTranslation(['exportTemplates', 'common']);
    const [settings, setSettings] = useState<TemplateStorageSettings | null>(
        null,
    );
    const [loadError, setLoadError] = useState(false);
    const [watching, watch] = useState(false);
    const [selection, setSelection] = useState<TemplateStorageLocation | null>(
        null,
    );
    const [destination, setDestination] = useState('');
    const [review, setReview] = useState<TemplateStorageMoveReview | null>(
        null,
    );
    const [operation, setOperation] = useState<
        'preparing' | 'starting' | 'recovering' | null
    >(null);
    const [showJob, setShowJob] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [actionError, setActionError] = useState('');
    const [cancelRequested, setCancelRequested] = useState(false);
    const request = useRef(0);
    const alive = useRef(true);
    const read = useRef<Promise<TemplateStorageSettings | null> | null>(null);
    const startingAfter = useRef<string | null | undefined>(undefined);
    const returnFocus = useRef<HTMLElement | null>(null);
    const job =
        showJob && settings?.job?.id !== startingAfter.current
            ? settings?.job
            : null;
    const activeMove = moving(settings?.job);
    const locked =
        activeMove || operation === 'starting' || operation === 'recovering';
    const visible = Boolean(selection || showJob || operation === 'recovering');

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            request.current++;
        };
    }, []);

    /** Refreshes main-owned state, sharing an in-flight read between callers. */
    const refresh = useCallback((): Promise<TemplateStorageSettings | null> => {
        if (read.current) return read.current;
        read.current = exportTemplatesBridge
            .getStorageSettings()
            .then(
                (next) => {
                    if (alive.current) {
                        setSettings(next);
                        setLoadError(false);
                        if (moving(next.job)) setShowJob(true);
                        if (
                            startingAfter.current !== undefined &&
                            next.job &&
                            next.job.id !== startingAfter.current
                        ) {
                            startingAfter.current = undefined;
                            setOperation(null);
                        }
                    }
                    return next;
                },
                () => {
                    if (alive.current) setLoadError(true);
                    return null;
                },
            )
            .finally(() => {
                read.current = null;
            });
        return read.current;
    }, []);

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof window.setTimeout>;
        const poll = async () => {
            await refresh();
            if (!stopped && (watching || visible || activeMove))
                timer = window.setTimeout(() => void poll(), 500);
        };
        void poll();
        const focus = () => void refresh();
        window.addEventListener('focus', focus);
        return () => {
            stopped = true;
            window.clearTimeout(timer);
            window.removeEventListener('focus', focus);
        };
    }, [watching, visible, activeMove, refresh]);

    useEffect(() => {
        if (!locked) return;
        /** Prevents closing or reloading the renderer during the file move.
         * @param event - Window close or reload request.
         */
        const preventClose = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', preventClose);
        return () => window.removeEventListener('beforeunload', preventClose);
    }, [locked]);

    /** Opens the shared review for a selected storage destination.
     * @param location - Store to relocate.
     * @param next - Destination selected by the user.
     * @param currentRequest - Request generation used to discard a cancelled review.
     */
    const prepare = async (
        location: TemplateStorageLocation,
        next: string,
        currentRequest: number,
    ) => {
        setSelection(location);
        setDestination(next);
        setReview(null);
        setShowJob(false);
        setActionError('');
        setCancelRequested(false);
        setOperation('preparing');
        try {
            const prepared = await exportTemplatesBridge.prepareStorageMove(
                location.kind,
                next,
            );
            if (alive.current && currentRequest === request.current)
                setReview(prepared);
        } catch (failure) {
            if (alive.current && currentRequest === request.current)
                setActionError(storageErrorKey(failure));
        } finally {
            if (alive.current && currentRequest === request.current)
                setOperation(null);
        }
    };

    /** Chooses a destination and opens its review without changing any files.
     * @param location - Store to relocate.
     */
    const choose = async (location: TemplateStorageLocation) => {
        if (locked || pickerOpen || operation) return;
        if (!visible)
            returnFocus.current = document.activeElement as HTMLElement;
        const currentRequest = ++request.current;
        setPickerOpen(true);
        try {
            const result = await appBridge.openFileDialog(
                selection?.kind === location.kind
                    ? destination
                    : location.storagePath,
                t('storage.destination'),
                [],
                ['openDirectory', 'createDirectory', 'promptToCreate'],
            );
            if (!alive.current || currentRequest !== request.current) return;
            const next = result.filePaths[0];
            if (result.canceled || !next || next === location.storagePath)
                return;
            await prepare(location, next, currentRequest);
        } catch (failure) {
            if (alive.current && currentRequest === request.current) {
                if (!visible) {
                    setSelection(location);
                    setDestination('');
                    setReview(null);
                    setShowJob(false);
                }
                setActionError(storageErrorKey(failure));
            }
        } finally {
            if (alive.current && currentRequest === request.current)
                setPickerOpen(false);
        }
    };

    /** Reviews the direct route back to Godot's default official template folder.
     * @param location - Relocated official store.
     */
    const returnToDefault = async (location: TemplateStorageLocation) => {
        if (
            location.kind !== 'official' ||
            location.storagePath === location.defaultPath ||
            locked ||
            pickerOpen ||
            operation
        )
            return;
        if (!visible)
            returnFocus.current = document.activeElement as HTMLElement;
        await prepare(location, location.defaultPath, ++request.current);
    };

    /** Dismisses a review or a finished job while preserving active moves. */
    const close = () => {
        if (locked) return;
        request.current++;
        setSelection(null);
        setReview(null);
        setShowJob(false);
        setOperation(null);
        setPickerOpen(false);
        setActionError('');
    };

    /** Starts the reviewed move, retaining a blocking modal until the result is known. */
    const start = async () => {
        if (
            !review ||
            review.spaceSufficient === false ||
            operation ||
            settings?.busy
        )
            return;
        setOperation('starting');
        startingAfter.current = settings?.job?.id ?? null;
        setActionError('');
        try {
            await exportTemplatesBridge.startStorageMove(review.token);
            if (!alive.current) return;
            setShowJob(true);
            setSelection(null);
            setReview(null);
            await refresh();
        } catch (failure) {
            if (alive.current) {
                startingAfter.current = undefined;
                setActionError(storageErrorKey(failure));
                setReview(null);
                setOperation(null);
            }
        }
    };

    /** Cancels copying while the main process can still leave the original store intact. */
    const cancel = async () => {
        if (!job?.cancellable || cancelRequested) return;
        setCancelRequested(true);
        setActionError('');
        try {
            await exportTemplatesBridge.cancelStorageMove(job.id);
            await refresh();
        } catch (failure) {
            if (alive.current) {
                setActionError(storageErrorKey(failure));
                setCancelRequested(false);
            }
        }
    };

    /** Blocks interaction while repairing an interrupted move. */
    const recover = async () => {
        if (locked || operation) return;
        if (!visible)
            returnFocus.current = document.activeElement as HTMLElement;
        setOperation('recovering');
        setActionError('');
        try {
            await exportTemplatesBridge.recoverStorageMove();
            const next = await refresh();
            if (alive.current) setShowJob(Boolean(next?.job));
        } catch (failure) {
            if (alive.current) {
                setShowJob(true);
                setActionError(storageErrorKey(failure));
            }
        } finally {
            if (alive.current) setOperation(null);
        }
    };

    const title =
        operation === 'recovering'
            ? t('storage.recover')
            : locked
              ? t('storage.movingTitle')
              : job
                ? t(`storage.stages.${job.stage}`)
                : t('storage.reviewTitle');
    const progress = job
        ? t('storage.progress', {
              completed: formatTemplateBytes(job.completedBytes, i18n.language),
              total: formatTemplateBytes(job.totalBytes, i18n.language),
          })
        : '';

    const reviewing = Boolean(review && !showJob && operation !== 'starting');
    const failureKey =
        actionError ||
        (operation === 'recovering'
            ? ''
            : job?.error
              ? storageErrorKey(job.error)
              : job?.stage === 'error'
                ? 'storage.errors.failed'
                : '');
    const notices = [
        failureKey,
        loadError ? 'storage.loadError' : '',
        reviewing && review?.spaceSufficient === false
            ? 'storage.spaceInsufficient'
            : '',
        reviewing && settings?.busy && !failureKey ? 'storage.errors.busy' : '',
    ].filter(Boolean);
    const locationKind = review?.kind ?? job?.kind ?? selection?.kind;
    const target = review?.destination ?? job?.destination ?? destination;

    return (
        <context.Provider
            value={{
                settings,
                loadError,
                busy:
                    locked ||
                    Boolean(operation) ||
                    pickerOpen ||
                    Boolean(settings?.busy),
                watch,
                refresh,
                choose,
                returnToDefault,
                recover,
            }}
        >
            {children}
            {pickerOpen && !visible && (
                <div className="fixed inset-0 z-50">
                    <WaitingForDialogOverlay
                        message={t('storage.destination')}
                    />
                </div>
            )}
            {visible && (
                <Dialog
                    title={title}
                    testId="templateStorageMoveDialog"
                    panelClassName={`max-w-2xl ${reviewing ? 'h-[min(36rem,85vh)]' : ''}`}
                    bodyClassName="flex min-h-0 flex-col gap-3 overflow-hidden"
                    returnFocusRef={returnFocus}
                    onRequestClose={close}
                    tone={
                        failureKey || loadError
                            ? 'error'
                            : reviewing && review?.spaceSufficient === false
                              ? 'warning'
                              : job?.stage === 'complete'
                                ? 'success'
                                : 'neutral'
                    }
                    footer={
                        <div className="flex w-full min-w-0 flex-col gap-3">
                            {!!notices.length && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-2 text-sm text-error-content dark:text-error"
                                >
                                    <TriangleAlert
                                        className="mt-0.5 size-4 shrink-0"
                                        aria-hidden="true"
                                    />
                                    <div className="min-w-0 space-y-1 break-words">
                                        {notices.map((key) => (
                                            <p key={key}>{t(key)}</p>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="flex min-h-10 flex-wrap justify-end gap-2">
                                {loadError && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost mr-auto"
                                        onClick={() => void refresh()}
                                    >
                                        {t('storage.retry')}
                                    </button>
                                )}
                                {locked ? (
                                    job?.cancellable &&
                                    operation !== 'recovering' && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost text-base"
                                            disabled={cancelRequested}
                                            onClick={() => void cancel()}
                                        >
                                            {t('common:buttons.cancel')}
                                        </button>
                                    )
                                ) : job || (showJob && !selection) ? (
                                    <>
                                        {job?.recoveryRequired && (
                                            <button
                                                type="button"
                                                className="btn btn-warning text-base"
                                                onClick={() => void recover()}
                                            >
                                                {t('storage.recover')}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="btn btn-primary text-base"
                                            onClick={close}
                                        >
                                            {t('storage.done')}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            className="btn btn-ghost text-base"
                                            onClick={close}
                                        >
                                            {t('common:buttons.cancel')}
                                        </button>
                                        {selection &&
                                            operation !== 'preparing' && (
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost text-base"
                                                    disabled={pickerOpen}
                                                    onClick={() =>
                                                        void choose(selection)
                                                    }
                                                >
                                                    {t('storage.chooseAnother')}
                                                </button>
                                            )}
                                        {review && (
                                            <button
                                                type="button"
                                                className="btn btn-primary text-base"
                                                disabled={
                                                    review.spaceSufficient ===
                                                        false ||
                                                    Boolean(operation) ||
                                                    pickerOpen ||
                                                    Boolean(settings?.busy)
                                                }
                                                onClick={() => void start()}
                                            >
                                                {t('storage.moveTemplates')}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    }
                >
                    {locationKind && (
                        <p className="shrink-0 font-semibold">
                            {t(`storage.${locationKind}`)}
                        </p>
                    )}
                    {operation === 'preparing' ? (
                        <p role="status" className="flex items-center gap-2">
                            <span
                                className="loading loading-spinner loading-sm"
                                aria-hidden="true"
                            />
                            {t('storage.preparingReview')}
                        </p>
                    ) : (
                        <>
                            {reviewing && review && (
                                <p className="shrink-0 text-sm">
                                    {t('storage.moveSummary', {
                                        count: review.templateCount,
                                        size: formatTemplateBytes(
                                            review.sizeBytes,
                                            i18n.language,
                                        ),
                                    })}
                                </p>
                            )}
                            {target && (
                                <div className="shrink-0 min-w-0">
                                    {!reviewing && (
                                        <p className="text-sm text-base-content/70">
                                            {t('storage.destinationSummary')}
                                        </p>
                                    )}
                                    <p
                                        className="truncate font-medium"
                                        title={target}
                                    >
                                        {target}
                                    </p>
                                </div>
                            )}
                            {reviewing && review && (
                                <>
                                    <div className="shrink-0 space-y-1 text-sm">
                                        <p>
                                            {review.availableBytes === null
                                                ? t('storage.spaceUnknown')
                                                : `${t('storage.availableSpace')}: ${formatTemplateBytes(review.availableBytes, i18n.language)}`}
                                        </p>
                                        {review.spaceSufficient === true && (
                                            <p className="text-success-content dark:text-success">
                                                {t('storage.spaceEnough')}
                                            </p>
                                        )}
                                    </div>
                                    <p className="shrink-0 text-sm text-[color:var(--color-warning-readable)]">
                                        {t('storage.warning')}
                                    </p>
                                    {!!review.projects.length && (
                                        <div
                                            className="min-h-0 flex-1 overflow-y-auto"
                                            data-testid="templateStorageProjects"
                                        >
                                            <details>
                                                <summary className="cursor-pointer text-sm font-medium">
                                                    {t(
                                                        'storage.affectedProjects',
                                                    )}{' '}
                                                    ({review.projects.length})
                                                </summary>
                                                <p className="mt-2 whitespace-pre-line text-sm text-base-content/75">
                                                    {review.projects.join('\n')}
                                                </p>
                                            </details>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                    {(locked || job) && (
                        <div
                            data-testid="templateStorageProgress"
                            className="shrink-0 flex flex-col gap-3 text-sm"
                            role="status"
                            aria-live="polite"
                            aria-busy={locked}
                        >
                            {(locked || job?.stage !== 'error') && (
                                <p>
                                    {t(
                                        locked
                                            ? 'storage.movingNote'
                                            : job?.stage === 'complete'
                                              ? 'storage.finishedNote'
                                              : 'storage.cancelledNote',
                                    )}
                                </p>
                            )}
                            {job && (
                                <p className="flex items-center gap-2">
                                    {locked && (
                                        <span
                                            className="loading loading-spinner loading-sm"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {t(
                                        operation === 'recovering'
                                            ? 'storage.recover'
                                            : `storage.stages.${job.stage}`,
                                    )}{' '}
                                    - {progress}
                                </p>
                            )}
                            {locked && (
                                <progress
                                    className="progress progress-primary w-full"
                                    aria-label={title}
                                    max={100}
                                    value={
                                        job &&
                                        ['moving', 'verifying'].includes(
                                            job.stage,
                                        ) &&
                                        job.totalBytes
                                            ? Math.min(
                                                  100,
                                                  (100 * job.completedBytes) /
                                                      job.totalBytes,
                                              )
                                            : undefined
                                    }
                                />
                            )}
                        </div>
                    )}
                </Dialog>
            )}
        </context.Provider>
    );
}
