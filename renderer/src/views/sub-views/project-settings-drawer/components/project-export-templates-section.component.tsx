import type {
    ProjectDetails,
    ProjectTemplateSettings,
} from '@shared/contracts';
import {
    type Ref,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { SelectField } from '../../../../components/ui/select-field.component';
import { exportTemplatesBridge } from '../../../../renderer.bridge';
import { TemplateFileList } from '../../../export-templates/components/template-file-list.component';
import {
    refreshTemplateJobs,
    useTemplateJobs,
} from '../../../export-templates/hooks/template-jobs.hook';
import { PendingChangesIndicator } from './pending-changes-indicator.component';
import {
    ProjectTemplateFiles,
    type ProjectTemplateFilesHandle,
} from './project-template-files.component';

type Props = {
    ref: Ref<ProjectTemplateFilesHandle>;
    selectedSetId: string;
    project: ProjectDetails;
    active: boolean;
    disabled: boolean;
    onNavigate: (navigate: () => void) => void;
    editorChanged: boolean;
    onDirtyChange: (dirty: boolean) => void;
    onConfirmationChange: (open: boolean) => void;
};

/** Stages template sources while retaining unsaved shared Official file selections.
 * Refreshes metadata on focus only while the template tab is active.
 * @param props - Project, selected editor and the drawer's save/discard controls.
 */
export function ProjectExportTemplatesSection({
    ref,
    project,
    active,
    selectedSetId,
    disabled,
    onNavigate,
    editorChanged,
    onDirtyChange,
    onConfirmationChange,
}: Props) {
    const { t } = useTranslation('exportTemplates');
    const navigate = useNavigate();
    const jobs = useTemplateJobs();
    const lifecycle = jobs.map((job) => `${job.id}:${job.stage}`).join('|');
    const busy = jobs.some(
        (job) => !['complete', 'error', 'cancelled'].includes(job.stage),
    );
    const [settings, setSettings] = useState<ProjectTemplateSettings | null>(
        null,
    );
    const [choices, setChoices] = useState<Record<string, string>>({});
    const [filesDirty, setFilesDirty] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const filesRef = useRef<ProjectTemplateFilesHandle>(null);
    const changed = Object.entries(choices).filter(
        ([id, value]) =>
            value !== (settings?.buildSelections?.[id] ?? 'official'),
    );
    const dirty = filesDirty || changed.length > 0;
    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
    useEffect(() => {
        if (!active || disabled || pending || busy) return;
        /** Requests fresh metadata for the visible template tab. */
        const refresh = () => setRevision((value) => value + 1);
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, [active, disabled, pending, busy]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh on queue transitions, not download byte counters.
    useEffect(() => {
        if (!active) return;
        let alive = true;
        setError('');
        void exportTemplatesBridge
            .getProjectSettings(project.path, selectedSetId || undefined)
            .then((next) => {
                if (alive) setSettings(next);
            })
            .catch((failure) => {
                if (alive) setError(String(failure));
            });
        return () => {
            alive = false;
        };
    }, [
        active,
        project.path,
        project.launch_path,
        selectedSetId,
        lifecycle,
        revision,
    ]);
    useImperativeHandle(ref, () => ({
        discard: () => {
            filesRef.current?.discard();
            setChoices({});
        },
        submit: async () => {
            setPending(true);
            setError('');
            try {
                if (filesDirty && !(await filesRef.current?.submit()))
                    return false;
                if (changed.length)
                    await exportTemplatesBridge.setProjectTemplateBuilds(
                        project.path,
                        Object.fromEntries(changed),
                    );
                setChoices({});
                setRevision((value) => value + 1);
                return true;
            } catch (failure) {
                setError(String(failure));
                if (
                    String(failure).includes('exportTemplates:library.missing')
                ) {
                    try {
                        setSettings(
                            await exportTemplatesBridge.getProjectSettings(
                                project.path,
                                selectedSetId || undefined,
                            ),
                        );
                    } catch {
                        /* Retain the save error when availability cannot be refreshed. */
                    }
                }
                return false;
            } finally {
                setPending(false);
            }
        },
    }));
    const id = selectedSetId || settings?.setId || '';
    const buildSelections = { ...settings?.buildSelections, ...choices };
    const choice = choices[id] ?? settings?.buildSelections?.[id] ?? 'official';
    const builds =
        settings?.importedBuilds?.filter((build) => build.setId === id) ?? [];
    const selected = builds.find((build) => build.id === choice);
    const missing =
        choice !== 'official' && (!selected || selected.available === false);
    const version = `${id.replace(/\.mono$/, '')} - ${t(`editions.${id.endsWith('.mono') ? 'dotnet' : 'standard'}`)}`;
    const job = [...jobs].reverse().find((item) => item.setIds?.includes(id));
    const activeJob =
        job && !['complete', 'error', 'cancelled'].includes(job.stage)
            ? job
            : undefined;
    const blocked = disabled || pending || busy || settings?.setId !== id;
    const needsMigration =
        settings && settings.status === 'local' && settings.hasLocalFiles;
    return (
        <section
            data-testid="projectExportTemplates"
            className="flex min-h-0 flex-1 flex-col gap-4"
            aria-label={t('title')}
            aria-busy={pending}
        >
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{t('title')}</h2>
                {dirty && <PendingChangesIndicator />}
            </div>
            {error &&
                !(
                    missing && error.includes('exportTemplates:library.missing')
                ) && (
                    <div role="alert" className="alert alert-error alert-soft">
                        <span>
                            {t(
                                error.match(/exportTemplates:([\w.]+)/)?.[1] ??
                                    'errors.failed',
                            )}
                        </span>
                        <button
                            type="button"
                            className="btn btn-sm"
                            disabled={pending}
                            onClick={() => setRevision((value) => value + 1)}
                        >
                            {t('retry')}
                        </button>
                    </div>
                )}
            {activeJob && (
                <div className="space-y-2 rounded-md bg-base-content/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <p role="status">{t(`stages.${activeJob.stage}`)}</p>
                        {activeJob.stage !== 'applying' && (
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={() => {
                                    void exportTemplatesBridge
                                        .cancel(activeJob.id)
                                        .then(refreshTemplateJobs)
                                        .catch((failure) =>
                                            setError(String(failure)),
                                        );
                                }}
                            >
                                {t('cancel')}
                            </button>
                        )}
                    </div>
                    <progress
                        className="progress progress-primary w-full"
                        aria-label={t('download')}
                        max={activeJob.totalBytes || 1}
                        value={
                            activeJob.totalBytes
                                ? (activeJob.receivedBytes ?? 0)
                                : undefined
                        }
                    />
                </div>
            )}
            {!settings || settings.setId !== id ? (
                <p role="status">{t('picker.loading')}</p>
            ) : settings.custom ? (
                <p className="text-base-content/75">{t('project.custom')}</p>
            ) : needsMigration ? (
                <div className="space-y-3">
                    <p>{t('project.migrationRequired')}</p>
                    <button
                        type="button"
                        className="btn btn-soft"
                        disabled={blocked || editorChanged}
                        onClick={() =>
                            onNavigate(() => navigate('/export-templates'))
                        }
                    >
                        {t('migration.title')}
                    </button>
                </div>
            ) : (
                <>
                    <SelectField
                        id="project-template-build"
                        label={t('library.selection')}
                        value={choice}
                        help={t('library.selectionDetail')}
                        disabled={blocked}
                        onChange={(value) => {
                            setChoices((current) => ({
                                ...current,
                                [id]: value,
                            }));
                        }}
                        options={[
                            {
                                value: 'official',
                                label: `${t('library.official')} - ${version}`,
                            },
                            ...builds.map((build) => ({
                                value: build.id,
                                label: `${build.label} - ${version}${build.available === false ? ` - ${t('library.unavailable')}` : ''}`,
                                disabled: build.available === false,
                            })),
                            ...(missing && !selected
                                ? [
                                      {
                                          value: choice,
                                          label: t('library.missing'),
                                          disabled: true,
                                      },
                                  ]
                                : []),
                        ]}
                    />
                    {missing ? (
                        <div className="space-y-2">
                            <p role="alert" className="text-error">
                                {t(
                                    selected
                                        ? 'library.incomplete'
                                        : 'library.missing',
                                )}
                            </p>
                            <button
                                type="button"
                                className="btn btn-soft btn-sm"
                                disabled={blocked}
                                onClick={() =>
                                    onNavigate(() =>
                                        navigate('/export-templates'),
                                    )
                                }
                            >
                                {t('library.openLibrary')}
                            </button>
                        </div>
                    ) : choice === 'official' ? (
                        <p className="text-sm text-base-content/75">
                            {t('project.officialDetail')}
                        </p>
                    ) : (
                        selected && (
                            <>
                                <p className="text-sm text-base-content/75">
                                    {t('library.locked')}
                                </p>
                                <TemplateFileList
                                    files={selected.files}
                                    fillHeight
                                />
                            </>
                        )
                    )}
                    <div
                        hidden={choice !== 'official'}
                        className={
                            choice === 'official'
                                ? 'flex min-h-0 flex-1 flex-col'
                                : undefined
                        }
                    >
                        <ProjectTemplateFiles
                            ref={filesRef}
                            project={project}
                            active={active && choice === 'official'}
                            sets={settings.sets.filter((set) => set.id === id)}
                            selectedSetId={id}
                            buildSelections={buildSelections}
                            disabled={blocked}
                            onDirtyChange={setFilesDirty}
                            onConfirmationChange={onConfirmationChange}
                        />
                    </div>
                </>
            )}
            {pending && !activeJob && (
                <p role="status" className="flex items-center gap-2">
                    <span className="loading loading-spinner loading-sm" />
                    {t('library.working')}
                </p>
            )}
        </section>
    );
}
