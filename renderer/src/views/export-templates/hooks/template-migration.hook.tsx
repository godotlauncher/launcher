import type {
    TemplateMigrationAssessment,
    TemplateMigrationReview,
    TemplateMigrationRun,
    TemplateMigrationVersionIdentity,
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
import { useNavigate } from 'react-router';
import { appRoutePaths } from '../../../app.routes';
import { usePreferences } from '../../../hooks/preferences.hook';
import { useProjects } from '../../../hooks/projects.hook';
import { exportTemplatesBridge } from '../../../renderer.bridge';
import { TemplateMigrationWizardModal } from '../components/template-migration-wizard.modal';
import { hasMigrationCandidates } from '../template-migration-choice.util';
import {
    mergeMigrationRuns,
    migrationRetryDecisions,
} from '../template-migration-run.util';
import { refreshTemplateJobs, useTemplateJobs } from './template-jobs.hook';

type MigrationContext = {
    assessment: TemplateMigrationAssessment | null;
    refresh: () => Promise<void>;
    open: () => void;
    active: boolean;
};
const context = createContext<MigrationContext | null>(null);

/** Shares the migration entry point across application routes. */
export function useTemplateMigration(): MigrationContext {
    const value = useContext(context);
    if (!value) throw new Error('TemplateMigrationProvider is required');
    return value;
}

/** Keeps the modal and queued progress available while navigating between views.
 * @param props - Application routes shown beneath the modal.
 */
export function TemplateMigrationProvider({ children }: PropsWithChildren) {
    const { preferences, loadPreferences, savePreferences } = usePreferences();
    const { projects, refreshProjects } = useProjects();
    const navigate = useNavigate();
    const jobs = useTemplateJobs();
    const [assessment, setAssessment] =
        useState<TemplateMigrationAssessment | null>(null);
    const [error, setError] = useState('');
    const [visible, setVisible] = useState(false);
    const [introduction, setIntroduction] = useState(false);
    const [jobIds, setJobIds] = useState<string[]>([]);
    const [seedRun, setSeedRun] = useState<TemplateMigrationRun>();
    const [initialReview, setInitialReview] =
        useState<TemplateMigrationReview>();
    const refreshProjectsRef = useRef(refreshProjects);
    refreshProjectsRef.current = refreshProjects;
    const refreshedJobs = useRef(new Set<string>());
    const active = jobs.some(
        (job) =>
            job.migration &&
            (job.stage === 'error' || job.migration.status === 'running'),
    );
    let run: TemplateMigrationRun | undefined;
    for (const id of jobIds) {
        const progress = jobs.find((job) => job.id === id)?.migration;
        if (progress) run = mergeMigrationRuns(run, progress);
    }
    if (seedRun && !jobs.some((job) => job.id === jobIds[jobIds.length - 1]))
        run = mergeMigrationRuns(run, seedRun);
    const hasCandidates = Boolean(
        assessment && hasMigrationCandidates(assessment.projects),
    );
    const automaticOfferEligible = Boolean(
        preferences &&
            preferences.export_template_migration_offered !== true &&
            hasCandidates,
    );
    const offerEligibleRef = useRef(automaticOfferEligible);
    offerEligibleRef.current = automaticOfferEligible;
    const offered = useRef(false);
    const request = useRef(0);
    const focusTarget = useRef<HTMLElement | null>(null);
    const fallbackFocusTarget = useRef<HTMLElement | null>(null);
    const lifecycle = jobs.map((job) => `${job.id}:${job.stage}`).join('|');
    const projectLifecycle = projects
        .map(
            (project) =>
                `${project.path}:${project.launch_path}:${project.exportTemplateMode}:${JSON.stringify(project.exportTemplateBuilds)}`,
        )
        .join('|');

    /** Refreshes cheap metadata, leaving detailed hashing to a selected project. */
    const refresh = useCallback(async () => {
        const current = ++request.current;
        try {
            const result = await exportTemplatesBridge.getMigrationAssessment();
            if (current === request.current) {
                setAssessment(result);
                setError('');
            }
        } catch {
            if (current === request.current)
                setError('exportTemplates:errors.read');
        }
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Recheck only when registered project environments change.
    useEffect(() => {
        void exportTemplatesBridge
            .connectEmptyProjects()
            .then(refresh)
            .catch(() => {
                setError('exportTemplates:errors.connection');
            });
    }, [projectLifecycle, refresh]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Project changes are refreshed after empty projects connect.
    useEffect(() => {
        void refresh();
    }, [lifecycle, refresh]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh saved project choices once for each completed migration job.
    useEffect(() => {
        for (const job of jobs) {
            if (
                job.migration?.status !== 'complete' ||
                refreshedJobs.current.has(job.id)
            )
                continue;
            refreshedJobs.current.add(job.id);
            void refreshProjectsRef
                .current()
                .catch(() => setError('exportTemplates:errors.read'));
        }
    }, [lifecycle]);
    useEffect(() => {
        const focused = () => {
            void refresh();
        };
        window.addEventListener('focus', focused);
        return () => {
            window.removeEventListener('focus', focused);
            request.current++;
        };
    }, [refresh]);

    /** Records acknowledgement without treating postponed projects as migrated. */
    const acknowledge = useCallback(async () => {
        const current = await loadPreferences();
        if (current.export_template_migration_offered !== true)
            await savePreferences({
                ...current,
                export_template_migration_offered: true,
            });
    }, [loadPreferences, savePreferences]);

    useEffect(() => {
        if (introduction && assessment && !hasCandidates && !error) {
            setVisible(false);
            setIntroduction(false);
            offered.current = false;
        }
    }, [assessment, hasCandidates, introduction, error]);

    useEffect(() => {
        if (!automaticOfferEligible || offered.current) return;
        // Wait for existing dialogs/drawers; an upgrade offer must not interrupt them.
        const timer = window.setInterval(() => {
            if (!offerEligibleRef.current || offered.current) return;
            const overlays = document.querySelectorAll(
                'dialog[open], [role="dialog"], :popover-open',
            );
            if ([...overlays].some((element) => element.checkVisibility()))
                return;
            offered.current = true;
            focusTarget.current = document.activeElement as HTMLElement;
            fallbackFocusTarget.current = document.querySelector<HTMLElement>(
                '[data-testid="btnExportTemplates"]',
            );
            setIntroduction(true);
            setInitialReview(undefined);
            setJobIds([]);
            setSeedRun(undefined);
            setVisible(true);
            window.clearInterval(timer);
        }, 500);
        return () => window.clearInterval(timer);
    }, [automaticOfferEligible]);

    /** Opens the existing workflow directly from the templates header. */
    const open = useCallback(() => {
        offered.current = true;
        focusTarget.current = document.activeElement as HTMLElement;
        fallbackFocusTarget.current = document.querySelector<HTMLElement>(
            '[data-testid="btnExportTemplates"]',
        );
        setIntroduction(false);
        const previous = [...jobs]
            .reverse()
            .find(
                (job) =>
                    job.migration?.review &&
                    (job.stage === 'error' ||
                        job.migration.status === 'running'),
            );
        setInitialReview(
            previous?.migration?.review
                ? { ...previous.migration.review, token: previous.id }
                : undefined,
        );
        setJobIds(previous ? [previous.id] : []);
        setSeedRun(undefined);
        setVisible(true);
        void refresh();
    }, [refresh, jobs]);

    // Completion can remove the header trigger just after the dialog returns focus.
    // biome-ignore lint/correctness/useExhaustiveDependencies: Assessment changes can remove the saved focus target from the DOM.
    useEffect(() => {
        if (
            !visible &&
            focusTarget.current &&
            !focusTarget.current.isConnected &&
            document.activeElement === document.body
        ) {
            fallbackFocusTarget.current?.focus({ preventScroll: true });
        }
    }, [visible, assessment]);

    /** Records Finish later or Done before closing the session. */
    const close = async () => {
        try {
            await acknowledge();
        } catch {
            setError('exportTemplates:errors.failed');
            return false;
        }
        setVisible(false);
        return true;
    };

    /** Starts only a consumed main-owned review and follows its exact returned job.
     * @param review - Fresh reviewed effects.
     * @param confirmed - Explicit removal acknowledgement from this Review.
     */
    const apply = async (
        review: TemplateMigrationReview,
        confirmed: boolean,
    ) => {
        await acknowledge();
        const id = await exportTemplatesBridge.applyMigrationReview(
            review.token,
            confirmed,
        );
        setIntroduction(false);
        setSeedRun(
            mergeMigrationRuns(run, {
                status: 'running',
                versions: review.projects.flatMap((project) =>
                    project.versions.map((version) => ({
                        projectPath: project.projectPath,
                        setId: version.setId,
                        status:
                            version.choice === 'later'
                                ? ('later' as const)
                                : ('waiting' as const),
                    })),
                ),
            }),
        );
        setJobIds((previous) => [...previous, id]);
        await refreshTemplateJobs().catch(() => undefined);
    };
    /** Reads fresh discovery and prepares a new review limited to failed identities.
     * @param review - Earlier reviewed choices whose failures are being retried.
     * @param versions - Failed identities selected from real results.
     * @param requestId - Identifier for retry preparation progress.
     */
    const retry = async (
        review: TemplateMigrationReview,
        versions: TemplateMigrationVersionIdentity[],
        requestId?: string,
    ) => {
        const current = await exportTemplatesBridge.getMigrationAssessment();
        return exportTemplatesBridge.reviewMigration(
            migrationRetryDecisions(review, versions, current),
            requestId,
        );
    };
    /** Attempts only discovered recovery records, then refreshes real outcomes even after failure. */
    const recover = async () => {
        const current = await exportTemplatesBridge.getMigrationAssessment();
        try {
            for (const id of current.recoveryIds)
                await exportTemplatesBridge.recover(id);
        } finally {
            await Promise.all([refresh(), refreshTemplateJobs()]);
        }
    };

    return (
        <context.Provider value={{ assessment, refresh, open, active }}>
            {children}
            {visible && assessment && (
                <TemplateMigrationWizardModal
                    assessment={assessment}
                    reviewActions={{
                        review: (decisions, requestId) =>
                            exportTemplatesBridge.reviewMigration(
                                decisions,
                                requestId,
                            ),
                        progress: (requestId) =>
                            exportTemplatesBridge.getMigrationReviewProgress(
                                requestId,
                            ),
                        discard: (token) =>
                            exportTemplatesBridge.discardMigrationReview(token),
                    }}
                    run={run}
                    initialReview={initialReview}
                    error={error}
                    returnFocusRef={focusTarget}
                    fallbackReturnFocusRef={fallbackFocusTarget}
                    onApply={apply}
                    onRetry={retry}
                    onRecover={recover}
                    onRefresh={refresh}
                    onAboutDone={() => setIntroduction(false)}
                    onClose={() => {
                        void close();
                    }}
                    onOpenTemplates={() => {
                        void close().then((closed) => {
                            if (closed) navigate(appRoutePaths.exportTemplates);
                        });
                    }}
                />
            )}
        </context.Provider>
    );
}
