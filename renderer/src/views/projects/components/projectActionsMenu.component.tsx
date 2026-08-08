import type { ProjectDetails } from '@shared/contracts';
import { Download, Trash2, Upload } from 'lucide-react';
import type React from 'react';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    type ActionMenuItem,
} from '../../../components/ui/actionMenu.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ProjectActionsMenuProps = {
    project: ProjectDetails | null;
    anchorRect: ActionMenuAnchorRect | null;
    t: Translate;
    onClose: () => void;
    onExportEditorSettings: (project: ProjectDetails) => void;
    onImportEditorSettings: (project: ProjectDetails) => void;
    onRemoveProject: (project: ProjectDetails) => void;
};

const iconClassName = 'h-4 w-4';

export const ProjectActionsMenu: React.FC<ProjectActionsMenuProps> = ({
    project,
    anchorRect,
    t,
    onClose,
    onExportEditorSettings,
    onImportEditorSettings,
    onRemoveProject,
}) => {
    const items: ActionMenuItem[] = project
        ? [
              {
                  key: 'export-editor-settings',
                  label: t('project.exportEditorSettings', { ns: 'menus' }),
                  icon: <Upload className={iconClassName} />,
                  disabled: project.editor_settings_path.length === 0,
                  onSelect: () => onExportEditorSettings(project),
              },
              {
                  key: 'import-editor-settings',
                  label: t('project.importEditorSettings', { ns: 'menus' }),
                  icon: <Download className={iconClassName} />,
                  disabled:
                      project.editor_settings_path.length === 0 &&
                      project.launch_path.length === 0,
                  onSelect: () => onImportEditorSettings(project),
              },
              {
                  type: 'separator',
                  key: 'remove-separator',
              },
              {
                  key: 'remove-project',
                  label: t('project.removeFromList', { ns: 'menus' }),
                  icon: <Trash2 className={iconClassName} />,
                  destructive: true,
                  onSelect: () => onRemoveProject(project),
              },
          ]
        : [];

    return (
        <ActionMenu
            open={Boolean(project)}
            anchorRect={anchorRect}
            ariaLabel={project?.name ?? t('title')}
            title={project?.name}
            items={items}
            onClose={onClose}
        />
    );
};
