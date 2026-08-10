import type { LucideIcon } from 'lucide-react';
import type React from 'react';
import type { MouseEventHandler } from 'react';
import { useId } from 'react';

type EmptyStateProps = {
    icon: LucideIcon;
    heading: string;
    description: string;
    primaryActionLabel: string;
    primaryActionPending?: boolean;
    secondaryActionLabel?: string;
    onPrimaryAction?: MouseEventHandler<HTMLButtonElement>;
    onSecondaryAction?: MouseEventHandler<HTMLButtonElement>;
};

/**
 * Renders an informational empty state with one primary next step.
 *
 * @param props - The empty-state content, icon, and optional actions.
 * @returns The centered empty-state section.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon,
    heading,
    description,
    primaryActionLabel,
    primaryActionPending = false,
    secondaryActionLabel,
    onPrimaryAction,
    onSecondaryAction,
}) => {
    const headingId = useId();

    return (
        <section
            className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center pt-14 text-center"
            aria-labelledby={headingId}
            data-testid="emptyState"
        >
            <div
                className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15"
                aria-hidden="true"
            >
                <Icon className="size-8" strokeWidth={1.75} />
            </div>
            <h2
                id={headingId}
                className="mt-7 text-2xl font-semibold text-base-content"
            >
                {heading}
            </h2>
            <p className="mt-2 text-base-content/65">{description}</p>
            <div className="mt-7 flex flex-col items-center gap-4">
                <button
                    type="button"
                    className="btn btn-primary min-w-52 disabled:border-primary/20 disabled:bg-primary/15 disabled:text-primary disabled:opacity-100"
                    onClick={onPrimaryAction}
                    disabled={primaryActionPending}
                    aria-busy={primaryActionPending || undefined}
                    data-testid="btnEmptyStatePrimary"
                >
                    {primaryActionPending && (
                        <span
                            className="loading loading-spinner loading-sm"
                            aria-hidden="true"
                        />
                    )}
                    <span aria-live="polite">{primaryActionLabel}</span>
                </button>
                {secondaryActionLabel && (
                    <button
                        type="button"
                        className="btn btn-link h-auto min-h-0 px-2 py-0 font-normal no-underline hover:underline"
                        onClick={onSecondaryAction}
                        data-testid="btnEmptyStateSecondary"
                    >
                        {secondaryActionLabel}
                    </button>
                )}
            </div>
        </section>
    );
};
