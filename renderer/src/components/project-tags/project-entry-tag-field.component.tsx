import type { ProjectTagSelection } from '@shared/contracts';
import { useProjectTags } from '../../hooks/project-tags.hook';
import { ProjectTagPopover } from './project-tag-popover.component';

type Props = {
    selection: ProjectTagSelection[];
    onChange: (selection: ProjectTagSelection[]) => void;
    disabled?: boolean;
};

/** Stages tags with the compact project-list icon and colour indicators.
 * @param props - Form-owned choices and registration eligibility.
 */
export function ProjectEntryTagField({ selection, onChange, disabled }: Props) {
    const { snapshot, loadFailed, reload } = useProjectTags();
    return (
        <ProjectTagPopover
            variant="row"
            tags={snapshot?.tags ?? []}
            selection={selection}
            onChange={onChange}
            disabled={disabled}
            loading={!snapshot}
            loadFailed={loadFailed}
            onRetry={reload}
        />
    );
}
