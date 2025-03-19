import React, { ComponentProps } from 'react';
import { IconClose } from './icons';
import clsx from 'clsx';

type CloseButtonProps = ComponentProps<'button'>;

export const CloseButton: React.FC<CloseButtonProps> = ({ key, onClick = () => { }, className = '' }) => {
    return (
        <button key={key} onClick={onClick} className={clsx('p-2 rounded-lg hover:bg-base-content/10', className)}><IconClose className="fill-current" /></button>
    );
};