import type { ReactNode } from 'react';

type ListGroupHeadingProps = {
    id: string;
    title: string;
    count: number;
    headingLevel: 'h2' | 'h3';
    icon?: ReactNode;
};

/**
 * Renders a sticky, subdued list heading with a count and separator.
 * @param props - Heading identity, title, count, semantic level and optional decorative icon.
 */
export function ListGroupHeading({
    id,
    title,
    count,
    headingLevel: Heading,
    icon,
}: ListGroupHeadingProps) {
    return (
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-base-100 pl-3 pr-1 py-2">
            <Heading
                id={id}
                className="inline-flex items-center gap-2 text-base font-semibold text-base-content/50"
            >
                {icon && (
                    <span
                        className="inline-flex shrink-0 text-base-content/35"
                        aria-hidden="true"
                    >
                        {icon}
                    </span>
                )}
                {title}
            </Heading>
            <span className="text-sm tabular-nums text-base-content/40">
                {count}
            </span>
            <div className="h-px flex-1 bg-base-content/3" aria-hidden="true" />
        </div>
    );
}
