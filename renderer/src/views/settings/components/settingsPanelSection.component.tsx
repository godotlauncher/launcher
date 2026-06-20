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
        className={clsx('flex flex-col h-0 gap-4', className, {
            hidden: !active,
        })}
    >
        {children}
    </div>
);
