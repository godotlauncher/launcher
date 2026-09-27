import type {
    ImportedTemplateBuild,
    PreparedTemplateImport,
    SelectedTemplateImport,
    TemplateImportProgress,
} from '@shared/contracts';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import { exportTemplatesBridge } from '../../../renderer.bridge';
import { formatTemplateBytes } from '../template-format.util';
import {
    importedTemplatePlatforms,
    TemplatePlatformBadges,
} from './template-platform-badges.component';

type Props = {
    replace?: ImportedTemplateBuild;
    blocked?: boolean;
    users?: string[];
    onClose: () => void;
    onImported: (id: string, setId: string) => void;
};
/** Selects a package, then reviews its contents and name before installation.
 * @param props - Optional replacement and modal callbacks.
 */
export function TemplateImportModal({
    replace,
    blocked = false,
    users = [],
    onClose,
    onImported,
}: Props) {
    const { t, i18n } = useTranslation('exportTemplates');
    const [selected, setSelected] = useState<SelectedTemplateImport | null>(
        null,
    );
    const [preview, setPreview] = useState<PreparedTemplateImport | null>(null);
    const [review, setReview] = useState(false);
    const [label, setLabel] = useState(replace?.label ?? '');
    const [busy, setBusy] = useState<'choose' | 'prepare' | 'save' | null>(
        null,
    );
    const [error, setError] = useState('');
    const [progress, setProgress] = useState<TemplateImportProgress | null>(
        null,
    );
    const [cancelling, setCancelling] = useState(false);
    const closed = useRef(false);
    const cancelRequested = useRef(false);
    useEffect(() => {
        if (busy !== 'prepare' || !selected) return;
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        /** Refreshes byte counters while preparation is active. */
        const poll = async () => {
            try {
                const value =
                    await exportTemplatesBridge.getTemplateImportProgress(
                        selected.token,
                    );
                if (active && !closed.current && value) setProgress(value);
            } catch {
                // Keep the last counters if a progress request fails.
            } finally {
                if (active) timer = setTimeout(() => void poll(), 200);
            }
        };
        void poll();
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [busy, selected]);
    const token = useRef<string | undefined>(undefined);
    useEffect(() => {
        closed.current = false;
        return () => {
            closed.current = true;
            if (token.current)
                void exportTemplatesBridge.discardTemplateImport(token.current);
        };
    }, []);

    /** Closes the dialog after aborting preparation and removing its temporary files. */
    const close = async () => {
        if (
            closed.current ||
            cancelRequested.current ||
            cancelling ||
            busy === 'save' ||
            busy === 'choose'
        )
            return;
        if (busy === 'prepare' && token.current) {
            cancelRequested.current = true;
            setCancelling(true);
            try {
                await exportTemplatesBridge.discardTemplateImport(
                    token.current,
                );
                token.current = undefined;
            } catch (failure) {
                if (closed.current) return;
                cancelRequested.current = false;
                setError(String(failure));
                setBusy(null);
                setCancelling(false);
                return;
            }
        }
        if (closed.current) return;
        closed.current = true;
        onClose();
    };

    /** Clears the selection and its temporary preview, preserving the entered name. */
    const clear = async () => {
        if (token.current)
            await exportTemplatesBridge.discardTemplateImport(token.current);
        token.current = undefined;
        setSelected(null);
        setPreview(null);
        setReview(false);
        setError('');
    };
    /** Selects a file without processing the archive. */
    const choose = async () => {
        setBusy('choose');
        setError('');
        try {
            const next = await exportTemplatesBridge.chooseTemplateImport();
            if (!next) return;
            await clear();
            token.current = next.token;
            setSelected(next);
        } catch (failure) {
            setError(String(failure));
        } finally {
            setBusy(null);
        }
    };
    /** Removes the selected file and any prepared contents. */
    const remove = async () => {
        setBusy('choose');
        try {
            await clear();
        } catch (failure) {
            setError(String(failure));
        } finally {
            setBusy(null);
        }
    };
    /** Processes the selected file only when Next is pressed. */
    const next = async () => {
        if (!selected || blocked) return;
        setError('');
        if (preview) {
            setReview(true);
            return;
        }
        setProgress(null);
        setBusy('prepare');
        try {
            const prepared = await exportTemplatesBridge.prepareTemplateImport(
                selected.token,
            );
            if (!closed.current && !cancelRequested.current) {
                setPreview(prepared);
                setReview(true);
            }
        } catch (failure) {
            if (!closed.current && !cancelRequested.current)
                setError(String(failure));
        } finally {
            if (!closed.current && !cancelRequested.current) setBusy(null);
        }
    };
    /** Saves the reviewed package using the existing library operation. */
    const save = async () => {
        if (!preview || blocked) return;
        setBusy('save');
        setError('');
        try {
            const id = await exportTemplatesBridge.installTemplateImport(
                preview.token,
                label,
                replace?.id,
            );
            token.current = undefined;
            closed.current = true;
            onImported(id, preview.setId);
        } catch (failure) {
            if (!closed.current) setError(String(failure));
        } finally {
            if (!closed.current) setBusy(null);
        }
    };
    const platforms = importedTemplatePlatforms(preview?.files ?? []);
    const incompatible = !!(
        replace &&
        preview &&
        replace.setId !== preview.setId
    );
    return (
        <Dialog
            title={t(replace ? 'library.replace' : 'library.importTitle')}
            tone={replace ? 'warning' : 'neutral'}
            onRequestClose={() => void close()}
            footer={
                <>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={
                            cancelling || busy === 'choose' || busy === 'save'
                        }
                        onClick={() => void close()}
                    >
                        {t('cancel')}
                    </button>
                    {review && (
                        <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={!!busy}
                            onClick={() => {
                                setReview(false);
                                setError('');
                            }}
                        >
                            {t('common:buttons.back')}
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={
                            !!busy ||
                            blocked ||
                            (review ? !label.trim() || incompatible : !selected)
                        }
                        onClick={() => void (review ? save() : next())}
                    >
                        {t(review ? 'library.save' : 'library.next')}
                    </button>
                </>
            }
        >
            <div className="space-y-4 text-base" aria-busy={!!busy}>
                {blocked && <p role="status">{t('errors.busy')}</p>}
                {busy === 'prepare' || busy === 'save' ? (
                    <div
                        role="status"
                        className="flex min-h-48 flex-col items-center justify-center gap-4"
                    >
                        <span
                            className="loading loading-spinner loading-lg text-primary"
                            aria-hidden="true"
                        />
                        {busy === 'prepare' &&
                            progress &&
                            progress.totalBytes > 0 && (
                                <div className="w-full max-w-xs space-y-2 text-center">
                                    <progress
                                        className="progress progress-primary w-full"
                                        aria-label={t('library.checking')}
                                        value={progress.completedBytes}
                                        max={progress.totalBytes}
                                    />
                                    <p>
                                        {Math.min(
                                            100,
                                            Math.floor(
                                                (progress.completedBytes /
                                                    progress.totalBytes) *
                                                    100,
                                            ),
                                        )}
                                        %
                                    </p>
                                    <p>
                                        {formatTemplateBytes(
                                            progress.completedBytes,
                                            i18n.language,
                                        )}{' '}
                                        /{' '}
                                        {formatTemplateBytes(
                                            progress.totalBytes,
                                            i18n.language,
                                        )}
                                    </p>
                                </div>
                            )}
                        <p>
                            {t(
                                busy === 'prepare'
                                    ? 'library.checking'
                                    : 'library.working',
                            )}
                        </p>
                    </div>
                ) : !review ? (
                    <>
                        <p className="text-base-content/75">
                            {t('library.importDetail')}
                        </p>
                        <button
                            type="button"
                            className="btn"
                            disabled={!!busy}
                            onClick={() => void choose()}
                        >
                            {t('library.chooseFile')}
                        </button>
                        {selected && (
                            <div className="flex items-start gap-3 rounded-md border border-base-content/10 bg-base-200/50 p-3">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <p className="break-all font-medium">
                                        {selected.archiveName}
                                    </p>
                                    <p className="break-all text-base-content/70">
                                        {selected.sourcePath}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-square btn-ghost shrink-0"
                                    aria-label={t('library.removeFile')}
                                    disabled={!!busy}
                                    onClick={() => void remove()}
                                >
                                    <X className="size-4" aria-hidden="true" />
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    preview && (
                        <>
                            <div className="space-y-3 rounded-md border border-base-content/10 bg-base-200/50 p-3">
                                <p className="break-all font-medium">
                                    {preview.archiveName}
                                </p>
                                <p>
                                    {preview.setId.replace(/\.mono$/, '')} -{' '}
                                    {t(
                                        preview.setId.endsWith('.mono')
                                            ? 'migration.edition.dotnet'
                                            : 'migration.edition.standard',
                                    )}
                                </p>
                                <TemplatePlatformBadges platforms={platforms} />
                                <p className="text-base-content/70">
                                    {t('fileCount', {
                                        number: preview.files.length,
                                    })}{' '}
                                    ·{' '}
                                    {formatTemplateBytes(
                                        preview.sizeBytes,
                                        i18n.language,
                                    )}
                                </p>
                            </div>
                            {replace ? (
                                <fieldset className="space-y-2">
                                    <legend className="font-medium">
                                        {t('library.tagName')}
                                    </legend>
                                    <p className="break-all rounded-md border border-base-content/10 bg-base-200/50 p-3">
                                        {replace.label}
                                    </p>
                                </fieldset>
                            ) : (
                                <>
                                    <label className="block space-y-2">
                                        <span className="font-medium">
                                            {t('library.tagName')}
                                        </span>
                                        <input
                                            className="input input-bordered w-full"
                                            maxLength={80}
                                            placeholder={t(
                                                'library.tagPlaceholder',
                                            )}
                                            value={label}
                                            onChange={(event) =>
                                                setLabel(event.target.value)
                                            }
                                        />
                                    </label>
                                    <p className="text-base-content/70">
                                        {t('library.tagFolderDetail')}
                                    </p>
                                </>
                            )}
                            {replace && (
                                <div className="alert alert-warning alert-soft block">
                                    <p>
                                        {t('library.replaceDetail', {
                                            label: replace.label,
                                        })}
                                    </p>
                                    {!!users.length && (
                                        <p className="mt-2">
                                            {users.join(', ')}
                                        </p>
                                    )}
                                </div>
                            )}
                            {incompatible && (
                                <p role="alert" className="text-error">
                                    {t('library.incompatible')}
                                </p>
                            )}
                        </>
                    )
                )}
                {error && (
                    <p role="alert" className="text-error">
                        {t(
                            error.match(/exportTemplates:([\w.]+)/)?.[1] ??
                                'errors.failed',
                        )}
                    </p>
                )}
            </div>
        </Dialog>
    );
}
