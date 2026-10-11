import type {
    TemplateMigrationAssessment,
    TemplateMigrationReview,
} from '@shared/contracts';
import { FileOutput } from 'lucide-react';
import {
    type ReactNode,
    type RefObject,
    useEffect,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import {
    Wizard,
    type WizardFooterProps,
    type WizardStep,
} from '../../../components/ui/wizard/wizard.component';
import { useTemplateMigrationSession } from '../hooks/template-migration-session.hook';
import {
    canChooseMigration,
    migrationErrorKey,
} from '../template-migration-choice.util';
import { migrationResults } from '../template-migration-results.util';
import { mergeMigrationReviews } from '../template-migration-run.util';
import type {
    MigrationReviewActions,
    MigrationRun,
    MigrationStep,
    MigrationVersionIdentity,
} from '../template-migration-wizard.types';
import { MigrationAboutStep } from './migration-about-step.component';
import { MigrationCheckingOverlay } from './migration-checking-overlay.component';
import {
    MigrationChooseStep,
    MigrationChooseSummary,
} from './migration-choose-step.component';
import {
    MigrationDoneStep,
    MigrationDoneSummary,
} from './migration-done-step.component';
import {
    MigrationMoveStep,
    MigrationMoveSummary,
} from './migration-move-step.component';
import { MigrationOptionsStep } from './migration-options-step.component';
import {
    MigrationRemovalConfirmation,
    MigrationReviewStep,
    MigrationReviewSummary,
} from './migration-review-step.component';

type Props = {
    assessment: TemplateMigrationAssessment;
    reviewActions: MigrationReviewActions;
    run?: MigrationRun;
    onApply: (
        review: TemplateMigrationReview,
        removalConfirmed: boolean,
    ) => Promise<void>;
    onRetry?: (
        review: TemplateMigrationReview,
        versions: MigrationVersionIdentity[],
        requestId?: string,
    ) => Promise<TemplateMigrationReview>;
    onRecover?: () => Promise<void>;
    onRefresh?: () => Promise<void>;
    onAboutDone?: () => void;
    initialReview?: TemplateMigrationReview;
    error?: string;
    onOpenTemplates?: () => void;
    onClose: () => void;
    returnFocusRef: RefObject<HTMLElement | null>;
    fallbackReturnFocusRef?: RefObject<HTMLElement | null>;
};
const stepIds: MigrationStep[] = [
    'about',
    'options',
    'choose',
    'review',
    'move',
    'done',
];

/** Mounts six export-template steps in the existing Dialog with feature-owned state.
 * File operations belong to the host; no legacy migration call bypasses the review.
 * @param props - Discovery, read-only review, execution adapter and modal lifecycle.
 */
export function TemplateMigrationWizardModal({
    assessment,
    reviewActions,
    run,
    onApply,
    onRetry,
    onRecover,
    onRefresh,
    onAboutDone,
    initialReview,
    error,
    onOpenTemplates,
    onClose,
    returnFocusRef,
    fallbackReturnFocusRef,
}: Props) {
    const { t } = useTranslation('exportTemplates');
    const projects = assessment.projects.filter(
        (project) => project.pending && project.reason !== 'empty',
    );
    const [step, setStep] = useState<MigrationStep>(
        initialReview
            ? run?.status === 'complete'
                ? 'done'
                : 'move'
            : 'about',
    );
    const [resultReview, setResultReview] = useState(initialReview);
    const [retryReview, setRetryReview] = useState(false);
    const session = useTemplateMigrationSession(
        projects,
        reviewActions,
        step === 'move' || step === 'done',
        JSON.stringify(assessment.recoveryIds),
    );
    const [applying, setApplying] = useState(false);
    const [recovering, setRecovering] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [failure, setFailure] = useState('');
    const executing =
        applying ||
        recovering ||
        (step === 'move' && run?.status !== 'complete');
    const busy = session.reviewing || refreshing || executing;
    const index = stepIds.indexOf(step);
    const deferred = projects.filter((project) => !canChooseMigration(project));
    const [reviewedDeferred, setReviewedDeferred] = useState(() =>
        deferred.filter(
            (project) =>
                !initialReview?.projects.some(
                    (reviewed) => reviewed.projectPath === project.projectPath,
                ),
        ),
    );
    const fingerprint = JSON.stringify([projects, assessment.recoveryIds]);
    const fingerprintRef = useRef(fingerprint);
    fingerprintRef.current = fingerprint;
    const resultsReview = resultReview ?? session.review;
    const [reviewedFingerprint, setReviewedFingerprint] = useState('');
    const hasMoves = !!session.review?.projects.some((project) =>
        project.versions.some((version) => version.choice !== 'later'),
    );
    const canApply =
        !!session.review &&
        hasMoves &&
        reviewedFingerprint === fingerprint &&
        (!session.review.requiresRemovalConfirmation || session.confirmed) &&
        !assessment.recoveryIds.length;

    useEffect(() => {
        if (step === 'move' && run?.status === 'complete' && !applying)
            setStep('done');
    }, [step, run?.status, applying]);

    useEffect(() => {
        if (step === 'review' && reviewedFingerprint !== fingerprint) {
            setFailure('errors.changed');
            setStep('choose');
        }
    }, [fingerprint, reviewedFingerprint, step]);

    /** Requests a new read-only batch before displaying Review. */
    const review = async () => {
        if (assessment.recoveryIds.length) return;
        setFailure('');
        setRetryReview(false);
        if (await session.prepareReview()) {
            setReviewedDeferred(deferred);
            setReviewedFingerprint(fingerprint);
            setStep('review');
        }
    };
    /** Returns to earlier steps and clears any token or removal acknowledgement. */
    const back = () => {
        if (step === 'review') session.invalidate();
        setRetryReview(false);
        setFailure('');
        setStep(stepIds[index - 1]);
    };
    /** Submits only the reviewed batch after the removal guard passes. */
    const apply = async () => {
        if (!canApply || !session.review) return;
        setApplying(true);
        setFailure('');
        setResultReview(
            retryReview && resultReview
                ? mergeMigrationReviews(resultReview, session.review)
                : session.review,
        );
        setStep('move');
        try {
            await onApply(session.review, session.confirmed);
        } catch (error) {
            setFailure(migrationErrorKey(error));
            session.invalidate();
            setStep('choose');
        } finally {
            setApplying(false);
        }
    };
    /** Lets the host prepare a safe retry for the failed identities only.
     * @param versions - Exact failed project and version identities.
     */
    const retry = async (versions: MigrationVersionIdentity[]) => {
        if (!onRetry || !resultsReview || assessment.recoveryIds.length) return;
        setFailure('');
        if (
            await session.prepareRetryReview((requestId) =>
                onRetry(resultsReview, versions, requestId),
            )
        ) {
            setRetryReview(true);
            setReviewedFingerprint(fingerprintRef.current);
            setStep('review');
        }
    };
    /** Runs recovery or discovery without hiding the persistent footer.
     * @param recover - Whether the user requested recovery rather than a read-only refresh.
     */
    const refresh = async (recover: boolean) => {
        const action = recover ? onRecover : onRefresh;
        if (!action) return;
        setFailure('');
        if (recover) setRecovering(true);
        else setRefreshing(true);
        try {
            await action();
        } catch (failure) {
            setFailure(migrationErrorKey(failure));
        } finally {
            setRecovering(false);
            setRefreshing(false);
        }
    };
    const contents = {
        about: <MigrationAboutStep projectCount={projects.length} />,
        options: <MigrationOptionsStep />,
        choose: (
            <MigrationChooseStep
                projects={projects}
                choices={session.choices}
                onChoose={session.choose}
                onIndividual={session.setIndividual}
            />
        ),
        review: (
            <MigrationReviewStep
                review={session.review}
                deferredProjects={reviewedDeferred}
            />
        ),
        move: resultsReview && (
            <MigrationMoveStep review={resultsReview} run={run} />
        ),
        done: resultsReview && (
            <MigrationDoneStep
                review={resultsReview}
                run={run}
                deferredProjects={reviewedDeferred}
            />
        ),
    };
    const summaries: Partial<Record<MigrationStep, ReactNode>> = {
        choose: (
            <MigrationChooseSummary
                projects={projects}
                choices={session.choices}
                onReset={session.reset}
            />
        ),
        review: (
            <MigrationReviewSummary
                review={session.review}
                deferredProjects={reviewedDeferred}
            />
        ),
        move: resultsReview && (
            <MigrationMoveSummary review={resultsReview} run={run} />
        ),
        done: resultsReview && (
            <MigrationDoneSummary
                review={resultsReview}
                run={run}
                deferredProjects={reviewedDeferred}
            />
        ),
    };
    const failedVersions = resultsReview
        ? migrationResults(resultsReview, run).failed
        : [];
    const steps: WizardStep[] = stepIds.map((id) => ({
        id,
        label: t(`wizardMigration.steps.${id}`),
        title: t(`wizardMigration.titles.${id}`),
        content: contents[id],
        summary: summaries[id],
        scrollHint:
            id === 'choose'
                ? t('wizardMigration.moreProjects')
                : ['review', 'move', 'done'].includes(id)
                  ? t('wizardMigration.moreVersions')
                  : undefined,
    }));
    const footerActions: WizardFooterProps = {};
    if (assessment.recoveryIds.length && onRecover && step !== 'move') {
        footerActions.auxiliary = {
            label: t(
                recovering
                    ? 'wizardMigration.recovering'
                    : 'wizardMigration.recover',
            ),
            onClick: () => void refresh(true),
        };
    } else if (step === 'done' && failedVersions.length && onRetry) {
        footerActions.auxiliary = {
            label: t('wizardMigration.retryFailedCount', {
                number: failedVersions.length,
            }),
            onClick: () => void retry(failedVersions),
        };
    } else if (step === 'choose' && onRefresh) {
        footerActions.auxiliary = {
            label: t('refresh'),
            onClick: () => void refresh(false),
        };
    }
    if (index > 0 && index < 4) {
        footerActions.back = {
            label: t('wizardMigration.back'),
            onClick: back,
        };
    }
    if (step === 'done') {
        if (onOpenTemplates) {
            footerActions.secondary = {
                label: t('wizardMigration.openTemplates'),
                onClick: onOpenTemplates,
            };
        }
    } else if (step !== 'move' && !(step === 'review' && !hasMoves)) {
        footerActions.secondary = {
            label: t('wizardMigration.finishLater'),
            onClick: onClose,
            allowWhileBusy: !executing,
        };
    }
    switch (step) {
        case 'about':
            footerActions.primary = {
                label: t('wizardMigration.seeOptions'),
                onClick: () => {
                    onAboutDone?.();
                    setStep('options');
                },
            };
            break;
        case 'options':
            footerActions.primary = {
                label: t('wizardMigration.chooseProjects'),
                onClick: () => setStep('choose'),
            };
            break;
        case 'choose':
            footerActions.primary = {
                label: t('wizardMigration.reviewChoices'),
                onClick: () => void review(),
                disabled: !!assessment.recoveryIds.length,
            };
            break;
        case 'review':
            footerActions.primary = hasMoves
                ? {
                      label: t('wizardMigration.moveTemplates'),
                      onClick: () => void apply(),
                      disabled: !canApply,
                  }
                : {
                      label: t('wizardMigration.finishLater'),
                      onClick: onClose,
                  };
            break;
        case 'move':
            footerActions.primary = {
                label: t('wizardMigration.moving'),
                onClick: () => {},
                disabled: true,
            };
            break;
        case 'done':
            footerActions.primary = {
                label: t('wizardMigration.done'),
                onClick: onClose,
            };
            break;
    }
    return (
        <Wizard
            steps={steps}
            activeStepId={step}
            busy={busy}
            progressLabel={t('wizardMigration.stepsLabel')}
        >
            <Dialog
                title={t('wizardMigration.title')}
                icon={<FileOutput className="size-6" aria-hidden="true" />}
                fillWindow
                testId="templateMigrationWizard"
                bodyClassName="flex min-h-0 flex-col overflow-hidden"
                returnFocusRef={returnFocusRef}
                fallbackReturnFocusRef={fallbackReturnFocusRef}
                onRequestClose={
                    executing || session.reviewing ? undefined : onClose
                }
                overlay={
                    session.reviewing ? (
                        <MigrationCheckingOverlay progress={session.progress} />
                    ) : undefined
                }
                footer={
                    <div className="flex w-full flex-col gap-3">
                        {step === 'review' &&
                            session.review?.requiresRemovalConfirmation && (
                                <MigrationRemovalConfirmation
                                    confirmed={session.confirmed}
                                    onConfirm={session.setConfirmed}
                                />
                            )}
                        <Wizard.Footer {...footerActions} />
                    </div>
                }
            >
                {(session.error || failure || error) && (
                    <p
                        role="alert"
                        className="mb-3 text-error-content dark:text-error"
                    >
                        {t(
                            session.error ||
                                failure ||
                                migrationErrorKey(error),
                        )}
                    </p>
                )}
                {!!assessment.recoveryIds.length && (
                    <p
                        role="alert"
                        className="mb-3 text-[color:var(--color-warning-readable)]"
                    >
                        {t('errors.recovery')}
                    </p>
                )}
                <Wizard.Body />
            </Dialog>
        </Wizard>
    );
}
