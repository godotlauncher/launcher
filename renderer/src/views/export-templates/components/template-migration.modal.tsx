import type {
    TemplateJob,
    TemplateMigrationAssessment,
    TemplateProjectAssessment,
} from '@shared/contracts';
import { ChevronDown, ChevronRight, FileOutput, RefreshCw } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import { exportTemplatesBridge } from '../../../renderer.bridge';
import { refreshTemplateJobs } from '../hooks/template-jobs.hook';
import { formatTemplateBytes } from '../template-format.util';
import { TemplateMigrationBackups } from './template-migration-backups.component';
import { TemplateReviewPanel } from './template-review.component';

type Choice = 'separate' | 'use-shared' | 'share-project';
type Props = {
    assessment: TemplateMigrationAssessment | null;
    jobs: TemplateJob[];
    introduction: boolean;
    error: string;
    returnFocusRef: RefObject<HTMLElement | null>;
    fallbackReturnFocusRef: RefObject<HTMLElement | null>;
    onRefresh: () => Promise<void>;
    onClose: () => void;
    onStart: () => Promise<void>;
};
/** Identifies jobs which have released the mutation queue.
 * @param job - Current job.
 */
const finished = (job: TemplateJob) =>
    ['complete', 'cancelled', 'error'].includes(job.stage);
/** Orders unresolved decisions before completed outcomes.
 * @param project - Discovery result.
 */
const priority = (project: TemplateProjectAssessment) =>
    project.state === 'needs-review'
        ? 0
        : ['blocked', 'unavailable', 'recovery', 'busy'].includes(project.state)
          ? 1
          : project.state === 'ready'
            ? 2
            : project.state === 'separate'
              ? 3
              : 4;

/** Reviews one project at a time with an explicit per-project apply boundary.
 * @param props - Discovery, queued jobs and dialog actions.
 */
export function TemplateMigrationModal({
    assessment,
    jobs,
    introduction,
    error,
    returnFocusRef,
    fallbackReturnFocusRef,
    onRefresh,
    onClose,
    onStart,
}: Props) {
    const { t, i18n } = useTranslation('exportTemplates');
    const [selected, setSelected] = useState('');
    const [detail, setDetail] = useState<TemplateProjectAssessment | null>(
        null,
    );
    const [choice, setChoice] = useState<Choice | ''>('');
    const [inspecting, setInspecting] = useState(false);
    const [pending, setPending] = useState(false);
    const [failure, setFailure] = useState('');
    const inspection = useRef(0);
    const order = useRef<string[]>([]);
    const latestJobs = new Map<string, TemplateJob>();
    for (const job of jobs)
        if (job.projectPath) latestJobs.set(job.projectPath, job);
    const busy = jobs.some((job) => !finished(job));
    const job = latestJobs.get(selected);
    const activeJob = job && !finished(job);
    const current =
        detail ??
        assessment?.projects.find(
            (project) => project.projectPath === selected,
        );
    const recommended: Choice =
        current?.state === 'ready' ? 'use-shared' : 'separate';
    const chosen = choice || recommended;
    const canKeepSeparate =
        !!current?.pending &&
        ['local', 'missing'].includes(current.connection ?? '') &&
        !busy &&
        !assessment?.recoveryIds.length;
    const canMigrate =
        !!current?.pending &&
        ['ready', 'needs-review'].includes(current.state) &&
        !busy &&
        !assessment?.recoveryIds.length;
    const projects = [...(assessment?.projects ?? [])];
    if (!selected)
        order.current = projects
            .sort((a, b) => priority(a) - priority(b))
            .map((project) => project.projectPath);
    projects.sort(
        (a, b) =>
            order.current.indexOf(a.projectPath) -
            order.current.indexOf(b.projectPath),
    );

    /** Maps bounded failures to translated messages.
     * @param value - Bridge failure text.
     */
    const errorText = (value: string) =>
        t(value.match(/exportTemplates:([\w.]+)/)?.[1] ?? 'errors.failed');
    /** Loads metadata before checking matching contents.
     * @param projectPath - Selected registered project.
     */
    const select = async (projectPath: string) => {
        const request = ++inspection.current;
        setSelected(projectPath);
        setDetail(null);
        setChoice('');
        setFailure('');
        setInspecting(!!projectPath);
        try {
            await exportTemplatesBridge.cancelTemplateInspection();
            if (!projectPath || request !== inspection.current) return;
            const metadata =
                await exportTemplatesBridge.inspectProjectTemplates(
                    projectPath,
                    false,
                );
            if (request !== inspection.current) return;
            setDetail(metadata);
            if (metadata.files?.some((file) => file.state === 'checking')) {
                const verified =
                    await exportTemplatesBridge.inspectProjectTemplates(
                        projectPath,
                        true,
                    );
                if (request === inspection.current) setDetail(verified);
            }
        } catch (error) {
            if (request === inspection.current) setFailure(String(error));
        } finally {
            if (request === inspection.current) setInspecting(false);
        }
    };
    useEffect(
        () => () => {
            inspection.current++;
            void exportTemplatesBridge
                .cancelTemplateInspection()
                .catch(() => undefined);
        },
        [],
    );
    const jobStage = job?.stage;
    const jobId = job?.id;
    useEffect(() => {
        if (jobId && jobStage) {
            inspection.current++;
            setDetail(null);
            setInspecting(false);
        }
    }, [jobId, jobStage]);

    /** Runs an explicit decision and refreshes its outcome.
     * @param action - Main-owned operation.
     */
    const run = async (action: () => Promise<unknown>) => {
        setPending(true);
        setFailure('');
        inspection.current++;
        setInspecting(false);
        try {
            await exportTemplatesBridge.cancelTemplateInspection();
            await action();
            setDetail(null);
            setChoice('');
            await Promise.all([refreshTemplateJobs(), onRefresh()]);
        } catch (error) {
            setFailure(String(error));
        } finally {
            setPending(false);
        }
    };
    /** Describes the project's outcome.
     * @param project - Discovery result.
     */
    const status = (project: TemplateProjectAssessment) =>
        t(
            `migration.status.${project.state === 'shared' ? 'shared' : project.state === 'separate' ? 'separate' : project.state === 'ready' ? 'ready' : project.state === 'needs-review' ? 'review' : 'unavailable'}`,
        );

    return (
        <Dialog
            key={introduction ? 'introduction' : 'workflow'}
            title={t('migration.title')}
            icon={<FileOutput className="size-6" aria-hidden="true" />}
            testId="templateMigrationModal"
            panelClassName={
                introduction ? 'max-w-xl' : 'max-w-2xl h-[min(42rem,85vh)]'
            }
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
            returnFocusRef={returnFocusRef}
            fallbackReturnFocusRef={fallbackReturnFocusRef}
            onRequestClose={pending ? undefined : onClose}
            footer={
                <>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={pending}
                        onClick={onClose}
                    >
                        {t(
                            introduction
                                ? 'migration.later'
                                : 'migration.close',
                        )}
                    </button>
                    {introduction && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={pending}
                            onClick={() => void run(onStart)}
                        >
                            {t('migration.start')}
                        </button>
                    )}
                </>
            }
        >
            {(failure || error) && (
                <p role="alert" className="alert alert-error mb-3">
                    {errorText(failure || error)}
                </p>
            )}
            {pending && !introduction && (
                <p role="status" className="mb-3 text-sm text-base-content/70">
                    {t('updatesInProgress')}
                </p>
            )}
            {introduction ? (
                <div className="space-y-3 overflow-auto">
                    <p>{t('migration.introduction')}</p>
                    <p className="text-sm text-base-content/70">
                        {t('migration.offerDetail')}
                    </p>
                    <p>
                        {t('migration.pending', {
                            number: assessment?.pendingCount ?? 0,
                        })}
                    </p>
                </div>
            ) : (
                <>
                    <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                        <p className="text-sm text-base-content/70">
                            {t('migration.pending', {
                                number: assessment?.pendingCount ?? 0,
                            })}
                        </p>
                        <button
                            type="button"
                            className="btn btn-ghost btn-square btn-sm"
                            title={t('refresh')}
                            aria-label={t('refresh')}
                            disabled={pending}
                            onClick={() =>
                                void run(async () => {
                                    await onRefresh();
                                    await select('');
                                })
                            }
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                    {!!assessment?.recoveryIds.length && (
                        <div className="mb-3 space-y-2" role="alert">
                            <p>{t('recoveryDetail')}</p>
                            {assessment.recoveryIds.map((id) => (
                                <button
                                    type="button"
                                    key={id}
                                    className="btn btn-warning btn-sm"
                                    disabled={pending || busy}
                                    onClick={() =>
                                        void run(() =>
                                            exportTemplatesBridge.recover(id),
                                        )
                                    }
                                >
                                    {t('recover')}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {!assessment && <p role="status">{t('loading')}</p>}
                        <ul
                            aria-label={t('migration.projects')}
                            className="divide-y divide-base-content/10"
                        >
                            {projects.map((project) => {
                                const expanded =
                                    selected === project.projectPath;
                                const projectJob = latestJobs.get(
                                    project.projectPath,
                                );
                                const live =
                                    projectJob && !finished(projectJob);
                                return (
                                    <li key={project.projectPath}>
                                        <button
                                            type="button"
                                            className="flex w-full items-start gap-3 py-3 text-left hover:bg-base-200"
                                            aria-expanded={expanded}
                                            disabled={pending}
                                            onClick={() =>
                                                void select(
                                                    expanded
                                                        ? ''
                                                        : project.projectPath,
                                                )
                                            }
                                        >
                                            {expanded ? (
                                                <ChevronDown
                                                    size={18}
                                                    className="mt-1 shrink-0"
                                                />
                                            ) : (
                                                <ChevronRight
                                                    size={18}
                                                    className="mt-1 shrink-0"
                                                />
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block break-words font-semibold">
                                                    {project.name}
                                                </span>
                                                <span className="block text-xs text-base-content/60">
                                                    {project.version} ·{' '}
                                                    {t(
                                                        `migration.edition.${project.edition ?? 'standard'}`,
                                                    )}
                                                </span>
                                            </span>
                                            <span
                                                role={
                                                    live ? 'status' : undefined
                                                }
                                                className="max-w-[40%] text-right text-xs text-base-content/70"
                                            >
                                                {live
                                                    ? t(
                                                          `stages.${projectJob.stage}`,
                                                      )
                                                    : status(project)}
                                            </span>
                                        </button>
                                        {expanded && current && (
                                            <div className="space-y-3 pb-4 pl-7 pr-2">
                                                {!activeJob && (
                                                    <p className="text-sm">
                                                        {t(
                                                            `migration.reasons.${current.reason}`,
                                                        )}
                                                    </p>
                                                )}
                                                {inspecting && (
                                                    <p
                                                        role="status"
                                                        className="text-xs text-base-content/60"
                                                    >
                                                        {t(
                                                            'migration.inspecting',
                                                        )}
                                                    </p>
                                                )}
                                                {job?.error && (
                                                    <p
                                                        role="alert"
                                                        className="text-error text-sm"
                                                    >
                                                        {errorText(job.error)}
                                                    </p>
                                                )}
                                                {activeJob ? (
                                                    <>
                                                        {job.stage ===
                                                            'review' &&
                                                            job.review && (
                                                                <TemplateReviewPanel
                                                                    key={job.id}
                                                                    review={
                                                                        job.review
                                                                    }
                                                                    pending={
                                                                        pending
                                                                    }
                                                                    onApply={(
                                                                        decisions,
                                                                    ) =>
                                                                        void run(
                                                                            () =>
                                                                                exportTemplatesBridge.apply(
                                                                                    job.id,
                                                                                    decisions,
                                                                                ),
                                                                        )
                                                                    }
                                                                />
                                                            )}
                                                        {job.stage !==
                                                            'applying' && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost btn-sm"
                                                                disabled={
                                                                    pending
                                                                }
                                                                onClick={() =>
                                                                    void run(
                                                                        () =>
                                                                            exportTemplatesBridge.cancel(
                                                                                job.id,
                                                                            ),
                                                                    )
                                                                }
                                                            >
                                                                {t('cancel')}
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        {!!current.files
                                                            ?.length && (
                                                            <details>
                                                                <summary className="cursor-pointer text-sm">
                                                                    {t(
                                                                        'migration.comparison',
                                                                    )}{' '}
                                                                    (
                                                                    {
                                                                        current
                                                                            .files
                                                                            .length
                                                                    }
                                                                    )
                                                                </summary>
                                                                <ul className="mt-2 max-h-44 space-y-2 overflow-auto text-xs">
                                                                    {current.files.map(
                                                                        (
                                                                            file,
                                                                        ) => (
                                                                            <li
                                                                                key={
                                                                                    file.path
                                                                                }
                                                                            >
                                                                                <p className="break-all">
                                                                                    {
                                                                                        file.path
                                                                                    }
                                                                                </p>
                                                                                <p className="text-base-content/60">
                                                                                    {t(
                                                                                        `migration.files.${file.state}`,
                                                                                    )}
                                                                                    {file.localBytes !==
                                                                                        undefined &&
                                                                                        ` · ${t('migration.projectFiles')}: ${formatTemplateBytes(file.localBytes, i18n.language)}`}
                                                                                    {file.sharedBytes !==
                                                                                        undefined &&
                                                                                        ` · ${t('shared')}: ${formatTemplateBytes(file.sharedBytes, i18n.language)}`}
                                                                                </p>
                                                                            </li>
                                                                        ),
                                                                    )}
                                                                </ul>
                                                            </details>
                                                        )}
                                                        {!!current.unexpected
                                                            .length && (
                                                            <p className="break-all text-xs">
                                                                {current.unexpected.join(
                                                                    ', ',
                                                                )}
                                                            </p>
                                                        )}
                                                        {current.pending && (
                                                            <>
                                                                {current.files
                                                                    ?.length ? (
                                                                    <p className="text-xs text-base-content/60">
                                                                        {t(
                                                                            'migration.unverified',
                                                                        )}
                                                                    </p>
                                                                ) : null}
                                                                <fieldset
                                                                    disabled={
                                                                        pending
                                                                    }
                                                                    className="space-y-2"
                                                                >
                                                                    <legend className="sr-only">
                                                                        {t(
                                                                            'choose',
                                                                        )}
                                                                    </legend>
                                                                    {(
                                                                        [
                                                                            'separate',
                                                                            'use-shared',
                                                                        ] as const
                                                                    ).map(
                                                                        (
                                                                            value,
                                                                        ) => (
                                                                            <label
                                                                                key={
                                                                                    value
                                                                                }
                                                                                className="flex items-start gap-2 text-sm"
                                                                            >
                                                                                <input
                                                                                    type="radio"
                                                                                    className="radio radio-sm mt-0.5"
                                                                                    name="template-migration-choice"
                                                                                    checked={
                                                                                        chosen ===
                                                                                        value
                                                                                    }
                                                                                    disabled={
                                                                                        value ===
                                                                                        'separate'
                                                                                            ? !canKeepSeparate
                                                                                            : !canMigrate
                                                                                    }
                                                                                    onChange={() =>
                                                                                        setChoice(
                                                                                            value,
                                                                                        )
                                                                                    }
                                                                                />
                                                                                <span>
                                                                                    {t(
                                                                                        `migration.choices.${value}`,
                                                                                    )}
                                                                                    {recommended ===
                                                                                        value && (
                                                                                        <span className="ml-2 text-xs text-base-content/60">
                                                                                            {t(
                                                                                                'migration.recommended',
                                                                                            )}
                                                                                        </span>
                                                                                    )}
                                                                                </span>
                                                                            </label>
                                                                        ),
                                                                    )}
                                                                    <details>
                                                                        <summary className="cursor-pointer text-xs text-base-content/70">
                                                                            {t(
                                                                                'migration.otherOptions',
                                                                            )}
                                                                        </summary>
                                                                        <label className="mt-2 flex items-start gap-2 text-sm">
                                                                            <input
                                                                                type="radio"
                                                                                className="radio radio-sm mt-0.5"
                                                                                name="template-migration-choice"
                                                                                checked={
                                                                                    chosen ===
                                                                                    'share-project'
                                                                                }
                                                                                disabled={
                                                                                    !canMigrate
                                                                                }
                                                                                onChange={() =>
                                                                                    setChoice(
                                                                                        'share-project',
                                                                                    )
                                                                                }
                                                                            />
                                                                            <span>
                                                                                {t(
                                                                                    'migration.choices.share-project',
                                                                                )}
                                                                            </span>
                                                                        </label>
                                                                        <p className="mt-1 text-xs text-base-content/60">
                                                                            {t(
                                                                                'migration.details.share-project',
                                                                            )}
                                                                        </p>
                                                                    </details>
                                                                </fieldset>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-primary btn-sm"
                                                                    disabled={
                                                                        pending ||
                                                                        (chosen ===
                                                                        'separate'
                                                                            ? !canKeepSeparate
                                                                            : !canMigrate)
                                                                    }
                                                                    onClick={() =>
                                                                        void run(
                                                                            () =>
                                                                                chosen ===
                                                                                'separate'
                                                                                    ? exportTemplatesBridge.keepProjectTemplatesSeparate(
                                                                                          selected,
                                                                                      )
                                                                                    : exportTemplatesBridge.prepareMigration(
                                                                                          selected,
                                                                                          chosen,
                                                                                      ),
                                                                        )
                                                                    }
                                                                >
                                                                    {t(
                                                                        chosen ===
                                                                            'separate'
                                                                            ? 'migration.keepSeparate'
                                                                            : 'migration.reviewChanges',
                                                                    )}
                                                                </button>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        {assessment && !projects.length && (
                            <p>{t('migration.noProjects')}</p>
                        )}
                        {assessment && (
                            <TemplateMigrationBackups
                                assessment={assessment}
                                disabled={pending || busy}
                                run={run}
                            />
                        )}
                    </div>
                    {busy && (
                        <p className="mt-3 shrink-0 text-xs text-base-content/60">
                            {t('migration.background')}
                        </p>
                    )}
                </>
            )}
        </Dialog>
    );
}
