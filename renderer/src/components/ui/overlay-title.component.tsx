import clsx from 'clsx';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';

type OverlayTitleProps = Omit<ComponentPropsWithoutRef<'h2'>, 'tabIndex'> & {
    as?: 'h1' | 'h2' | 'h3';
};

/**
 * Provides a programmatic focus target without a tab stop or focus outline.
 * @param props - Heading level, content and presentation.
 * @param ref - Reference used to focus the overlay heading.
 */
export const OverlayTitle = forwardRef<HTMLHeadingElement, OverlayTitleProps>(
    function OverlayTitle({ as: Heading = 'h2', className, ...props }, ref) {
        return (
            <Heading
                {...props}
                ref={ref}
                tabIndex={-1}
                className={clsx(
                    className,
                    'outline-none focus:outline-none focus-visible:outline-none',
                )}
            />
        );
    },
);
