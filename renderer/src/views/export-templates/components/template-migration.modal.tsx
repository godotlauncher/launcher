import type {
    TemplateJob,
    TemplateMigrationAssessment,
} from '@shared/contracts';
import { CircleX, FileOutput, RefreshCw, TriangleAlert } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import { exportTemplatesBridge } from '../../../renderer.bridge';
import { refreshTemplateJobs } from '../hooks/template-jobs.hook';

type Choice = 'share-project' | 'use-shared' | 'separate';
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
/** Applies one project-level choice without a second file review.
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
    const { t } = useTranslation('exportTemplates');
    const [choices, setChoices] = useState<Record<string, Choice | ''>>({});
    const [pending, setPending] = useState(false);
    const [failure, setFailure] = useState('');
    const latestJobs = new Map<string, TemplateJob>();
    for (const job of jobs)
        if (job.projectPath && job.kind === 'migrate')
            latestJobs.set(job.projectPath, job);
    const busy = jobs.some((job) => !finished(job));
    const complete =
        !introduction &&
        assessment?.pendingCount === 0 &&
        !busy &&
        !pending &&
        !error &&
        !failure;
    const projects = (assessment?.projects ?? []).filter((project) => {
        const job = latestJobs.get(project.projectPath);
        return (
            (project.pending && project.reason !== 'empty') ||
            !!(job && !finished(job))
        );
    });

    /** Maps bounded failures to translated messages.
     * @param value - Bridge failure text.
     */
    const errorText = (value: string) =>
        t(value.match(/exportTemplates:([\w.]+)/)?.[1] ?? 'errors.failed');
    /** Runs an explicit choice and refreshes its outcome.
     * @param action - Main-owned operation.
     */
    const run = async (action: () => Promise<unknown>) => {
        setPending(true);
        setFailure('');
        try {
            await action();
            await Promise.all([refreshTemplateJobs(), onRefresh()]);
        } catch (error) {
            setFailure(String(error));
        } finally {
            setPending(false);
        }
    };
    return (
        <Dialog
            key={introduction ? 'introduction' : 'workflow'}
            title={t('migration.title')}
            icon={<FileOutput className="size-6" aria-hidden="true" />}
            testId="templateMigrationModal"
            panelClassName={introduction ? 'max-w-2xl' : 'max-w-5xl'}
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
            returnFocusRef={returnFocusRef}
            fallbackReturnFocusRef={fallbackReturnFocusRef}
            onRequestClose={pending ? undefined : onClose}
            footer={
                <>
                    <button
                        type="button"
                        className={`btn text-base ${complete ? 'btn-primary' : 'btn-ghost'}`}
                        disabled={pending}
                        onClick={onClose}
                    >
                        {t(
                            introduction
                                ? 'migration.later'
                                : complete
                                  ? 'migration.done'
                                  : 'migration.finishLater',
                        )}
                    </button>
                    {introduction && (
                        <button
                            type="button"
                            className="btn btn-primary text-base"
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
                <p role="alert" className="mb-3 text-error">
                    {errorText(failure || error)}
                </p>
            )}
            {introduction ? (
                <div className="space-y-3">
                    <p>{t('migration.introduction')}</p>
                    <p className="text-base-content/75">
                        {t('migration.offerDetail')}
                    </p>
                    <p className="text-base">
                        {t('migration.pending', {
                            number: assessment?.pendingCount ?? 0,
                        })}
                    </p>
                </div>
            ) : (
                <>
                    <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                        <p className="text-base-content/75">
                            {t('migration.pending', {
                                number: assessment?.pendingCount ?? 0,
                            })}
                        </p>
                        {!complete && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm btn-square"
                                aria-label={t('refresh')}
                                disabled={pending}
                                onClick={() => void run(onRefresh)}
                            >
                                <RefreshCw size={18} />
                            </button>
                        )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {!!projects.length && (
                            <div
                                className="flex items-center gap-2 px-3 pb-2 text-sm font-semibold text-base-content/75"
                                aria-hidden="true"
                            >
                                <span className="min-w-0 flex-1">
                                    {t('migration.projectColumn')}
                                </span>
                                <span className="w-[22rem] max-w-full">
                                    {t('migration.actionColumn')}
                                </span>
                                <span className="btn text-base invisible">
                                    {t('apply')}
                                </span>
                            </div>
                        )}
                        <ul
                            aria-label={t('migration.projects')}
                            className="space-y-2"
                        >
                            {projects.map((project) => {
                                const choice =
                                    choices[project.projectPath] ?? '';
                                const projectJob = latestJobs.get(
                                    project.projectPath,
                                );
                                const live =
                                    projectJob && !finished(projectJob);
                                const available =
                                    !pending &&
                                    !busy &&
                                    !assessment?.recoveryIds.length;
                                const canKeepSeparate =
                                    available &&
                                    ['local', 'missing'].includes(
                                        project.connection ?? '',
                                    );
                                const canMigrate =
                                    available &&
                                    ['ready', 'needs-review'].includes(
                                        project.state,
                                    );
                                return (
                                    <li
                                        key={project.projectPath}
                                        aria-label={project.name}
                                        className="rounded-md border border-base-content/10 bg-base-content/2 p-3"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className="min-w-0 flex-1 break-words font-medium"
                                                title={`${project.name} - ${project.version} - ${t(`migration.edition.${project.edition ?? 'standard'}`)}`}
                                            >
                                                {project.name}
                                            </span>
                                            <select
                                                className="select select-bordered w-[22rem] max-w-full text-sm"
                                                aria-label={`${project.name}: ${t('choose')}`}
                                                value={choice}
                                                disabled={!available || !!live}
                                                title={
                                                    choice
                                                        ? t(
                                                              `migration.details.${choice}`,
                                                          )
                                                        : t('choose')
                                                }
                                                onChange={(event) =>
                                                    setChoices((previous) => ({
                                                        ...previous,
                                                        [project.projectPath]:
                                                            event.target
                                                                .value as
                                                                | Choice
                                                                | '',
                                                    }))
                                                }
                                            >
                                                <option value="" disabled>
                                                    {t('choose')}
                                                </option>
                                                {(
                                                    [
                                                        'share-project',
                                                        'use-shared',
                                                        'separate',
                                                    ] as const
                                                ).map((value) => (
                                                    <option
                                                        key={value}
                                                        value={value}
                                                        disabled={
                                                            value === 'separate'
                                                                ? !canKeepSeparate
                                                                : !canMigrate ||
                                                                  (value ===
                                                                      'share-project' &&
                                                                      !project
                                                                          .setIds
                                                                          .length)
                                                        }
                                                    >
                                                        {t(
                                                            `migration.choices.${value}`,
                                                        )}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                className="btn btn-primary text-base"
                                                disabled={
                                                    !choice ||
                                                    !!live ||
                                                    (choice === 'separate'
                                                        ? !canKeepSeparate
                                                        : !canMigrate)
                                                }
                                                onClick={() =>
                                                    void run(() =>
                                                        choice === 'separate'
                                                            ? exportTemplatesBridge.keepProjectTemplatesSeparate(
                                                                  project.projectPath,
                                                              )
                                                            : exportTemplatesBridge.prepareMigration(
                                                                  project.projectPath,
                                                                  choice ||
                                                                      'share-project',
                                                              ),
                                                    )
                                                }
                                            >
                                                {t('apply')}
                                            </button>
                                        </div>
                                        {choice && (
                                            <div className="alert alert-warning alert-soft mt-3 flex items-start gap-2 p-3 text-sm leading-relaxed text-warning-content dark:text-warning">
                                                <TriangleAlert
                                                    className="size-5 shrink-0"
                                                    aria-hidden="true"
                                                />
                                                <p>
                                                    {t(
                                                        `migration.details.${choice}`,
                                                    )}
                                                </p>
                                            </div>
                                        )}
                                        {choice && choice !== 'separate' && (
                                            <div className="alert alert-error alert-soft mt-3 flex items-start gap-2 p-3 text-sm text-error-content dark:text-error">
                                                <CircleX
                                                    className="size-5 shrink-0"
                                                    aria-hidden="true"
                                                />
                                                <p>
                                                    {t(
                                                        'migration.permanentDeletion',
                                                    )}
                                                </p>
                                            </div>
                                        )}
                                        {live && (
                                            <p
                                                role="status"
                                                className="mt-1 text-xs text-base-content/70"
                                            >
                                                {t(
                                                    `stages.${projectJob.stage}`,
                                                )}
                                            </p>
                                        )}
                                        {projectJob?.stage === 'error' && (
                                            <p
                                                role="alert"
                                                className="mt-1 text-xs text-error"
                                            >
                                                {errorText(
                                                    projectJob.error ?? '',
                                                )}
                                            </p>
                                        )}
                                        {!live &&
                                            !['ready', 'needs-review'].includes(
                                                project.state,
                                            ) && (
                                                <p className="mt-1 text-xs text-base-content/70">
                                                    {t(
                                                        `migration.reasons.${project.reason}`,
                                                    )}
                                                </p>
                                            )}
                                    </li>
                                );
                            })}
                        </ul>
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
