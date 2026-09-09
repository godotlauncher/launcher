import clsx from 'clsx';
import { Check } from 'lucide-react';
import type React from 'react';
import type { OnboardingStepId } from './onboarding.model';
import { onboardingStepIds } from './onboarding.model';

type OnboardingProgressProps = {
    currentStep: OnboardingStepId;
    labels: Record<OnboardingStepId, string>;
    progressLabel: string;
    reassurance: string;
};

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
    currentStep,
    labels,
    progressLabel,
    reassurance,
}) => {
    const currentIndex = onboardingStepIds.indexOf(currentStep);

    return (
        <aside className="flex w-60 shrink-0 flex-col bg-base-200/45 px-7 py-10">
            <nav aria-label={progressLabel}>
                <ol className="flex flex-col">
                    {onboardingStepIds.map((step, index) => {
                        const complete = index < currentIndex;
                        const active = step === currentStep;

                        return (
                            <li
                                key={step}
                                className="grid grid-cols-[2.5rem_1fr] gap-x-3"
                                aria-current={active ? 'step' : undefined}
                            >
                                <div className="flex flex-col items-center">
                                    <span
                                        className={clsx(
                                            'badge size-9 justify-center text-base',
                                            complete
                                                ? 'badge-success badge-soft text-success-content dark:text-success'
                                                : active
                                                  ? 'badge-primary'
                                                  : 'badge-ghost',
                                        )}
                                        aria-hidden="true"
                                    >
                                        {complete ? (
                                            <Check size={16} />
                                        ) : (
                                            index + 1
                                        )}
                                    </span>
                                    {index < onboardingStepIds.length - 1 && (
                                        <span
                                            className="my-2 h-12 w-px bg-base-content/10"
                                            aria-hidden="true"
                                        />
                                    )}
                                </div>
                                <span className="pt-2">{labels[step]}</span>
                            </li>
                        );
                    })}
                </ol>
            </nav>

            <p className="mt-auto text-sm text-base-content/60">
                {reassurance}
            </p>
        </aside>
    );
};
