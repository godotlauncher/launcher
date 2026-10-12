import type {
    ImportedTemplateBuild,
    PreparedTemplateImport,
    SelectedTemplateImport,
    TemplateImportProgress,
} from '@shared/contracts';
import { TriangleAlert, X } from 'lucide-react';
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
    const [errorStage, setErrorStage] = useState<
        'choose' | 'prepare' | 'save' | 'cleanup'
    >('choose');
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
            setErrorStage('cleanup');
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
        setErrorStage('choose');
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
        setErrorStage('cleanup');
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
        setErrorStage('prepare');
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
        if (
            !preview ||
            blocked ||
            !label.trim() ||
            label.trim().length > 80 ||
            (replace && replace.setId !== preview.setId)
        )
            return;
        setErrorStage('save');
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
    const errorKey =
        error.match(/exportTemplates:([\w.]+)/)?.[1] ??
        (error ? 'errors.failed' : '');
    const invalidFile =
        incompatible ||
        (errorStage === 'prepare' &&
            ['errors.archive', 'errors.identity', 'errors.unsafe'].includes(
                errorKey,
            ));
    const nameInvalid =
        review && !replace && (!label.trim() || label.trim().length > 80);
    const recoveryRequired = errorKey === 'errors.recovery';
    const missingBuild = errorKey === 'library.missing';
    const needsNewFile = errorKey === 'errors.changed';
    const processing = busy === 'prepare' || busy === 'save';
    /** Formats the version and edition for a package comparison.
     * @param setId - Package version identity, including an optional .NET suffix.
     */
    const packageVersion = (setId: string) =>
        `${setId.replace(/\.mono$/, '')} - ${t(setId.endsWith('.mono') ? 'editions.dotnet' : 'editions.standard')}`;
    const notice = errorKey
        ? t(errorKey)
        : incompatible
          ? t('library.replacementMismatch', {
                expected: packageVersion(replace.setId),
                actual: packageVersion(preview.setId),
            })
          : blocked
            ? t('errors.busy')
            : nameInvalid
              ? t('library.invalidLabel')
              : '';
    return (
        <Dialog
            title={t(replace ? 'library.replace' : 'library.importTitle')}
            tone={invalidFile ? 'error' : replace ? 'warning' : 'neutral'}
            testId="templateImportModal"
            panelClassName={`max-w-2xl ${processing || (review && !invalidFile) ? 'h-[min(36rem,85vh)]' : ''}`}
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
            onRequestClose={() => void close()}
            footer={
                <div className="flex w-full min-w-0 flex-col gap-3">
                    {notice && !processing && (
                        <p
                            role={
                                blocked && !errorKey && !incompatible
                                    ? 'status'
                                    : 'alert'
                            }
                            className="flex items-start gap-2 text-sm text-error-content dark:text-error"
                        >
                            <TriangleAlert
                                className="mt-0.5 size-4 shrink-0"
                                aria-hidden="true"
                            />
                            <span className="min-w-0 break-words">
                                {notice}
                            </span>
                        </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={
                                cancelling ||
                                busy === 'choose' ||
                                busy === 'save'
                            }
                            onClick={() => void close()}
                        >
                            {t('cancel')}
                        </button>
                        {invalidFile || needsNewFile ? (
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={!!busy || blocked}
                                onClick={() => void choose()}
                            >
                                {t('library.chooseAnotherFile')}
                            </button>
                        ) : recoveryRequired || missingBuild ? null : (
                            <>
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
                                        (review
                                            ? nameInvalid || incompatible
                                            : !selected)
                                    }
                                    onClick={() =>
                                        void (review ? save() : next())
                                    }
                                >
                                    {t(
                                        review
                                            ? 'library.save'
                                            : 'library.next',
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            }
        >
            <div
                className="flex min-h-0 flex-1 flex-col gap-3 text-base"
                aria-busy={!!busy}
            >
                {processing ? (
                    <div
                        role="status"
                        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4"
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
                                        )}{' '}
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
                ) : invalidFile ? (
                    <div className="flex min-h-0 flex-col gap-4">
                        <h2 className="font-semibold">
                            {t(
                                incompatible
                                    ? 'library.cannotReplace'
                                    : 'library.cannotImport',
                            )}
                        </h2>
                        <p
                            className="truncate font-medium"
                            title={selected?.archiveName}
                        >
                            {selected?.archiveName}
                        </p>
                        {incompatible && replace && preview && (
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md bg-base-200/50 p-3 text-sm">
                                <dt>{t('library.existingBuild')}</dt>
                                <dd className="break-words">
                                    {packageVersion(replace.setId)}
                                </dd>
                                <dt>{t('library.selectedFile')}</dt>
                                <dd className="break-words">
                                    {packageVersion(preview.setId)}
                                </dd>
                            </dl>
                        )}
                    </div>
                ) : !review ? (
                    <>
                        <p className="shrink-0 text-base-content/75">
                            {t('library.importDetail')}
                        </p>
                        <button
                            type="button"
                            className="btn shrink-0 self-start"
                            disabled={!!busy}
                            onClick={() => void choose()}
                        >
                            {t('library.chooseFile')}
                        </button>
                        {selected && (
                            <div className="flex min-h-0 items-start gap-3 rounded-md border border-base-content/10 bg-base-200/50 p-3">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <p
                                        className="truncate font-medium"
                                        title={selected.archiveName}
                                    >
                                        {selected.archiveName}
                                    </p>
                                    <p
                                        className="truncate text-sm text-base-content/70"
                                        title={selected.sourcePath}
                                    >
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
                            <div className="shrink-0 space-y-1 rounded-md border border-base-content/10 bg-base-200/50 px-3 py-2">
                                <p
                                    className="truncate font-medium"
                                    title={preview.archiveName}
                                >
                                    {preview.archiveName}
                                </p>
                                <p className="text-sm">
                                    <span>{packageVersion(preview.setId)}</span>{' '}
                                    -{' '}
                                    {t('fileCount', {
                                        number: preview.files.length,
                                    })}{' '}
                                    -{' '}
                                    {formatTemplateBytes(
                                        preview.sizeBytes,
                                        i18n.language,
                                    )}
                                </p>
                            </div>
                            {replace ? (
                                <div className="shrink-0 space-y-2">
                                    <p
                                        className="truncate font-medium"
                                        title={replace.label}
                                    >
                                        {t('library.replacingBuild', {
                                            label: replace.label,
                                        })}
                                    </p>
                                    <p className="text-sm text-[color:var(--color-warning-readable)]">
                                        {t('library.replaceSummary')}
                                    </p>
                                </div>
                            ) : (
                                <label className="block shrink-0 space-y-1">
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
                                        aria-invalid={
                                            !!nameInvalid ||
                                            [
                                                'library.invalidLabel',
                                                'library.duplicateLabel',
                                                'library.folderConflict',
                                            ].includes(errorKey)
                                        }
                                        onChange={(event) => {
                                            setLabel(event.target.value);
                                            if (
                                                [
                                                    'library.invalidLabel',
                                                    'library.duplicateLabel',
                                                    'library.folderConflict',
                                                ].includes(errorKey)
                                            )
                                                setError('');
                                        }}
                                    />
                                </label>
                            )}
                            <div
                                className="min-h-0 flex-1 overflow-y-auto overscroll-contain text-sm"
                                data-testid="templateImportDetails"
                            >
                                <details>
                                    <summary className="cursor-pointer font-medium">
                                        {t('library.packageDetails')}
                                    </summary>
                                    <div className="space-y-3 py-2">
                                        <TemplatePlatformBadges
                                            platforms={platforms}
                                        />
                                        {!replace && (
                                            <p className="text-base-content/70">
                                                {t('library.tagFolderDetail')}
                                            </p>
                                        )}
                                        <ul
                                            aria-label={t('picker.files')}
                                            className="space-y-1 rounded-md bg-base-200 p-3"
                                        >
                                            {preview.files.map((file) => (
                                                <li
                                                    className="break-all"
                                                    key={file}
                                                >
                                                    {file}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </details>
                                {replace && !!users.length && (
                                    <details className="mt-2">
                                        <summary className="cursor-pointer font-medium">
                                            {t('library.affectedProjects')} (
                                            {users.length})
                                        </summary>
                                        <p className="break-words py-2">
                                            {users.join(', ')}
                                        </p>
                                    </details>
                                )}
                            </div>
                        </>
                    )
                )}
            </div>
        </Dialog>
    );
}
