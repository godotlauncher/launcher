import type React from 'react';
import { OverlayTitle } from '../../../../components/ui/overlay-title.component';

type DuplicateProjectStepsProps = {
    step: 1 | 2;
    label: string;
    projectCopyLabel: string;
    moreOptionsLabel: string;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
};

/** Identifies the active copy step and supplies a keyboard focus target.
 * @param props - Active step, translated names and active-heading reference.
 */
export const DuplicateProjectSteps: React.FC<DuplicateProjectStepsProps> = ({
    step,
    label,
    projectCopyLabel,
    moreOptionsLabel,
    headingRef,
}) => (
    <ol aria-label={label} className="flex items-center gap-3 py-1 text-base">
        {([1, 2] as const).map((value) => (
            <li
                key={value}
                aria-current={step === value ? 'step' : undefined}
                className={`flex items-center gap-2 ${step === value ? 'text-primary' : 'text-base-content/55'}`}
            >
                {value === 2 && (
                    <span
                        aria-hidden="true"
                        className="mr-1 h-px w-6 bg-base-content/15"
                    />
                )}
                <span
                    aria-hidden="true"
                    className={`flex size-5 items-center justify-center rounded-full text-xs ${step === value ? 'bg-primary text-primary-content' : 'bg-base-content/10'}`}
                >
                    {value}
                </span>
                {step === value ? (
                    <OverlayTitle ref={headingRef} className="font-medium">
                        {value === 1 ? projectCopyLabel : moreOptionsLabel}
                    </OverlayTitle>
                ) : (
                    <span>
                        {value === 1 ? projectCopyLabel : moreOptionsLabel}
                    </span>
                )}
            </li>
        ))}
    </ol>
);
