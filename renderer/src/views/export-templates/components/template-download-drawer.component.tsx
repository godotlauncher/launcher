import type { ExportTemplateSet, TemplatePackage } from '@shared/contracts';
import { Info, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer } from '../../../components/ui/drawer/drawer.component';
import { FileSelectionTree } from '../../../components/ui/file-selection-tree/file-selection-tree.component';
import { getFileLeaves } from '../../../components/ui/file-selection-tree/file-selection-tree.model';
import { useRelease } from '../../../hooks/release.hook';
import { exportTemplatesBridge } from '../../../renderer.bridge';
import {
    refreshTemplateJobs,
    useTemplateJobs,
} from '../hooks/template-jobs.hook';
import { getTemplateCatalogueReleases } from '../template-catalogue.model';
import { getTemplateDownloadFailure } from '../template-download-error.util';
import { getTemplateFileTree } from '../template-file-tree.model';
import { formatTemplateBytes } from '../template-format.util';
import { TemplateFullDownload } from './template-full-download.component';
import {
    TemplateVersionPicker,
    type TemplateVersionSelection,
} from './template-version-picker.component';

type TemplateDownloadDrawerProps = {
    open: boolean;
    sets: ExportTemplateSet[];
    manageSet?: ExportTemplateSet | null;
    onOpenChange: (open: boolean) => void;
    onSave: (token: string, selected: string[]) => Promise<boolean>;
    onImport: () => void;
    onChooseVersion: () => void;
};

/** Hosts template selection and stages additions and removals for Save.
 * Refreshes an open, unedited selection when the window regains focus.
 * @param props - Drawer visibility and current local template inventory.
 */
export function TemplateDownloadDrawer({
    open,
    sets,
    manageSet,
    onOpenChange,
    onSave,
    onImport,
    onChooseVersion,
}: TemplateDownloadDrawerProps) {
    const { t, i18n } = useTranslation(['exportTemplates', 'menus']);
    const { catalogueReleases } = useRelease();
    const catalogue = useMemo(
        () => getTemplateCatalogueReleases(catalogueReleases),
        [catalogueReleases],
    );
    const [picked, setSelection] = useState<TemplateVersionSelection | null>(
        null,
    );
    const selection = useMemo(() => {
        if (!manageSet) return picked;
        for (const release of catalogue) {
            const asset = release.templateAssets?.find(
                (asset) =>
                    `${release.tag.replace('-', '.')}${asset.flavor === 'dotnet' ? '.mono' : ''}` ===
                    manageSet.id,
            );
            if (asset) return { release, asset };
        }
        return null;
    }, [manageSet, picked, catalogue]);
    const [localOnly, setLocalOnly] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [packageInfo, setPackageInfo] = useState<TemplatePackage | null>(
        null,
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{
        key: string;
        phase: 'load' | 'catalogue' | 'save';
        action?: 'retry' | 'refresh' | 'choose';
    } | null>(null);
    const [saving, setSaving] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const jobs = useTemplateJobs();
    const [fullTransfer, setFullTransfer] = useState<{
        jobId?: string;
        error?: string;
    } | null>(null);
    const [fullActionPending, setFullActionPending] = useState(false);
    const [fullControlError, setFullControlError] = useState<string>();
    const fullJob = jobs.find((job) => job.id === fullTransfer?.jobId);
    const fullActive =
        fullTransfer !== null &&
        !fullTransfer.error &&
        (!fullJob ||
            !['complete', 'cancelled', 'error'].includes(fullJob.stage));
    const loadedIdentity = useRef<string | undefined>(undefined);
    const picker = useRef<HTMLFieldSetElement>(null);
    const dirty =
        packageInfo !== null &&
        (selected.length !== packageInfo.localFiles.length ||
            selected.some((file) => !packageInfo.localFiles.includes(file)));
    useEffect(() => {
        if (!open || dirty || saving || loading || fullTransfer) return;
        /** Reloads the visible package using its cached official file index. */
        const refresh = () => setAttempt((value) => value + 1);
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, [open, dirty, saving, loading, fullTransfer]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Retry deliberately reloads the current package.
    useEffect(() => {
        if (fullTransfer) return;
        let alive = true;
        let fallbackFailure:
            | ReturnType<typeof getTemplateDownloadFailure>
            | undefined;
        const identity = selection?.asset.id ?? manageSet?.id;
        if (!open || loadedIdentity.current !== identity) setPackageInfo(null);
        loadedIdentity.current = identity;
        setError(null);
        if ((!selection && !manageSet) || !open) return;
        setLocalOnly(false);
        setLoading(true);
        const load = selection
            ? exportTemplatesBridge.getPackage(
                  selection.release.id,
                  selection.asset.id,
              )
            : exportTemplatesBridge.getLocalPackage(manageSet?.id ?? '');
        void load
            .catch(async (failure) => {
                if (!manageSet || !selection) throw failure;
                fallbackFailure = getTemplateDownloadFailure(failure);
                if (alive) setLocalOnly(true);
                return exportTemplatesBridge.getLocalPackage(manageSet.id);
            })
            .then((info) => {
                if (!alive) return;
                setPackageInfo(info);
                if (manageSet && !selection) setLocalOnly(true);
                setSelected(info.localFiles);
                if (fallbackFailure)
                    setError({ ...fallbackFailure, phase: 'catalogue' });
            })
            .catch((failure) => {
                if (alive) {
                    setPackageInfo(null);
                    setError({
                        ...getTemplateDownloadFailure(failure),
                        phase: 'load',
                    });
                }
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [selection, manageSet, open, attempt, fullTransfer]);
    const files = packageInfo?.localFiles ?? [];
    const nodes = getTemplateFileTree(
        packageInfo?.files.map((file) => file.path) ?? [],
        files,
        Object.fromEntries(
            [
                'desktop',
                'mobile',
                'threaded',
                'singleThreaded',
                'extensions',
                'extensionsSingle',
                'common',
                'additional',
            ].map((key) => [key, t(`picker.${key}`)]),
        ),
    );
    const leaves = nodes.flatMap(getFileLeaves);
    const added = leaves.filter(
        (file) => !file.available && selected.includes(file.id),
    ).length;
    const removed =
        selection || manageSet
            ? leaves.filter(
                  (file) => file.available && !selected.includes(file.id),
              ).length
            : 0;
    const removeAll =
        removed > 0 &&
        added === 0 &&
        !leaves.some((file) => selected.includes(file.id));
    const title = manageSet
        ? `${t('manage')} ${manageSet.version} - ${t(`editions.${manageSet.edition}`)}`
        : t('picker.title');
    /** Opens the version selector after leaving an unavailable or unreadable package. */
    const chooseVersion = () => {
        setFullTransfer(null);
        setSelection(null);
        setSelected([]);
        setPackageInfo(null);
        setError(null);
        onChooseVersion();
        requestAnimationFrame(() =>
            picker.current?.querySelector('button')?.click(),
        );
    };
    /** Opens the existing TPZ import flow after clearing the failed selection. */
    const importPackage = () => {
        setFullTransfer(null);
        setSelection(null);
        setSelected([]);
        onOpenChange(false);
        onImport();
    };
    /** Starts an explicit complete-package download using the selected catalogue IDs. */
    const startFullPackage = async () => {
        if (!selection) return;
        setFullControlError(undefined);
        setFullTransfer({});
        setFullActionPending(true);
        try {
            const jobId = await exportTemplatesBridge.downloadFullPackage(
                selection.release.id,
                selection.asset.id,
            );
            setFullTransfer({ jobId });
            void refreshTemplateJobs().catch(() => undefined);
        } catch (failure) {
            setFullTransfer({ error: String(failure) });
        } finally {
            setFullActionPending(false);
        }
    };
    /** Cancels preparation or download, keeping the drawer open for confirmation. */
    const cancelFullPackage = async () => {
        if (!fullTransfer?.jobId) return;
        setFullControlError(undefined);
        setFullActionPending(true);
        try {
            await exportTemplatesBridge.cancel(fullTransfer.jobId);
            // Queued cancellation removes the queue entry immediately.
            const current = await exportTemplatesBridge.getJobs();
            if (!current.some((job) => job.id === fullTransfer.jobId))
                setFullTransfer({
                    error: 'exportTemplates:picker.fullCancelled',
                });
            void refreshTemplateJobs().catch(() => undefined);
        } catch (failure) {
            setFullControlError(String(failure));
        } finally {
            setFullActionPending(false);
        }
    };
    const recoveryDisabled =
        loading || saving || (error?.phase === 'catalogue' && dirty);
    return (
        <Drawer
            open={open}
            onOpenChange={(nextOpen) => {
                if (fullActive) return;
                if (!nextOpen) {
                    setFullTransfer(null);
                    setSelected([]);
                    setSelection(null);
                }
                onOpenChange(nextOpen);
            }}
            closeOnEscape={!fullActive}
            closeOnBackdrop={!fullActive}
            side="right"
            width={700}
            testId="templateDownloadDrawer"
            ariaLabel={title}
        >
            <Drawer.Header className="py-3">
                <Drawer.Title className="text-lg font-semibold">
                    {title}
                </Drawer.Title>
                <Drawer.CloseButton
                    className="btn-sm"
                    disabled={fullActive}
                    aria-label={t('menus:app.close')}
                />
            </Drawer.Header>
            <Drawer.Body
                scrollable={false}
                className="flex min-h-0 flex-col gap-4 pt-2 pb-1 text-base"
            >
                {!manageSet && (
                    <fieldset
                        ref={picker}
                        disabled={saving || fullActive}
                        className="shrink-0"
                    >
                        <TemplateVersionPicker
                            catalogue={catalogue}
                            selection={selection}
                            sets={sets}
                            onChange={(next) => {
                                setFullTransfer(null);
                                setSelection(next);
                                const nextId = `${next.release.tag.replace('-', '.')}${next.asset.flavor === 'dotnet' ? '.mono' : ''}`;
                                setSelected(
                                    sets.find((set) => set.id === nextId)
                                        ?.files ?? [],
                                );
                            }}
                        />
                    </fieldset>
                )}
                {fullTransfer || selection || manageSet ? (
                    <section
                        aria-label={t('picker.files')}
                        className="flex min-h-0 flex-1 flex-col gap-3"
                    >
                        <div className="shrink-0 space-y-2">
                            <h3 className="font-semibold">
                                {t('picker.files')}
                            </h3>
                            {!fullTransfer &&
                                localOnly &&
                                !loading &&
                                error?.phase !== 'load' &&
                                error?.phase !== 'catalogue' && (
                                    <p className="flex items-start gap-2 text-sm text-base-content/70">
                                        <Info
                                            className="mt-0.5 size-4 shrink-0"
                                            aria-hidden="true"
                                        />
                                        {t('picker.localOnly')}
                                    </p>
                                )}
                            {!fullTransfer && loading && (
                                <p
                                    role="status"
                                    className="flex items-center gap-2 text-sm"
                                >
                                    <span
                                        className="loading loading-spinner loading-sm text-primary"
                                        aria-hidden="true"
                                    />
                                    {t('picker.loading')}
                                </p>
                            )}
                            {!fullTransfer &&
                                packageInfo &&
                                !loading &&
                                error?.phase !== 'load' && (
                                    <p
                                        role="status"
                                        className="text-sm text-base-content/60"
                                    >
                                        {t('picker.changes', {
                                            added,
                                            removed,
                                        })}
                                    </p>
                                )}
                        </div>
                        {fullTransfer ? (
                            <>
                                <TemplateFullDownload
                                    part="status"
                                    job={fullJob}
                                    failure={fullTransfer.error}
                                    controlFailure={fullControlError}
                                />
                                <p className="shrink-0 text-sm text-base-content/70">
                                    {t('picker.fullKeepFiles')}
                                </p>
                            </>
                        ) : (
                            <>
                                {error && (
                                    <div
                                        className={`shrink-0 text-sm ${error.phase === 'catalogue' ? 'space-y-1 rounded-md bg-warning/5 px-3 py-2' : 'space-y-3 rounded-lg border border-error/30 bg-error/5 p-4'}`}
                                    >
                                        <div
                                            role="alert"
                                            className={`flex items-start gap-2 ${error.phase === 'catalogue' ? 'text-warning-content dark:text-warning' : 'text-error-content dark:text-error'}`}
                                        >
                                            <TriangleAlert
                                                className="mt-0.5 size-4 shrink-0"
                                                aria-hidden="true"
                                            />
                                            <p>
                                                {t(
                                                    error.phase === 'catalogue'
                                                        ? 'picker.onlineFilesUnavailable'
                                                        : error.key,
                                                )}
                                            </p>
                                        </div>
                                        {error.phase === 'catalogue' &&
                                            dirty && (
                                                <p className="text-base-content/70">
                                                    {t(
                                                        'picker.refreshAfterChanges',
                                                    )}
                                                </p>
                                            )}
                                        {error.key ===
                                            'errors.downloadPartial' &&
                                            selection &&
                                            !recoveryDisabled && (
                                                <div className="space-y-1 text-base-content/70">
                                                    <p className="font-medium text-base-content">
                                                        {t('picker.fullOffer', {
                                                            size: formatTemplateBytes(
                                                                selection.asset
                                                                    .sizeBytes,
                                                                i18n.language,
                                                            ),
                                                        })}
                                                    </p>
                                                    <p>
                                                        {t(
                                                            'picker.fullKeepFiles',
                                                        )}
                                                    </p>
                                                </div>
                                            )}
                                    </div>
                                )}
                                {removed > 0 && (
                                    <p className="flex shrink-0 items-start gap-2 text-sm text-warning-content dark:text-warning">
                                        <TriangleAlert
                                            className="mt-0.5 size-4 shrink-0"
                                            aria-hidden="true"
                                        />
                                        {t('picker.removalNotice')}
                                    </p>
                                )}
                                {packageInfo && error?.phase !== 'load' && (
                                    <div
                                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pl-1 pr-3"
                                        data-testid="templateFileTree"
                                    >
                                        <fieldset disabled={loading || saving}>
                                            <FileSelectionTree
                                                key={
                                                    selection?.asset.id ??
                                                    manageSet?.id
                                                }
                                                nodes={nodes}
                                                selected={selected}
                                                onChange={setSelected}
                                                label={t('picker.files')}
                                                labels={{
                                                    local: t('picker.local'),
                                                    partial:
                                                        t('picker.partial'),
                                                    missing:
                                                        t('picker.missing'),
                                                    add: t('picker.willAdd'),
                                                    remove: t(
                                                        'picker.willRemove',
                                                    ),
                                                }}
                                            />
                                        </fieldset>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                ) : (
                    <p
                        role="status"
                        className="flex flex-1 items-center justify-center text-base-content/60"
                    >
                        {t('picker.chooseVersion')}
                    </p>
                )}
            </Drawer.Body>
            <Drawer.Footer className="flex flex-wrap items-center justify-end gap-3 py-2 text-base">
                {fullTransfer ? (
                    <TemplateFullDownload
                        part="actions"
                        job={fullJob}
                        failure={fullTransfer.error}
                        pending={fullActionPending}
                        canCancel={!!fullTransfer.jobId}
                        onRetry={() => void startFullPackage()}
                        onCancel={() => void cancelFullPackage()}
                        onRefresh={() => {
                            setFullTransfer(null);
                            setAttempt((value) => value + 1);
                        }}
                        onChooseVersion={chooseVersion}
                        onImport={importPackage}
                        onDone={() => {
                            setFullTransfer(null);
                            setSelection(null);
                            setSelected([]);
                            onOpenChange(false);
                        }}
                    />
                ) : (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {error?.key === 'errors.downloadPartial' &&
                            selection && (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={recoveryDisabled}
                                    onClick={() => void startFullPackage()}
                                >
                                    {t('picker.downloadFull')}
                                </button>
                            )}
                        {error && error.phase !== 'save' && (
                            <>
                                {error.action !== 'choose' && (
                                    <button
                                        type="button"
                                        className={`btn ${error.phase === 'load' && error.key !== 'errors.downloadPartial' ? 'btn-primary' : 'btn-ghost'}`}
                                        disabled={recoveryDisabled}
                                        onClick={() =>
                                            setAttempt((value) => value + 1)
                                        }
                                    >
                                        {t(
                                            error.action === 'refresh'
                                                ? 'picker.refreshFiles'
                                                : 'picker.tryAgain',
                                        )}
                                    </button>
                                )}
                                {error.action === 'choose' && (
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        disabled={recoveryDisabled}
                                        onClick={chooseVersion}
                                    >
                                        {t('picker.chooseAnotherVersion')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    disabled={recoveryDisabled}
                                    onClick={importPackage}
                                >
                                    {t('import')}
                                </button>
                            </>
                        )}
                        {error?.phase !== 'load' && (
                            <button
                                type="button"
                                className={`btn ${removeAll ? 'btn-error' : 'btn-primary'} text-base`}
                                disabled={
                                    !packageInfo ||
                                    loading ||
                                    saving ||
                                    (!added && !removed)
                                }
                                onClick={async () => {
                                    if (!packageInfo) return;
                                    setSaving(true);
                                    setError(null);
                                    try {
                                        if (
                                            !(await onSave(
                                                packageInfo.token,
                                                selected,
                                            ))
                                        ) {
                                            setError({
                                                key: 'picker.saveFailed',
                                                phase: 'save',
                                            });
                                            return;
                                        }
                                        setSelection(null);
                                        setSelected([]);
                                        onOpenChange(false);
                                    } catch {
                                        setError({
                                            key: 'picker.saveFailed',
                                            phase: 'save',
                                        });
                                    } finally {
                                        setSaving(false);
                                    }
                                }}
                            >
                                {saving && (
                                    <span
                                        className="loading loading-spinner loading-sm"
                                        aria-hidden="true"
                                    />
                                )}
                                {t(
                                    removeAll
                                        ? 'removeTemplates'
                                        : 'picker.save',
                                )}
                            </button>
                        )}
                    </div>
                )}
            </Drawer.Footer>
        </Drawer>
    );
}
