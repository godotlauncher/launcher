import type { ReleaseInstallProgress } from '@shared/contracts';
import clsx from 'clsx';
import { Check, Circle, LoaderCircle, Minus } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ReleaseInstallProgressIndicator } from '../../../../components/release-install-progress.component';
import type { CreateProjectProgressPhase } from '../create-project-workflow.types';

export type { CreateProjectProgressPhase } from '../create-project-workflow.types';

export type CreateProjectProgressStepId =
    | 'installing'
    | 'creating'
    | 'launching';

type CreateProjectProgressStepState =
    | 'pending'
    | 'active'
    | 'complete'
    | 'skipped';

export type CreateProjectProgressLabels = {
    title: string;
    installingEditor: string;
    creatingProject: string;
    launchingEditor: string;
    skipped: string;
};

type CreateProjectProgressOverlayProps = {
    phase: CreateProjectProgressPhase;
    editorInstalled: boolean;
    editNow: boolean;
    labels: CreateProjectProgressLabels;
    installProgress?: ReleaseInstallProgress;
    className?: string;
};

const progressStepIds: CreateProjectProgressStepId[] = [
    'installing',
    'creating',
    'launching',
];

/**
 * Gets the visual state for one immutable Create Project workflow step.
 *
 * @param stepId - The workflow step to evaluate.
 * @param phase - The operation currently running.
 * @param editorInstalled - Whether the selected editor was already available.
 * @param editNow - Whether the newly created project should be opened.
 * @returns The step's pending, active, complete, or skipped state.
 */
export function getCreateProjectProgressStepState(
    stepId: CreateProjectProgressStepId,
    phase: CreateProjectProgressPhase,
    editorInstalled: boolean,
    editNow: boolean,
): CreateProjectProgressStepState {
    if (stepId === 'launching' && !editNow) {
        return 'skipped';
    }

    if (stepId === 'installing' && editorInstalled) {
        return 'complete';
    }

    if (phase === 'complete') {
        return 'complete';
    }

    const stepIndex = progressStepIds.indexOf(stepId);
    const activeIndex = progressStepIds.indexOf(phase);

    if (stepIndex < activeIndex) {
        return 'complete';
    }

    return stepIndex === activeIndex ? 'active' : 'pending';
}

/**
 * Renders the blocking status overlay used while a project is being created.
 *
 * @param props - The active workflow phase, labels, and optional editor install progress.
 * @returns A non-dismissible, accessible workflow status overlay.
 */
export const CreateProjectProgressOverlay: React.FC<
    CreateProjectProgressOverlayProps
> = ({
    phase,
    editorInstalled,
    editNow,
    labels,
    installProgress,
    className,
}) => {
    const [reserveInstallProgress] = useState(() => !editorInstalled);
    const lastInstallProgress = useRef(installProgress);
    useEffect(() => {
        if (installProgress) lastInstallProgress.current = installProgress;
    }, [installProgress]);
    const retainedProgress = installProgress ?? lastInstallProgress.current;
    const displayedProgress =
        retainedProgress && (editorInstalled || phase !== 'installing')
            ? {
                  ...retainedProgress,
                  stage: 'complete' as const,
                  percent: 100,
                  canCancel: false,
              }
            : retainedProgress;
    const steps: Array<{
        id: CreateProjectProgressStepId;
        label: string;
        state: CreateProjectProgressStepState;
    }> = [
        {
            id: 'installing',
            label: labels.installingEditor,
            state: getCreateProjectProgressStepState(
                'installing',
                phase,
                editorInstalled,
                editNow,
            ),
        },
        {
            id: 'creating',
            label: labels.creatingProject,
            state: getCreateProjectProgressStepState(
                'creating',
                phase,
                editorInstalled,
                editNow,
            ),
        },
        {
            id: 'launching',
            label: labels.launchingEditor,
            state: getCreateProjectProgressStepState(
                'launching',
                phase,
                editorInstalled,
                editNow,
            ),
        },
    ];
    const activeStep = steps.find((step) => step.state === 'active');
    const statusLabel = activeStep?.label ?? labels.title;

    return (
        <section
            className={clsx(
                'absolute inset-0 z-20 flex items-center justify-center bg-base-100/95 p-6',
                className,
            )}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-busy={phase !== 'complete'}
            data-testid="createProjectProgressOverlay"
        >
            <div className="w-full max-w-md rounded-box bg-base-100 px-5 py-4 text-base">
                <h2 className="text-lg font-semibold">{labels.title}</h2>
                <p className="sr-only">{statusLabel}</p>

                <ol className="mt-4 flex flex-col gap-4">
                    {steps.map((step) => (
                        <li
                            key={step.id}
                            className="flex items-start gap-3"
                            aria-current={
                                step.state === 'active' ? 'step' : undefined
                            }
                            data-step={step.id}
                            data-step-state={step.state}
                        >
                            <StepIcon state={step.state} />
                            <div className="min-w-0 flex-1">
                                <div
                                    className={clsx(
                                        'flex flex-wrap items-center gap-2',
                                        step.state === 'active' &&
                                            'font-semibold',
                                        (step.state === 'pending' ||
                                            step.state === 'skipped') &&
                                            'text-base-content/60',
                                    )}
                                >
                                    <span>{step.label}</span>
                                    {step.state === 'skipped' && (
                                        <span className="text-sm font-normal text-base-content/60">
                                            {labels.skipped}
                                        </span>
                                    )}
                                </div>
                                {step.id === 'installing' &&
                                    reserveInstallProgress && (
                                        <div
                                            className="mt-2 min-h-16"
                                            data-testid="createProjectInstallDetails"
                                        >
                                            {displayedProgress && (
                                                <ReleaseInstallProgressIndicator
                                                    progress={displayedProgress}
                                                />
                                            )}
                                        </div>
                                    )}
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
};

type StepIconProps = {
    state: CreateProjectProgressStepState;
};

/**
 * Renders the status icon for one workflow step.
 *
 * @param props - The step state to visualise.
 * @returns The state icon without additional accessible text.
 */
const StepIcon: React.FC<StepIconProps> = ({ state }) => {
    const iconClassName = clsx(
        'mt-0.5 flex size-6 shrink-0 items-center justify-center',
        state === 'complete' && 'text-success',
        state === 'active' && 'text-primary',
        (state === 'pending' || state === 'skipped') && 'text-base-content/60',
    );

    return (
        <span className={iconClassName} aria-hidden="true">
            {state === 'complete' && <Check size={16} />}
            {state === 'active' && (
                <LoaderCircle className="animate-spin" size={16} />
            )}
            {state === 'pending' && <Circle size={9} fill="currentColor" />}
            {state === 'skipped' && <Minus size={16} />}
        </span>
    );
};
