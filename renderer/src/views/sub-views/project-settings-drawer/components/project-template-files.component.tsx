import type {
    ProjectDetails,
    ProjectTemplateSettings,
    TemplatePackage,
} from '@shared/contracts';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import {
    type Ref,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Dialog } from '../../../../components/dialog.component';
import { FileSelectionTree } from '../../../../components/ui/file-selection-tree/file-selection-tree.component';
import { Tooltip } from '../../../../components/ui/tooltip.component';
import { exportTemplatesBridge } from '../../../../renderer.bridge';
import { refreshTemplateJobs } from '../../../export-templates/hooks/template-jobs.hook';
import { getTemplateFileTree } from '../../../export-templates/template-file-tree.model';
import { PendingChangesIndicator } from './pending-changes-indicator.component';

type Draft = { info: TemplatePackage; selected: string[]; localOnly: boolean };
export type ProjectTemplateFilesHandle = {
    submit: () => Promise<boolean>;
    discard: () => void;
};
type Props = {
    ref: Ref<ProjectTemplateFilesHandle>;
    project: ProjectDetails;
    sets: ProjectTemplateSettings['sets'];
    selectedSetId: string;
    buildSelections: Record<string, string>;
    disabled: boolean;
    active?: boolean;
    onDirtyChange: (dirty: boolean) => void;
    onConfirmationChange: (open: boolean) => void;
};

/** Whether a version has an explicitly edited file selection.
 * @param draft - Loaded files and desired selection for one version.
 */
function changed(draft: Draft): boolean {
    return (
        draft.selected.length !== draft.info.localFiles.length ||
        draft.selected.some((file) => !draft.info.localFiles.includes(file))
    );
}

/** Keeps version-specific drafts and saves only versions using Official templates.
 * @param props - Project collection, staged editor identity and drawer save handle.
 */
export function ProjectTemplateFiles({
    ref,
    project,
    sets,
    selectedSetId,
    buildSelections,
    disabled,
    active = true,
    onDirtyChange,
    onConfirmationChange,
}: Props) {
    const { t } = useTranslation('exportTemplates');
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [expanded, setExpanded] = useState(selectedSetId);
    useEffect(() => setExpanded(selectedSetId), [selectedSetId]);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [preparingDelete, setPreparingDelete] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const cancelDeleteRef = useRef<HTMLButtonElement>(null);
    const deleteTriggerRef = useRef<HTMLButtonElement>(null);
    const versionHeaderRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        onConfirmationChange(deleteId !== null);
        return () => onConfirmationChange(false);
    }, [deleteId, onConfirmationChange]);

    /** Stages removal using the existing project file-selection operation. */
    const stageDelete = async () => {
        if (!deleteId || preparingDelete) return;
        setPreparingDelete(true);
        setDeleteError('');
        try {
            const info =
                drafts[deleteId]?.info ??
                (await exportTemplatesBridge.getProjectPackage(
                    project.path,
                    true,
                    deleteId,
                ));
            setDrafts((current) => ({
                ...current,
                [deleteId]: {
                    ...(current[deleteId] ?? { info, localOnly: true }),
                    selected: [],
                },
            }));
            setDeleteId(null);
        } catch (failure) {
            setDeleteError(String(failure));
        } finally {
            setPreparingDelete(false);
        }
    };

    /** Formats a version and edition for actions and confirmations.
     * @param id - Version and edition identity.
     */
    const versionLabel = (id: string) =>
        `${id.replace(/\.mono$/, '')} - ${t(`editions.${id.endsWith('.mono') ? 'dotnet' : 'standard'}`)}`;
    const changedDrafts = Object.entries(drafts).filter(
        ([id, draft]) =>
            (buildSelections[id] ?? 'official') === 'official' &&
            changed(draft),
    );
    const dirty = !submitting && changedDrafts.length > 0;
    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
    const loaded = drafts[expanded]?.info;
    // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retries reload a failed selection.
    useEffect(() => {
        if (!active || !expanded || loaded || submitting) return;
        let alive = true;
        setError('');
        let localOnly = false;
        void exportTemplatesBridge
            .getProjectPackage(project.path, false, expanded)
            .catch(() => {
                localOnly = true;
                return exportTemplatesBridge.getProjectPackage(
                    project.path,
                    true,
                    expanded,
                );
            })
            .then((info) => {
                if (alive)
                    setDrafts((current) => ({
                        ...current,
                        [expanded]: current[expanded] ?? {
                            info,
                            selected: info.localFiles,
                            localOnly,
                        },
                    }));
            })
            .catch((failure) => {
                if (alive) setError(String(failure));
            });
        return () => {
            alive = false;
        };
    }, [active, expanded, loaded, project.path, submitting, attempt]);
    useImperativeHandle(ref, () => ({
        discard: () => setDrafts({}),
        submit: async () => {
            setSubmitting(true);
            onDirtyChange(false);
            try {
                for (const [id, draft] of changedDrafts) {
                    setExpanded(id);
                    const previous = new Set(
                        (await exportTemplatesBridge.getJobs()).map(
                            (job) => job.id,
                        ),
                    );
                    await exportTemplatesBridge.savePackage(
                        draft.info.token,
                        draft.selected,
                    );
                    await refreshTemplateJobs();
                    for (;;) {
                        const job = (
                            await exportTemplatesBridge.getJobs()
                        ).find(
                            (job) =>
                                !previous.has(job.id) &&
                                job.setIds?.includes(id),
                        );
                        if (job?.stage === 'complete') break;
                        if (
                            job?.stage === 'cancelled' ||
                            job?.stage === 'error'
                        ) {
                            setDrafts((current) => {
                                const next = { ...current };
                                delete next[id];
                                return next;
                            });
                            return false;
                        }
                        await new Promise((resolve) =>
                            setTimeout(resolve, 250),
                        );
                    }
                    setDrafts((current) => {
                        const next = { ...current };
                        delete next[id];
                        return next;
                    });
                }
                return true;
            } catch (failure) {
                setError(String(failure));
                return false;
            } finally {
                setSubmitting(false);
            }
        },
    }));
    const labels = Object.fromEntries(
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
    );
    const ids = selectedSetId ? [selectedSetId] : [];
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            {deleteId && (
                <Dialog
                    title={t('project.deleteTitle', {
                        version: deleteId.replace(/\.mono$/, ''),
                    })}
                    tone="error"
                    initialFocusRef={cancelDeleteRef}
                    returnFocusRef={deleteTriggerRef}
                    fallbackReturnFocusRef={versionHeaderRef}
                    bodyClassName="flex flex-col gap-3 overflow-auto"
                    onRequestClose={
                        preparingDelete ? undefined : () => setDeleteId(null)
                    }
                    footer={
                        <>
                            <button
                                ref={cancelDeleteRef}
                                type="button"
                                className="btn btn-ghost"
                                disabled={preparingDelete}
                                onClick={() => setDeleteId(null)}
                            >
                                {t('cancel')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-error"
                                disabled={preparingDelete}
                                onClick={() => void stageDelete()}
                            >
                                {preparingDelete && (
                                    <span className="loading loading-spinner loading-xs" />
                                )}
                                {t('project.delete')}
                            </button>
                        </>
                    }
                >
                    <p>
                        <Trans
                            t={t}
                            i18nKey="project.deleteDetail"
                            values={{ version: versionLabel(deleteId) }}
                            components={{ strong: <strong /> }}
                        />
                    </p>
                    <p>{t('project.deleteScope')}</p>
                    {deleteId === selectedSetId && (
                        <p>{t('project.deleteSelected')}</p>
                    )}
                    {drafts[deleteId]?.selected.some(
                        (file) =>
                            !drafts[deleteId].info.localFiles.includes(file),
                    ) && <p>{t('project.deleteAdditions')}</p>}
                    {deleteError && (
                        <p role="alert" className="text-error">
                            {t(
                                deleteError.match(
                                    /exportTemplates:([\w.]+)/,
                                )?.[1] ?? 'errors.failed',
                            )}
                        </p>
                    )}
                </Dialog>
            )}
            {ids.map((id) => {
                const draft = drafts[id];
                const files =
                    draft?.info.localFiles ??
                    sets.find((set) => set.id === id)?.files ??
                    [];
                const added =
                    draft?.selected.filter(
                        (file) => !draft.info.localFiles.includes(file),
                    ).length ?? 0;
                const removed =
                    draft?.info.localFiles.filter(
                        (file) => !draft.selected.includes(file),
                    ).length ?? 0;
                return (
                    <article
                        key={id}
                        aria-label={id}
                        className={`flex min-h-0 flex-col rounded-md border border-base-content/10 bg-base-content/2 ${expanded === id ? 'flex-1' : 'shrink-0'}`}
                    >
                        <div className="flex shrink-0 items-center gap-2 pr-3">
                            <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                                aria-expanded={expanded === id}
                                disabled={disabled}
                                onClick={() => {
                                    setExpanded(expanded === id ? '' : id);
                                    setError('');
                                }}
                            >
                                {expanded === id ? (
                                    <ChevronDown className="size-4 shrink-0" />
                                ) : (
                                    <ChevronRight className="size-4 shrink-0" />
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="block font-semibold">
                                        {id.replace(/\.mono$/, '')} -{' '}
                                        {t(
                                            `editions.${id.endsWith('.mono') ? 'dotnet' : 'standard'}`,
                                        )}
                                    </span>
                                    <span className="block text-sm text-base-content/65">
                                        {removed > 0 &&
                                        draft?.selected.length === 0
                                            ? t('project.deletePending')
                                            : files.length
                                              ? t('project.installed', {
                                                    count: files.length,
                                                })
                                              : t('project.empty')}
                                    </span>
                                </span>
                                {id === selectedSetId && (
                                    <span className="badge badge-soft badge-primary">
                                        {t('project.selectedEditor')}
                                    </span>
                                )}
                                {!!(added || removed) && (
                                    <PendingChangesIndicator />
                                )}
                            </button>
                            {files.length > 0 && (
                                <Tooltip
                                    tip={t('project.deleteAction', {
                                        version: versionLabel(id),
                                    })}
                                    placement="left"
                                >
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-ghost btn-square text-error shrink-0"
                                        aria-label={t('project.deleteAction', {
                                            version: versionLabel(id),
                                        })}
                                        disabled={
                                            disabled ||
                                            (removed > 0 &&
                                                draft?.selected.length === 0)
                                        }
                                        onClick={(event) => {
                                            deleteTriggerRef.current =
                                                event.currentTarget;
                                            versionHeaderRef.current =
                                                event.currentTarget.parentElement?.parentElement?.querySelector<HTMLButtonElement>(
                                                    'button[aria-expanded]',
                                                ) ?? null;
                                            setDeleteError('');
                                            setDeleteId(id);
                                        }}
                                    >
                                        <Trash2 size={16} aria-hidden="true" />
                                    </button>
                                </Tooltip>
                            )}
                        </div>
                        {expanded === id && (
                            <div className="flex min-h-0 flex-1 flex-col gap-3 border-t border-base-content/10 p-3">
                                {error && (
                                    <div
                                        role="alert"
                                        className="alert alert-error alert-soft"
                                    >
                                        <span>
                                            {t(
                                                error.match(
                                                    /exportTemplates:([\w.]+)/,
                                                )?.[1] ?? 'errors.failed',
                                            )}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-sm"
                                            onClick={() =>
                                                setAttempt((value) => value + 1)
                                            }
                                        >
                                            {t('retry')}
                                        </button>
                                    </div>
                                )}
                                {!draft ? (
                                    <p role="status">{t('picker.loading')}</p>
                                ) : (
                                    <>
                                        {draft.localOnly && (
                                            <p className="text-sm">
                                                {t('picker.localOnly')}
                                            </p>
                                        )}
                                        <fieldset
                                            disabled={disabled}
                                            className="min-h-0 min-w-0 flex-1 overflow-auto"
                                        >
                                            <FileSelectionTree
                                                defaultExpandedDepth={0}
                                                nodes={getTemplateFileTree(
                                                    draft.info.files.map(
                                                        (file) => file.path,
                                                    ),
                                                    draft.info.localFiles,
                                                    labels,
                                                )}
                                                selected={draft.selected}
                                                onChange={(selected) =>
                                                    setDrafts((current) => ({
                                                        ...current,
                                                        [id]: {
                                                            ...draft,
                                                            selected,
                                                        },
                                                    }))
                                                }
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
                                        {!!removed && (
                                            <p className="text-sm text-warning">
                                                {t('picker.removalNotice')}
                                            </p>
                                        )}
                                        {!!(added || removed) && (
                                            <p className="text-sm">
                                                {t('picker.changes', {
                                                    added,
                                                    removed,
                                                })}
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </article>
                );
            })}
        </div>
    );
}
