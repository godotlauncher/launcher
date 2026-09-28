import type { ProjectTag } from '@shared/contracts';
import { Tooltip } from '../ui/tooltip.component';
import { projectTagColours } from './project-tag.model';
import { ProjectTagPills } from './project-tag-pills.component';

type ProjectTagIndicatorsProps = {
    tags: ProjectTag[];
    label: string;
    onEdit: () => void;
};

/** Shows compact tag colours with tag pills on hover and keyboard focus.
 * @param props - Assigned tags, accessible label and editing action.
 */
export function ProjectTagIndicators({
    tags,
    label,
    onEdit,
}: ProjectTagIndicatorsProps) {
    if (tags.length === 0) return null;
    const names = tags.map((tag) => tag.name).join(', ');
    return (
        <Tooltip
            tip={<ProjectTagPills tags={tags} />}
            placement="top"
            className="shrink-0"
        >
            <button
                type="button"
                data-testid="btnProjectTags"
                aria-label={`${label}: ${names}`}
                onClick={onEdit}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 hover:bg-base-content/10 focus-visible:outline-2 focus-visible:outline-primary"
            >
                {tags.slice(0, 3).map((tag) => (
                    <span
                        key={tag.id}
                        aria-hidden="true"
                        data-testid="projectTagDot"
                        className="size-2.5 rounded-full border border-base-content/20"
                        style={{
                            backgroundColor: projectTagColours[tag.colour],
                        }}
                    />
                ))}
                {tags.length > 3 && (
                    <span
                        aria-hidden="true"
                        className="ml-0.5 text-xs text-base-content/70"
                    >
                        +{tags.length - 3}
                    </span>
                )}
            </button>
        </Tooltip>
    );
}
