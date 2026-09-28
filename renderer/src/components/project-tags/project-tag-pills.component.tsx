import type { ProjectTag } from '@shared/contracts';
import { projectTagColours } from './project-tag.model';

/** Displays tag names with their preset colours in a wrapping list.
 * @param props - Tags to display in the tooltip.
 */
export function ProjectTagPills({ tags }: { tags: ProjectTag[] }) {
    return (
        <ul className="flex max-w-full flex-wrap gap-1.5 text-sm">
            {tags.map((tag) => (
                <li
                    key={tag.id}
                    className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-1"
                    style={{
                        backgroundColor: `color-mix(in srgb, ${projectTagColours[tag.colour]} 20%, transparent)`,
                        borderColor: `color-mix(in srgb, ${projectTagColours[tag.colour]} 45%, transparent)`,
                    }}
                >
                    <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                            backgroundColor: projectTagColours[tag.colour],
                        }}
                    />
                    <span className="min-w-0 whitespace-normal break-words text-left">
                        {tag.name}
                    </span>
                </li>
            ))}
        </ul>
    );
}
