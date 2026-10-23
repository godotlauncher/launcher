import {
    FolderOpen,
    FolderSearch,
    GitBranch,
    GitPullRequest,
} from 'lucide-react';
import type React from 'react';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    type ActionMenuItem,
} from '../../../components/ui/action-menu.component';
import type { GitAvailability } from '../remote-project-import.model';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type AddProjectSourceMenuProps = {
    anchorRect: ActionMenuAnchorRect | null;
    gitAvailability: GitAvailability;
    t: Translate;
    onClose: () => void;
    onFromComputer: () => void;
    onScanFolder: () => void;
    onGodotProjectManager: () => void;
    onPublicGit: () => void;
    onGitHub: () => void;
};

const iconClassName = 'size-[16px]';

/** Renders the local and remote Add Project source choices.
 * @param props - Source callbacks and current Git availability.
 */
export const AddProjectSourceMenu: React.FC<AddProjectSourceMenuProps> = ({
    anchorRect,
    gitAvailability,
    t,
    onClose,
    onFromComputer,
    onScanFolder,
    onGodotProjectManager,
    onPublicGit,
    onGitHub,
}) => {
    const gitUnavailable = gitAvailability !== 'available';
    const unavailableRemoteLabel = (label: string) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
            <span>{label}</span>
            <span className="text-sm text-base-content/60">
                {t('addProject.sources.gitUnavailable')}
            </span>
        </span>
    );
    const remoteLabel = (label: string) =>
        gitAvailability === 'unavailable'
            ? unavailableRemoteLabel(label)
            : label;
    const items: ActionMenuItem[] = [
        {
            key: 'from-computer',
            label: t('addProject.sources.fromComputer'),
            icon: <FolderOpen className={iconClassName} />,
            testId: 'btnAddProjectFromComputer',
            onSelect: onFromComputer,
        },
        {
            key: 'scan-folder',
            label: t('addProject.folder.title'),
            icon: <FolderSearch className={iconClassName} />,
            testId: 'btnAddProjectScanFolder',
            onSelect: onScanFolder,
        },
        {
            key: 'godot-project-manager',
            label: t('addProject.manager.title'),
            icon: <FolderOpen className={iconClassName} />,
            testId: 'btnAddProjectGodotProjectManager',
            onSelect: onGodotProjectManager,
        },
        {
            type: 'separator',
            key: 'local-remote-divider',
        },
        {
            key: 'public-git',
            label: remoteLabel(t('addProject.sources.publicGit')),
            icon: <GitPullRequest className={iconClassName} />,
            disabled: gitUnavailable,
            testId: 'btnAddProjectPublicGit',
            onSelect: onPublicGit,
        },
        {
            key: 'github',
            label: remoteLabel(t('addProject.sources.github')),
            icon: <GitBranch className={iconClassName} />,
            disabled: gitUnavailable,
            testId: 'btnAddProjectGitHub',
            onSelect: onGitHub,
        },
    ];

    return (
        <ActionMenu
            open={Boolean(anchorRect)}
            anchorRect={anchorRect}
            ariaLabel={t('addProject.sources.title')}
            items={items}
            onClose={onClose}
        />
    );
};
