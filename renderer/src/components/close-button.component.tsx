import clsx from 'clsx';
import { X } from 'lucide-react';
import type React from 'react';
import type { ComponentProps } from 'react';

type CloseButtonProps = ComponentProps<'button'>;

export const CloseButton: React.FC<CloseButtonProps> = ({
    key,
    onClick = () => {},
    className = '',
}) => {
    return (
        <button
            type="button"
            key={key}
            onClick={onClick}
            className={clsx('btn btn-ghost btn-square', className)}
        >
            <X />
        </button>
    );
};
