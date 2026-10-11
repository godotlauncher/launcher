import type {
    TemplateMigrationAssessment,
    TemplateMigrationReview,
} from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { TemplateMigrationWizardModal } from '../../../renderer/src/views/export-templates/components/template-migration-wizard.modal';
import {
    mergeMigrationRuns,
    migrationRetryDecisions,
} from '../../../renderer/src/views/export-templates/template-migration-run.util';
import type {
    MigrationReviewActions,
    MigrationRun,
    MigrationVersionIdentity,
    MigrationVersionResult,
    MigrationVersionStatus,
} from '../../../renderer/src/views/export-templates/template-migration-wizard.types';
import {
    migrationFixtureAssessment,
    migrationFixtureChangedAssessment,
    migrationFixtureReview,
} from './migration-assessment.fixture';

type PreviewAudit = {
    requests: number;
    released: number;
    moves: number;
    active: number;
    pending: number;
};

/** Exercises the export-template UI in Electron without reading or changing template files. */
export function MigrationWizardFixture() {
    const [assessment, setAssessment] = useState(migrationFixtureAssessment);
    const assessmentRef = useRef(assessment);
    const [open, setOpen] = useState(false);
    const [run, setRun] = useState<MigrationRun>();
    const [showFailure, setShowFailure] = useState(false);
    const [failReview, setFailReview] = useState(false);
    const [unavailableOnly, setUnavailableOnly] = useState(false);
    const [needsRecovery, setNeedsRecovery] = useState(false);
    const [pauseReviews, setPauseReviews] = useState(false);
    const [audit, setAudit] = useState<PreviewAudit>({
        requests: 0,
        released: 0,
        moves: 0,
        active: 0,
        pending: 0,
    });
    const paused = useRef<(() => void)[]>([]);
    const checkingRequest = useRef<
        { requestId?: string; projectCount: number } | undefined
    >(undefined);
    const owners = useRef(new Map<string, MigrationReviewActions>());
    const mounted = useRef(true);
    const failNextReview = useRef(false);
    const generation = useRef(0);
    const retrying = useRef(false);
    const trigger = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            generation.current++;
            for (const [token, adapter] of owners.current)
                void adapter.discard(token);
            owners.current.clear();
            for (const release of paused.current.splice(0)) release();
        };
    }, []);

    /** Reports sample boundary activity, including disposal of stale review responses.
     * @param event - Optional counter to increment alongside current sample state.
     */
    const record = (event?: 'request' | 'release' | 'move') => {
        if (!mounted.current) return;
        const active = owners.current.size;
        const pending = paused.current.length;
        setAudit((previous) => ({
            requests: previous.requests + Number(event === 'request'),
            released: previous.released + Number(event === 'release'),
            moves: previous.moves + Number(event === 'move'),
            active,
            pending,
        }));
    };
    /** Completes the oldest paused response, even after its wizard has closed. */
    const finishNextReview = () => {
        paused.current.shift()?.();
        record();
    };
    /** Updates sample discovery for the open session.
     * @param next - Replacement in-memory assessment.
     */
    const changeAssessment = (next: TemplateMigrationAssessment) => {
        assessmentRef.current = next;
        setAssessment(next);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: Shortcuts use refs and stable setters; only modal visibility changes their availability.
    useEffect(() => {
        /** Controls mocked test scenarios while the native modal makes the page inert.
         * @param event - Shortcut pressed in the test fixture's Electron renderer.
         */
        const controlScenario = (event: KeyboardEvent) => {
            if (
                !event.ctrlKey ||
                !event.shiftKey ||
                event.altKey ||
                event.metaKey
            )
                return;
            if (event.code === 'Enter') {
                event.preventDefault();
                finishNextReview();
            } else if (open && event.code === 'KeyD') {
                event.preventDefault();
                changeAssessment(
                    migrationFixtureChangedAssessment(assessmentRef.current),
                );
            } else if (open && event.code === 'KeyR') {
                event.preventDefault();
                const current = assessmentRef.current;
                changeAssessment({
                    ...current,
                    recoveryIds: current.recoveryIds.length
                        ? []
                        : ['preview-recovery'],
                });
            }
        };
        window.addEventListener('keydown', controlScenario);
        return () => window.removeEventListener('keydown', controlScenario);
    }, [open]);

    /** Opens a fresh sample session without changing the current application's projects. */
    const start = () => {
        generation.current++;
        const sample = migrationFixtureAssessment();
        if (unavailableOnly)
            sample.projects = sample.projects.filter(
                (project) => project.state === 'unavailable',
            );
        sample.pendingCount = sample.projects.length;
        if (needsRecovery) sample.recoveryIds = ['preview-recovery'];
        changeAssessment(sample);
        setRun(undefined);
        retrying.current = false;
        failNextReview.current = failReview;
        setOpen(true);
    };
    /** Produces phases from a sample host and retains successful outcomes during retry.
     * @param initial - Previously known version outcomes.
     * @param selected - Exact identities to simulate in this run.
     * @param failOne - Whether the first selected version should fail.
     */
    const simulate = async (
        initial: MigrationVersionResult[],
        selected: MigrationVersionIdentity[],
        failOne: boolean,
    ) => {
        const current = ++generation.current;
        let results = initial;
        const selectedVersion = (version: MigrationVersionIdentity) =>
            selected.some(
                (item) =>
                    item.projectPath === version.projectPath &&
                    item.setId === version.setId,
            );
        const phases: MigrationVersionStatus[] = [
            'checking',
            'copying',
            'verifying',
            'connecting',
            'cleaning',
        ];
        for (const status of phases) {
            if (current !== generation.current) return;
            const checked = ['checking', 'verifying', 'cleaning'].includes(
                status,
            );
            for (const completedBytes of checked
                ? [0, 1024, 2048, 4096]
                : [0]) {
                if (current !== generation.current) return;
                results = results.map((version) =>
                    selectedVersion(version)
                        ? {
                              ...version,
                              status,
                              error: undefined,
                              progress: checked
                                  ? { completedBytes, totalBytes: 4096 }
                                  : undefined,
                          }
                        : version,
                );
                setRun({ status: 'running', versions: results });
                await new Promise((resolve) =>
                    window.setTimeout(resolve, checked ? 175 : 700),
                );
            }
        }
        if (current !== generation.current) return;
        const failed = failOne ? selected[0] : undefined;
        setRun({
            status: 'complete',
            versions: results.map((version) =>
                selectedVersion(version)
                    ? {
                          ...version,
                          status:
                              failed?.projectPath === version.projectPath &&
                              failed?.setId === version.setId
                                  ? 'error'
                                  : 'complete',
                          progress: undefined,
                          error:
                              failed?.projectPath === version.projectPath &&
                              failed?.setId === version.setId
                                  ? 'exportTemplates:errors.space'
                                  : undefined,
                      }
                    : version,
            ),
        });
    };
    /** Simulates only the reviewed identities, preserving versions left for later.
     * @param review - Sample review produced by the fixture boundary.
     */
    const apply = async (review: TemplateMigrationReview) => {
        record('move');
        const versions = review.projects.flatMap((project) =>
            project.versions.map((version) => ({
                projectPath: project.projectPath,
                setId: version.setId,
                status:
                    version.choice === 'later'
                        ? ('later' as const)
                        : ('waiting' as const),
            })),
        );
        await simulate(
            mergeMigrationRuns(run, { status: 'running', versions }).versions,
            versions.filter((version) => version.status !== 'later'),
            showFailure && !retrying.current,
        );
        retrying.current = false;
    };
    /** Retries only failed sample versions, without replaying successful ones.
     * @param versions - Identities provided by the result screen.
     */
    const retry = async (
        review: TemplateMigrationReview,
        versions: MigrationVersionIdentity[],
    ) => {
        const result = await reviewActions.review(
            migrationRetryDecisions(review, versions, assessmentRef.current),
        );
        retrying.current = true;
        return result;
    };
    const reviewActions: MigrationReviewActions = {
        /** Demonstrates a bounded review error before returning the normal sample review.
         * @param decisions - Current sample choices.
         * @param requestId - Request owning the displayed checking progress.
         */
        review: async (decisions, requestId) => {
            checkingRequest.current = {
                requestId,
                projectCount: decisions.length,
            };
            record('request');
            if (failNextReview.current) {
                failNextReview.current = false;
                throw new Error('exportTemplates:errors.changed');
            }
            const adapter = migrationFixtureReview(assessmentRef.current);
            const result = await adapter.review(decisions);
            if (!mounted.current) {
                await adapter.discard(result.token);
                return result;
            }
            owners.current.set(result.token, adapter);
            if (pauseReviews) {
                await new Promise<void>((resolve) => {
                    paused.current.push(resolve);
                    record();
                });
            } else record();
            return result;
        },
        /** Supplies deterministic byte progress for the paused Electron UI scenario.
         * @param requestId - Identifier of the active checking request.
         */
        progress: async (requestId) =>
            checkingRequest.current?.requestId === requestId
                ? {
                      phase: 'checking',
                      projectName: 'Night Garden',
                      projectIndex: 1,
                      projectCount: checkingRequest.current.projectCount,
                      completedBytes: 1024,
                      totalBytes: 4096,
                  }
                : undefined,
        /** Releases the original sample adapter's token exactly once.
         * @param token - Accepted or superseded sample review identity.
         */
        discard: async (token) => {
            const adapter = owners.current.get(token);
            if (!adapter) return;
            owners.current.delete(token);
            await adapter.discard(token);
            record('release');
        },
    };
    return (
        <div className="flex flex-col items-start gap-4 p-4 text-base">
            <h1 className="text-2xl font-semibold">
                Export-template migration fixture
            </h1>
            <p>
                Development only. Twelve sample projects, multiple versions and
                unavailable projects. This preview reads and changes no template
                files.
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={showFailure}
                        onChange={(event) =>
                            setShowFailure(event.target.checked)
                        }
                    />
                    Show a failed version
                </label>
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={failReview}
                        onChange={(event) =>
                            setFailReview(event.target.checked)
                        }
                    />
                    Make the first review fail
                </label>
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={unavailableOnly}
                        onChange={(event) =>
                            setUnavailableOnly(event.target.checked)
                        }
                    />
                    Only unavailable projects
                </label>
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={needsRecovery}
                        onChange={(event) =>
                            setNeedsRecovery(event.target.checked)
                        }
                    />
                    Start with recovery needed
                </label>
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={pauseReviews}
                        onChange={(event) =>
                            setPauseReviews(event.target.checked)
                        }
                    />
                    Pause review responses
                </label>
            </div>
            <p>
                While the wizard is open: Ctrl+Shift+D changes the sample
                projects, Ctrl+Shift+R turns recovery on or off, and
                Ctrl+Shift+Enter finishes the next paused review. All changes
                stay in this preview.
            </p>
            <div className="flex flex-wrap gap-2">
                <button
                    ref={trigger}
                    type="button"
                    className="btn btn-primary text-base"
                    onClick={start}
                >
                    Open migration fixture
                </button>
                <button
                    type="button"
                    className="btn btn-ghost text-base"
                    disabled={!audit.pending}
                    onClick={finishNextReview}
                >
                    Finish next paused review
                </button>
            </div>
            <dl
                aria-label="Sample review activity"
                className="flex flex-wrap gap-4 text-sm"
            >
                {(
                    [
                        ['Reviews requested', audit.requests],
                        ['Active reviews', audit.active],
                        ['Reviews released', audit.released],
                        ['Waiting reviews', audit.pending],
                        ['Moves started', audit.moves],
                    ] as const
                ).map(([label, count]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd>{count}</dd>
                    </div>
                ))}
            </dl>
            {open && (
                <TemplateMigrationWizardModal
                    assessment={assessment}
                    reviewActions={reviewActions}
                    run={run}
                    onApply={apply}
                    onRetry={retry}
                    onRecover={async () =>
                        changeAssessment({
                            ...assessmentRef.current,
                            recoveryIds: [],
                        })
                    }
                    returnFocusRef={trigger}
                    onClose={() => {
                        generation.current++;
                        setOpen(false);
                    }}
                    onOpenTemplates={() => {
                        generation.current++;
                        setOpen(false);
                        window.location.hash = '#/export-templates';
                    }}
                />
            )}
        </div>
    );
}
