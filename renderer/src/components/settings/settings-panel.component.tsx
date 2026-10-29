import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type SettingsPanelProps = {
    icon: LucideIcon;
    title: ReactNode;
    description: ReactNode;
    action: ReactNode;
    children?: ReactNode;
    htmlFor?: string;
    titleId?: string;
    descriptionId?: string;
    dimmed?: boolean;
};

/**
 * Groups a heading-aligned icon, description and trailing control in a settings panel.
 * Native controls retain responsibility for their disabled state and callbacks.
 * @param props - Panel content, optional label association and subdued appearance.
 */
export function SettingsPanel({
    icon: Icon,
    title,
    description,
    action,
    children,
    htmlFor,
    titleId,
    descriptionId,
    dimmed = false,
}: SettingsPanelProps) {
    const className = clsx(
        'flex min-w-0 items-start gap-3 rounded-md p-3',
        !children && 'bg-base-content/5',
        dimmed && 'opacity-50',
    );
    const content = (
        <>
            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                    id={titleId}
                    className="flex flex-wrap items-center gap-2 font-semibold"
                >
                    {title}
                </span>
                <span
                    id={descriptionId}
                    className="break-words text-base-content/75"
                >
                    {description}
                </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 pt-0.5">
                {action}
            </span>
        </>
    );
    const panel = htmlFor ? (
        <label htmlFor={htmlFor} className={className}>
            {content}
        </label>
    ) : (
        <div className={className}>{content}</div>
    );
    return children ? (
        <div className="rounded-md bg-base-content/5">
            {panel}
            <div className="px-3 pb-3 pl-11">{children}</div>
        </div>
    ) : (
        panel
    );
}
