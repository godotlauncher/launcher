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
        <aside className="flex w-60 shrink-0 flex-col border-r border-base-300 bg-base-200/45 px-7 py-10">
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
                                            'flex size-9 items-center justify-center rounded-full border text-sm font-semibold',
                                            complete || active
                                                ? 'border-primary bg-primary text-primary-content'
                                                : 'border-base-content/25 bg-base-100 text-base-content/70',
                                        )}
                                        aria-hidden="true"
                                    >
                                        {complete ? (
                                            <Check
                                                size={18}
                                                strokeWidth={2.5}
                                            />
                                        ) : (
                                            index + 1
                                        )}
                                    </span>
                                    {index < onboardingStepIds.length - 1 && (
                                        <span
                                            className={clsx(
                                                'my-2 h-12 w-px',
                                                complete
                                                    ? 'bg-primary'
                                                    : 'bg-base-content/20',
                                            )}
                                            aria-hidden="true"
                                        />
                                    )}
                                </div>
                                <span
                                    className={clsx(
                                        'pt-2 text-base',
                                        active
                                            ? 'font-bold text-base-content'
                                            : 'text-base-content/75',
                                    )}
                                >
                                    {labels[step]}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            </nav>

            <p className="mt-auto text-sm leading-relaxed text-base-content/60">
                {reassurance}
            </p>
        </aside>
    );
};
