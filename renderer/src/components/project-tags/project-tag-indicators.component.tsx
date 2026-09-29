import type { ProjectTag } from '@shared/contracts';
import { Tag } from 'lucide-react';
import type { RefObject } from 'react';
import { Tooltip } from '../ui/tooltip.component';
import { projectTagColours } from './project-tag.model';
import { ProjectTagPills } from './project-tag-pills.component';

type ProjectTagIndicatorsProps = {
    tags: ProjectTag[];
    label: string;
    triggerRef: RefObject<HTMLButtonElement | null>;
    popoverId: string;
    open: boolean;
    disabled?: boolean;
};

/** Shows compact tag colours with tag pills on hover and keyboard focus.
 * @param props - Assigned tags, accessible label and editing action.
 */
export function ProjectTagIndicators({
    tags,
    label,
    triggerRef,
    popoverId,
    open,
    disabled,
}: ProjectTagIndicatorsProps) {
    const names = tags.map((tag) => tag.name).join(', ');
    return (
        <Tooltip
            variant={tags.length ? 'panel' : 'default'}
            tip={tags.length ? <ProjectTagPills tags={tags} /> : label}
            placement="top"
            className="shrink-0"
        >
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                popoverTarget={popoverId}
                aria-haspopup="dialog"
                aria-controls={popoverId}
                aria-expanded={open}
                data-testid="btnProjectTags"
                aria-label={names ? `${label}: ${names}` : label}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 hover:bg-base-content/10 focus-visible:outline-2 focus-visible:outline-primary"
            >
                <Tag
                    size={14}
                    aria-hidden="true"
                    className="mr-0.5 text-base-content/60"
                />
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
