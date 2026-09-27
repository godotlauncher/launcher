import type {
    TemplateStorageLocation,
    TemplateStorageMoveJob,
    TemplateStorageMoveReview,
    TemplateStorageSettings,
} from '@shared/contracts';
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
            if (alive.current && currentRequest === request.current)
                setActionError(storageErrorKey(failure));
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
                    panelClassName="h-[min(26rem,85vh)] max-w-lg"
                    returnFocusRef={returnFocus}
                    onRequestClose={close}
                    tone={
                        actionError || job?.stage === 'error'
                            ? 'error'
                            : job?.stage === 'complete'
                              ? 'success'
                              : 'neutral'
                    }
                    footer={
                        locked ? (
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
                                {selection && operation !== 'preparing' && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost text-base"
                                        disabled={pickerOpen}
                                        onClick={() => void choose(selection)}
                                    >
                                        {t('storage.chooseAnother')}
                                    </button>
                                )}
                                {review && (
                                    <button
                                        type="button"
                                        className="btn btn-primary text-base"
                                        disabled={
                                            review.spaceSufficient === false ||
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
                        )
                    }
                >
                    <div
                        className="flex min-w-0 flex-col gap-4 text-base"
                        aria-busy={locked || operation === 'preparing'}
                    >
                        {operation === 'preparing' ? (
                            <p
                                role="status"
                                className="flex items-center gap-2"
                            >
                                <span className="loading loading-spinner loading-sm" />
                                {t('storage.preparingReview')}
                            </p>
                        ) : review && !showJob && operation !== 'starting' ? (
                            <>
                                <p>
                                    {t('storage.moveSummary', {
                                        count: review.templateCount,
                                        size: formatTemplateBytes(
                                            review.sizeBytes,
                                            i18n.language,
                                        ),
                                    })}
                                </p>
                                <p className="break-all font-semibold">
                                    {review.destination}
                                </p>
                                <div className="flex flex-col gap-1">
                                    <p>
                                        {review.availableBytes === null
                                            ? t('storage.spaceUnknown')
                                            : `${t('storage.availableSpace')}: ${formatTemplateBytes(
                                                  review.availableBytes,
                                                  i18n.language,
                                              )}`}
                                    </p>
                                    {review.spaceSufficient !== null && (
                                        <p
                                            className={
                                                review.spaceSufficient
                                                    ? 'text-success-content dark:text-success'
                                                    : 'text-error'
                                            }
                                            role={
                                                review.spaceSufficient
                                                    ? undefined
                                                    : 'alert'
                                            }
                                        >
                                            {t(
                                                review.spaceSufficient
                                                    ? 'storage.spaceEnough'
                                                    : 'storage.spaceInsufficient',
                                            )}
                                        </p>
                                    )}
                                </div>
                                <p className="text-base-content/75">
                                    {t('storage.warning')}
                                </p>
                            </>
                        ) : null}
                        {(locked || job) && (
                            <div
                                data-testid="templateStorageProgress"
                                className="flex flex-col gap-3"
                                role="status"
                                aria-live="polite"
                            >
                                <p>
                                    {t(
                                        locked
                                            ? 'storage.movingNote'
                                            : job?.stage === 'complete'
                                              ? 'storage.finishedNote'
                                              : job?.stage === 'cancelled'
                                                ? 'storage.cancelledNote'
                                                : 'storage.errors.failed',
                                    )}
                                </p>
                                {job && (
                                    <p>
                                        {t(`storage.stages.${job.stage}`)} -{' '}
                                        {progress}
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
                                                      (100 *
                                                          job.completedBytes) /
                                                          job.totalBytes,
                                                  )
                                                : undefined
                                        }
                                    />
                                )}
                            </div>
                        )}
                        {(actionError || job?.error) && (
                            <p className="text-error" role="alert">
                                {t(actionError || storageErrorKey(job?.error))}
                            </p>
                        )}
                        {loadError && (
                            <div role="alert">
                                <p className="text-error">
                                    {t('storage.loadError')}
                                </p>
                                <button
                                    type="button"
                                    className="btn btn-ghost text-base"
                                    onClick={() => void refresh()}
                                >
                                    {t('storage.retry')}
                                </button>
                            </div>
                        )}
                    </div>
                </Dialog>
            )}
        </context.Provider>
    );
}
