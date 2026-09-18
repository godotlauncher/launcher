import type {
    ProjectDetails,
    ProjectTemplateSettings,
    TemplateMigrationChoice,
    TemplateMigrationVersionChoices,
} from '@shared/contracts';
import { CircleX, TriangleAlert } from 'lucide-react';
import { type Ref, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { exportTemplatesBridge } from '../../../../renderer.bridge';
import {
    refreshTemplateJobs,
    useTemplateJobs,
} from '../../../export-templates/hooks/template-jobs.hook';
import { formatTemplateBytes } from '../../../export-templates/template-format.util';

import {
    ProjectTemplateFiles,
    type ProjectTemplateFilesHandle,
} from './project-template-files.component';

type Props = {
    ref: Ref<ProjectTemplateFilesHandle>;
    selectedSetId: string;
    project: ProjectDetails;
    disabled: boolean;
    onNavigate: (navigate: () => void) => void;
    editorChanged: boolean;
    onDirtyChange: (dirty: boolean) => void;
    onConfirmationChange: (open: boolean) => void;
};

/** Manages the selected project's current export template connection and files.
 * @param props - Saved project, editor-change guard, navigation and unsaved-selection callbacks.
 */
export function ProjectExportTemplatesSection({
    ref,
    project,
    selectedSetId,
    disabled,
    onNavigate,
    editorChanged,
    onDirtyChange,
    onConfirmationChange,
}: Props) {
    const { t, i18n } = useTranslation('exportTemplates');
    const navigate = useNavigate();
    const jobs = useTemplateJobs();
    const job = [...jobs]
        .reverse()
        .find((item) => item.projectPath === project.path);
    const activeJob =
        job && !['complete', 'error', 'cancelled'].includes(job.stage)
            ? job
            : undefined;
    const busy = jobs.some(
        (item) => !['complete', 'error', 'cancelled'].includes(item.stage),
    );
    const lifecycle = jobs.map((item) => `${item.id}:${item.stage}`).join('|');
    const [settings, setSettings] = useState<ProjectTemplateSettings | null>(
        null,
    );
    const [versionChoices, setVersionChoices] =
        useState<TemplateMigrationVersionChoices>({});
    const [connecting, setConnecting] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [filesDirty, setFilesDirty] = useState(false);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh on queue transitions and explicit retries, not progress bytes.
    useEffect(() => {
        let alive = true;
        setError('');
        void exportTemplatesBridge
            .getProjectSettings(project.path, selectedSetId || undefined)
            .then((next) => {
                if (!alive) return;
                setSettings(next);
                if (next.status === 'shared') setConnecting(false);
            })
            .catch((failure) => {
                if (alive) setError(String(failure));
            });
        return () => {
            alive = false;
        };
    }, [
        project.path,
        selectedSetId,
        project.launch_path,
        project.release.version,
        lifecycle,
        attempt,
        busy,
    ]);
    /** Submits an explicit action and refreshes connection state and progress.
     * @param action - Main-owned mutation to enqueue.
     */
    const run = async (action: () => Promise<unknown>) => {
        setPending(true);
        setError('');
        try {
            await action();
            await refreshTemplateJobs();
            setAttempt((value) => value + 1);
        } catch (failure) {
            setError(String(failure));
        } finally {
            setPending(false);
        }
    };
    const blocked = disabled || busy || pending;
    const failure = error || (job?.stage === 'error' ? job.error : '');
    return (
        <section
            className="relative min-h-48 min-w-0"
            data-testid="projectExportTemplates"
            aria-busy={!!activeJob || pending}
        >
            {(activeJob || pending) && (
                <div className="absolute inset-0 z-10 bg-base-100/70 p-2">
                    <div className="sticky top-2 space-y-2 rounded-md bg-base-200 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <p
                                role="status"
                                className="flex items-center gap-2 text-sm"
                            >
                                <span
                                    className="loading loading-spinner loading-sm"
                                    aria-hidden="true"
                                />
                                {t(`stages.${activeJob?.stage ?? 'preparing'}`)}
                            </p>
                            {activeJob && activeJob.stage !== 'applying' && (
                                <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    disabled={pending}
                                    onClick={() =>
                                        void run(() =>
                                            exportTemplatesBridge.cancel(
                                                activeJob.id,
                                            ),
                                        )
                                    }
                                >
                                    {t('cancel')}
                                </button>
                            )}
                        </div>
                        {!!activeJob?.setIds?.length && (
                            <p className="text-sm text-base-content/70">
                                {activeJob.setIds.join(', ')}
                            </p>
                        )}
                        {activeJob?.stage === 'downloading' && (
                            <>
                                <progress
                                    className="progress progress-primary"
                                    aria-label={t('download')}
                                    max={activeJob.totalBytes || 1}
                                    value={
                                        activeJob.totalBytes
                                            ? (activeJob.receivedBytes ?? 0)
                                            : undefined
                                    }
                                />
                                <p className="text-sm text-base-content/70">
                                    {formatTemplateBytes(
                                        activeJob.receivedBytes ?? 0,
                                        i18n.language,
                                    )}
                                    {activeJob.totalBytes
                                        ? ` / ${formatTemplateBytes(activeJob.totalBytes, i18n.language)}`
                                        : ''}
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}
            <div
                className="flex min-w-0 flex-col gap-4"
                inert={!!activeJob || pending}
            >
                {failure && (
                    <div role="alert" className="alert alert-error alert-soft">
                        <span>
                            {t(
                                failure.match(
                                    /exportTemplates:([\w.]+)/,
                                )?.[1] ?? 'errors.failed',
                            )}
                        </span>
                        <button
                            type="button"
                            className="btn btn-sm"
                            disabled={blocked}
                            onClick={() => {
                                if (job?.stage === 'error')
                                    void run(() =>
                                        exportTemplatesBridge.retryJob(job.id),
                                    );
                                else setAttempt((value) => value + 1);
                            }}
                        >
                            {t('retry')}
                        </button>
                    </div>
                )}
                {!settings ? (
                    <p role="status">{t('picker.loading')}</p>
                ) : (
                    <>
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <h3 className="font-semibold">
                                    {t(
                                        settings.status === 'shared'
                                            ? 'project.shared'
                                            : 'project.separate',
                                    )}
                                </h3>
                                <p className="text-sm text-base-content/70">
                                    {settings.custom
                                        ? project.release.version
                                        : settings.setId.replace(
                                              /\.mono$/,
                                              '',
                                          )}{' '}
                                    -{' '}
                                    {t(
                                        `editions.${settings.custom ? 'custom' : settings.setId.endsWith('.mono') ? 'dotnet' : 'standard'}`,
                                    )}
                                </p>
                            </div>
                            {settings.status === 'shared' &&
                                !settings.custom && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost shrink-0"
                                        disabled={blocked}
                                        onClick={() => {
                                            onNavigate(() =>
                                                navigate(
                                                    `/export-templates?set=${encodeURIComponent(settings.setId)}`,
                                                ),
                                            );
                                        }}
                                    >
                                        {t('project.manageShared')}
                                    </button>
                                )}
                        </div>
                        {!['shared', 'local', 'missing'].includes(
                            settings.status,
                        ) ? (
                            <p role="alert">{t('errors.connection')}</p>
                        ) : settings.custom ? (
                            <>
                                <p>{t('project.custom')}</p>
                                <ul className="text-sm">
                                    {settings.files.map((file) => (
                                        <li key={file}>{file}</li>
                                    ))}
                                </ul>
                            </>
                        ) : settings.status === 'shared' ? (
                            <>
                                <p>
                                    {t(
                                        settings.files.length
                                            ? 'project.installed'
                                            : 'project.empty',
                                        { count: settings.files.length },
                                    )}
                                </p>
                                {!!settings.files.length && (
                                    <ul className="max-h-48 overflow-auto rounded-md bg-base-200 p-3 text-sm">
                                        {settings.files.map((file) => (
                                            <li
                                                className="break-all"
                                                key={file}
                                            >
                                                {file}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <div className="rounded-md border border-base-content/10 p-3">
                                    <p className="mb-3 text-sm text-base-content/75">
                                        {t('project.detachDetail')}
                                    </p>
                                    {editorChanged && (
                                        <p className="mb-3 text-sm text-base-content/70">
                                            {t('project.connectionPending')}
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-soft"
                                        disabled={blocked || editorChanged}
                                        onClick={() =>
                                            void run(() =>
                                                exportTemplatesBridge.detachProject(
                                                    project.path,
                                                ),
                                            )
                                        }
                                    >
                                        {t('project.detach')}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                {!connecting && (
                                    <button
                                        type="button"
                                        className="btn btn-soft self-start"
                                        disabled={
                                            blocked ||
                                            filesDirty ||
                                            editorChanged
                                        }
                                        onClick={() => {
                                            if (settings.hasLocalFiles) {
                                                setVersionChoices({});
                                                setConnecting(true);
                                            } else
                                                void run(() =>
                                                    exportTemplatesBridge.prepareMigration(
                                                        project.path,
                                                        'share-project',
                                                    ),
                                                );
                                        }}
                                    >
                                        {t('migration.choices.share-project')}
                                    </button>
                                )}
                                {(filesDirty || editorChanged) && (
                                    <p className="text-sm text-base-content/70">
                                        {t('project.connectionPending')}
                                    </p>
                                )}
                                {connecting && (
                                    <div className="flex flex-col gap-3 rounded-md border border-base-content/10 p-3">
                                        <h4 className="font-semibold">
                                            {t(
                                                'migration.choices.share-project',
                                            )}
                                        </h4>
                                        <p className="text-sm text-base-content/75">
                                            {t('project.switchReview')}
                                        </p>
                                        <p className="alert alert-warning alert-soft flex items-start gap-2 text-sm">
                                            <TriangleAlert
                                                className="size-5 shrink-0"
                                                aria-hidden="true"
                                            />
                                            {t('project.switchDetail')}
                                        </p>
                                        <p className="alert alert-error alert-soft flex items-start gap-2 text-sm">
                                            <CircleX
                                                className="size-5 shrink-0"
                                                aria-hidden="true"
                                            />
                                            {t('migration.permanentDeletion')}
                                        </p>
                                        <div className="flex flex-col gap-2">
                                            {settings.sets
                                                .filter(
                                                    (set) =>
                                                        set.files.length > 0,
                                                )
                                                .sort(
                                                    (a, b) =>
                                                        Number(
                                                            b.id ===
                                                                settings.setId,
                                                        ) -
                                                            Number(
                                                                a.id ===
                                                                    settings.setId,
                                                            ) ||
                                                        b.id.localeCompare(
                                                            a.id,
                                                            undefined,
                                                            { numeric: true },
                                                        ),
                                                )
                                                .map((set) => {
                                                    const version = `${set.id.replace(/\.mono$/, '')} - ${t(`editions.${set.id.endsWith('.mono') ? 'dotnet' : 'standard'}`)}`;
                                                    return (
                                                        <div
                                                            key={set.id}
                                                            className="grid items-center gap-3 rounded-md border border-base-content/10 bg-base-content/2 p-3 sm:grid-cols-[minmax(0,1fr)_16rem]"
                                                        >
                                                            <div className="min-w-0">
                                                                <p className="font-semibold">
                                                                    {version}
                                                                </p>
                                                                <p className="text-sm text-base-content/65">
                                                                    {t(
                                                                        'fileCount',
                                                                        {
                                                                            number: set
                                                                                .files
                                                                                .length,
                                                                        },
                                                                    )}
                                                                </p>
                                                                {set.id ===
                                                                    settings.setId && (
                                                                    <span className="badge badge-sm badge-soft badge-primary">
                                                                        {t(
                                                                            'project.selectedEditor',
                                                                        )}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <select
                                                                className="select select-bordered min-w-0 w-full"
                                                                aria-label={t(
                                                                    'project.versionAction',
                                                                    { version },
                                                                )}
                                                                value={
                                                                    versionChoices[
                                                                        set.id
                                                                    ] ??
                                                                    'share-project'
                                                                }
                                                                disabled={
                                                                    blocked
                                                                }
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    setVersionChoices(
                                                                        (
                                                                            current,
                                                                        ) => ({
                                                                            ...current,
                                                                            [set.id]:
                                                                                event
                                                                                    .target
                                                                                    .value as TemplateMigrationChoice,
                                                                        }),
                                                                    )
                                                                }
                                                            >
                                                                <option value="share-project">
                                                                    {t(
                                                                        'project.mergeVersion',
                                                                    )}
                                                                </option>
                                                                <option value="use-shared">
                                                                    {t(
                                                                        'project.discardVersion',
                                                                    )}
                                                                </option>
                                                            </select>
                                                            <p
                                                                className="text-sm text-base-content/75 sm:col-span-2"
                                                                aria-live="polite"
                                                            >
                                                                {t(
                                                                    versionChoices[
                                                                        set.id
                                                                    ] ===
                                                                        'use-shared'
                                                                        ? 'project.discardDetail'
                                                                        : 'project.mergeDetail',
                                                                )}
                                                            </p>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={() => {
                                                    setConnecting(false);
                                                    setVersionChoices({});
                                                }}
                                            >
                                                {t('cancel')}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                disabled={blocked}
                                                onClick={() =>
                                                    void run(() =>
                                                        exportTemplatesBridge.prepareMigration(
                                                            project.path,
                                                            'share-project',
                                                            Object.fromEntries(
                                                                settings.sets
                                                                    .filter(
                                                                        (set) =>
                                                                            set
                                                                                .files
                                                                                .length >
                                                                            0,
                                                                    )
                                                                    .map(
                                                                        (
                                                                            set,
                                                                        ) => [
                                                                            set.id,
                                                                            versionChoices[
                                                                                set
                                                                                    .id
                                                                            ] ??
                                                                                'share-project',
                                                                        ],
                                                                    ),
                                                            ),
                                                        ),
                                                    )
                                                }
                                            >
                                                {t('project.switchShared')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {!connecting && (
                                    <ProjectTemplateFiles
                                        ref={ref}
                                        onConfirmationChange={
                                            onConfirmationChange
                                        }
                                        project={project}
                                        sets={settings.sets}
                                        selectedSetId={selectedSetId}
                                        disabled={blocked}
                                        onDirtyChange={(value) => {
                                            setFilesDirty(value);
                                            onDirtyChange(value);
                                        }}
                                    />
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
