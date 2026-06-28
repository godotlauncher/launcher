import type { ProjectDetails } from '@shared';
import { Download, FolderOpen, PanelTop, Trash2, Upload } from 'lucide-react';
import type React from 'react';
import gitIconColor from '../../../assets/icons/git_icon_color.svg';
import vscodeIcon from '../../../assets/icons/vscode.svg';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    type ActionMenuItem,
} from '../../../components/ui/actionMenu.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ProjectActionsMenuProps = {
    project: ProjectDetails | null;
    anchorRect: ActionMenuAnchorRect | null;
    hasVSCode: boolean;
    hasGit: boolean;
    t: Translate;
    onClose: () => void;
    onOpenProjectFolder: (project: ProjectDetails) => void;
    onOpenEditorSettingsFolder: (project: ProjectDetails) => void;
    onToggleWindowed: (project: ProjectDetails) => void;
    onToggleVSCode: (project: ProjectDetails) => void;
    onInitializeGit: (project: ProjectDetails) => void;
    onExportEditorSettings: (project: ProjectDetails) => void;
    onImportEditorSettings: (project: ProjectDetails) => void;
    onRemoveProject: (project: ProjectDetails) => void;
};

const iconClassName = 'h-4 w-4';

export const ProjectActionsMenu: React.FC<ProjectActionsMenuProps> = ({
    project,
    anchorRect,
    hasVSCode,
    hasGit,
    t,
    onClose,
    onOpenProjectFolder,
    onOpenEditorSettingsFolder,
    onToggleWindowed,
    onToggleVSCode,
    onInitializeGit,
    onExportEditorSettings,
    onImportEditorSettings,
    onRemoveProject,
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
                  icon: <FolderOpen className={iconClassName} />,
                  disabled: project.editor_settings_path.length === 0,
                  onSelect: () => onOpenEditorSettingsFolder(project),
              },
              {
                  type: 'separator',
                  key: 'launch-options-separator',
              },
              {
                  key: 'open-windowed',
                  label: t('project.openWindowed', { ns: 'menus' }),
                  icon: <PanelTop className={iconClassName} />,
                  checked: Boolean(project.open_windowed),
                  onSelect: () => onToggleWindowed(project),
              },
              {
                  key: 'use-vscode',
                  label: t('project.useVSCode', { ns: 'menus' }),
                  icon: (
                      <img src={vscodeIcon} className={iconClassName} alt="" />
                  ),
                  checked: project.withVSCode,
                  disabled: !project.valid || !hasVSCode,
                  onSelect: () => onToggleVSCode(project),
              },
              ...(project.valid && hasGit && !project.withGit
                  ? [
                        {
                            key: 'initialize-git',
                            label: t('project.initGit', { ns: 'menus' }),
                            icon: (
                                <img
                                    src={gitIconColor}
                                    className={iconClassName}
                                    alt=""
                                />
                            ),
                            onSelect: () => onInitializeGit(project),
                        } satisfies ActionMenuItem,
                    ]
                  : []),
              {
                  type: 'separator',
                  key: 'settings-separator',
              },
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
