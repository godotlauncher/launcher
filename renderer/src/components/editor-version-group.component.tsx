import type React from 'react';
import { useId } from 'react';

type EditorVersionGroupProps = {
    title: string;
    count: number;
    headingLevel: 'h2' | 'h3';
    children: React.ReactNode;
};

/**
 * Renders one sticky editor version heading and its items.
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
    const Heading = headingLevel;

    return (
        <section
            aria-labelledby={headingId}
            className="flex flex-col gap-1 pb-3"
        >
            <div className="sticky top-0 z-10 flex items-center gap-3 bg-base-100/95 px-1 py-2 backdrop-blur-sm">
                <Heading
                    id={headingId}
                    className="text-sm font-semibold tracking-wide text-base-content/80"
                >
                    {title}
                </Heading>
                <span className="text-xs tabular-nums text-base-content/45">
                    {count}
                </span>
                <div
                    className="h-px flex-1 bg-base-content/20"
                    aria-hidden="true"
                />
            </div>
            <div className="flex flex-col gap-1">{children}</div>
        </section>
    );
};
