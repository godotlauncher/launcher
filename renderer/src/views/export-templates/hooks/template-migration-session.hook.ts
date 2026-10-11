import type {
    TemplateMigrationCheckProgress,
    TemplateMigrationDecision,
    TemplateMigrationReview,
    TemplateProjectAssessment,
} from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import {
    canChooseMigration,
    changeMigrationChoice,
    migrationErrorKey,
    migrationProjectDecision,
    reconcileMigrationChoices,
} from '../template-migration-choice.util';
import type {
    MigrationChoices,
    MigrationReviewActions,
} from '../template-migration-wizard.types';

/** Owns choices and a disposable, read-only review for one open wizard session.
 * @param projects - Current unresolved project assessments.
 * @param actions - Main-owned review and token disposal, or the dev fixture adapter.
 * @param frozen - Retains the reviewed run while discovery changes during execution.
 * @param recoveryKey - Invalidates reviews when recovery requirements change.
 */
export function useTemplateMigrationSession(
    projects: TemplateProjectAssessment[],
    actions: MigrationReviewActions,
    frozen = false,
    recoveryKey = '',
) {
    const [storedChoices, setChoices] = useState(() =>
        reconcileMigrationChoices(projects),
    );
    const choices = reconcileMigrationChoices(projects, storedChoices);
    const [review, setReview] = useState<TemplateMigrationReview | null>(null);
    const [reviewing, setReviewing] = useState(false);
    const [progress, setProgress] = useState<TemplateMigrationCheckProgress>();
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState('');
    const revision = useRef(0);
    const reviewRef = useRef<TemplateMigrationReview | null>(null);
    const reviewOwnerRef = useRef(actions);
    const actionsRef = useRef(actions);
    actionsRef.current = actions;
    const fingerprint = JSON.stringify([projects, recoveryKey]);
    const fingerprintRef = useRef(fingerprint);
    fingerprintRef.current = fingerprint;
    const previousFingerprint = useRef(fingerprint);

    /** Releases a token on edits, Back or unmount; a new review also invalidates it in main. */
    const releaseReview = () => {
        const current = reviewRef.current;
        reviewRef.current = null;
        if (current)
            void reviewOwnerRef.current.discard(current.token).catch(() => {});
    };
    /** Invalidates asynchronous work and the removal acknowledgement before another decision. */
    const invalidate = () => {
        revision.current++;
        releaseReview();
        setReview(null);
        setReviewing(false);
        setProgress(undefined);
        setConfirmed(false);
        setError('');
    };

    // biome-ignore lint/correctness/useExhaustiveDependencies: Compare discovery contents, not array identity.
    useEffect(() => {
        if (frozen || previousFingerprint.current === fingerprint) return;
        previousFingerprint.current = fingerprint;
        invalidate();
        setChoices((previous) => reconcileMigrationChoices(projects, previous));
    }, [fingerprint, frozen]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Dispose only when this session unmounts; refs hold the current adapter and review.
    useEffect(
        () => () => {
            revision.current++;
            releaseReview();
        },
        [],
    );

    /** Changes a selection, preserving the inactive mode's choices.
     * @param path - Registered project identity.
     * @param choice - New option.
     * @param setId - Version identity, or absent for all versions.
     */
    const choose = (
        path: string,
        choice: TemplateMigrationDecision,
        setId?: string,
    ) => {
        invalidate();
        setChoices((previous) => ({
            ...previous,
            [path]: changeMigrationChoice(
                previous[path] ?? choices[path],
                choice,
                setId,
            ),
        }));
    };
    /** Changes scope without copying over remembered choices.
     * @param path - Registered project identity.
     * @param individual - Whether each version has its own decision.
     */
    const setIndividual = (path: string, individual: boolean) => {
        invalidate();
        setChoices((previous) => ({
            ...previous,
            [path]: {
                ...(previous[path] ?? choices[path]),
                mode: individual ? 'per-version' : 'all-versions',
            },
        }));
    };
    /** Restores the recommended choice across both modes, leaving unavailable projects for later. */
    const reset = () => {
        invalidate();
        setChoices(
            (previous) =>
                Object.fromEntries(
                    projects.map((project) => {
                        const choice = canChooseMigration(project)
                            ? 'save-imported'
                            : 'later';
                        return [
                            project.projectPath,
                            changeMigrationChoice(
                                previous[project.projectPath] ??
                                    choices[project.projectPath],
                                choice,
                            ),
                        ];
                    }),
                ) as MigrationChoices,
        );
    };
    /** Adopts a fresh token and disposes any response superseded by edits, discovery or closing.
     * @param load - Main-owned review request, including a review limited to failed versions.
     */
    const loadReview = async (
        load: (requestId: string) => Promise<TemplateMigrationReview>,
    ): Promise<boolean> => {
        invalidate();
        const current = revision.current;
        setReviewing(true);
        const requestActions = actionsRef.current;
        const requestId = crypto.randomUUID();
        let polling = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        /** Polls one request without overlapping calls or adopting stale progress. */
        const poll = async () => {
            try {
                const value = await requestActions.progress?.(requestId);
                if (polling && current === revision.current) setProgress(value);
            } catch {
                /* Progress is optional; the review remains authoritative. */
            }
            if (polling && current === revision.current)
                timer = setTimeout(poll, 250);
        };
        if (requestActions.progress) timer = setTimeout(poll, 100);
        try {
            const result = await load(requestId);
            if (current !== revision.current) {
                void requestActions.discard(result.token).catch(() => {});
                return false;
            }
            reviewRef.current = result;
            reviewOwnerRef.current = requestActions;
            previousFingerprint.current = fingerprintRef.current;
            setReview(result);
            return true;
        } catch (failure) {
            if (current === revision.current)
                setError(migrationErrorKey(failure));
            return false;
        } finally {
            polling = false;
            clearTimeout(timer);
            if (current === revision.current) {
                setReviewing(false);
                setProgress(undefined);
            }
        }
    };
    /** Prepares the whole eligible batch and ignores responses superseded by new discovery. */
    const prepareReview = async (): Promise<boolean> => {
        const decisions = projects
            .filter(canChooseMigration)
            .map((project) => migrationProjectDecision(project, choices));
        if (!decisions.length) {
            invalidate();
            return true;
        }
        const owner = actionsRef.current;
        return loadReview((requestId) => owner.review(decisions, requestId));
    };
    return {
        choices,
        review,
        reviewing,
        progress,
        confirmed,
        setConfirmed,
        error,
        choose,
        setIndividual,
        reset,
        prepareReview,
        prepareRetryReview: loadReview,
        invalidate,
    };
}
