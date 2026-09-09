import { type PropsWithChildren, type ReactNode, useId } from 'react';

type SettingsSectionProps = PropsWithChildren<{
    title: ReactNode;
    description: string;
    titleTestId?: string;
    descriptionTestId?: string;
}>;

/**
 * Groups a settings heading, description and controls with shared spacing.
 * @param props - Section copy, controls and optional test identifiers.
 * @returns A labelled settings section.
 */
export function SettingsSection({
    title,
    description,
    titleTestId,
    descriptionTestId,
    children,
}: SettingsSectionProps) {
    const headingId = useId();

    return (
        <section
            aria-labelledby={headingId}
            className="flex min-w-0 flex-col gap-[12px] text-base"
        >
            <div className="flex flex-col gap-[4px]">
                <h2
                    id={headingId}
                    data-testid={titleTestId}
                    className="font-semibold"
                >
                    {title}
                </h2>
                <p
                    data-testid={descriptionTestId}
                    className="text-base-content/75"
                >
                    {description}
                </p>
            </div>
            {children}
        </section>
    );
}
