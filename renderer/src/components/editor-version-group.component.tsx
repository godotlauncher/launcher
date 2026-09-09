import type React from 'react';
import { useId } from 'react';
import { ListGroupHeading } from './ui/list-group-heading.component';

type EditorVersionGroupProps = {
    title: string;
    count: number;
    headingLevel: 'h2' | 'h3';
    children: React.ReactNode;
};

/**
 * Renders a sticky version heading with a subdued count and separator.
 *
 * @param props - The heading, item count, heading level, and group items.
 * @returns One editor version group.
 */
export const EditorVersionGroup: React.FC<EditorVersionGroupProps> = ({
    title,
    count,
    headingLevel,
    children,
}) => {
    const headingId = useId();

    return (
        <section
            aria-labelledby={headingId}
            className="flex flex-col gap-1 pb-3"
        >
            <ListGroupHeading
                id={headingId}
                title={title}
                count={count}
                headingLevel={headingLevel}
            />
            <div className="flex flex-col gap-2">{children}</div>
        </section>
    );
};
