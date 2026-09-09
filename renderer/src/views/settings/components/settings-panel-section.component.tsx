import clsx from 'clsx';
import type React from 'react';

type SettingsPanelSectionProps = React.PropsWithChildren<{
    active: boolean;
    className?: string;
}>;

export const SettingsPanelSection: React.FC<SettingsPanelSectionProps> = ({
    active,
    className,
    children,
}) => (
    <div
        className={clsx('flex min-w-0 flex-col gap-[24px]', className, {
            hidden: !active,
        })}
    >
        {children}
    </div>
);
