import type { ProjectTag } from '@shared/contracts';
import { useTranslation } from 'react-i18next';
import { projectTagColours } from './project-tag.model';

/** Displays tag names with their preset colours in a wrapping list.
 * @param props - Tags to display in the tooltip.
 */
export function ProjectTagPills({ tags }: { tags: ProjectTag[] }) {
    const { t } = useTranslation('projects');
    return (
        <div className="flex w-64 max-w-full flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-base-content/60">
                <span>{t('tags.label')}</span>
                <span className="tabular-nums">{tags.length}</span>
            </div>
            <ul className="flex max-w-full flex-wrap gap-1.5 text-sm">
                {tags.map((tag) => (
                    <li
                        key={tag.id}
                        className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-base-content"
                        style={{
                            backgroundColor: `color-mix(in srgb, ${projectTagColours[tag.colour]} 12%, transparent)`,
                        }}
                    >
                        <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-full"
                            style={{
                                backgroundColor: projectTagColours[tag.colour],
                            }}
                        />
                        <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere] text-left">
                            {tag.name}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
