import type { ProjectDetails } from '@shared/contracts';
import { FolderCog, FolderOpen } from 'lucide-react';
import type React from 'react';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    type ActionMenuItem,
} from '../../../components/ui/actionMenu.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ProjectFoldersMenuProps = {
    project: ProjectDetails | null;
    anchorRect: ActionMenuAnchorRect | null;
    t: Translate;
    onClose: () => void;
    onOpenProjectFolder: (project: ProjectDetails) => void;
    onOpenEditorSettingsFolder: (project: ProjectDetails) => void;
};

const iconClassName = 'h-4 w-4';

export const ProjectFoldersMenu: React.FC<ProjectFoldersMenuProps> = ({
    project,
    anchorRect,
    t,
    onClose,
    onOpenProjectFolder,
    onOpenEditorSettingsFolder,
}) => {
    const items: ActionMenuItem[] = project
        ? [
              {
                  key: 'open-project-folder',
                  label: t('project.openProjectFolder', { ns: 'menus' }),
                  icon: <FolderOpen className={iconClassName} />,
                  disabled: project.path.length === 0,
                  onSelect: () => onOpenProjectFolder(project),
              },
              {
                  key: 'open-editor-settings-folder',
                  label: t('project.openEditorSettingsFolder', {
                      ns: 'menus',
                  }),
                  icon: <FolderCog className={iconClassName} />,
                  disabled: project.editor_settings_path.length === 0,
                  onSelect: () => onOpenEditorSettingsFolder(project),
              },
          ]
        : [];

    return (
        <ActionMenu
            open={Boolean(project)}
            anchorRect={anchorRect}
            ariaLabel={t('card.openFolders')}
            items={items}
            onClose={onClose}
            className="min-w-64"
        />
    );
};
