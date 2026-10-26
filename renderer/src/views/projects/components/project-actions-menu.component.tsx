import type { ProjectDetails, ProjectRunReadiness } from '@shared/contracts';
import {
    CircleCheck,
    Copy,
    Download,
    Play,
    Trash2,
    Upload,
} from 'lucide-react';
import type React from 'react';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    type ActionMenuItem,
} from '../../../components/ui/action-menu.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ProjectActionsMenuProps = {
    project: ProjectDetails | null;
    anchorRect: ActionMenuAnchorRect | null;
    t: Translate;
    onClose: () => void;
    onDuplicateProject?: (project: ProjectDetails) => void;
    onExportEditorSettings: (project: ProjectDetails) => void;
    onImportEditorSettings: (project: ProjectDetails) => void;
    onRemoveProject: (project: ProjectDetails) => void;
    onClearNewStatus: (project: ProjectDetails) => void;
    runReadiness?: ProjectRunReadiness | null;
    runStarting?: boolean;
    onRunProject?: (project: ProjectDetails) => void;
};

const iconClassName = 'size-[16px]';

/** Renders the available management actions for the selected project's current status.
 * @param props - Selected project, anchor, translated labels and action callbacks.
 */
export const ProjectActionsMenu: React.FC<ProjectActionsMenuProps> = ({
    project,
    anchorRect,
    t,
    onClose,
    onDuplicateProject,
    onExportEditorSettings,
    onImportEditorSettings,
    onRemoveProject,
    onClearNewStatus,
    runReadiness,
    runStarting = false,
    onRunProject,
}) => {
    const runStatus = runStarting
        ? 'starting'
        : (runReadiness?.status ?? 'checking');
    const runEnabled = runStatus === 'ready';
    const items: ActionMenuItem[] = project
        ? [
              {
                  key: 'run-project',
                  label: t('runProject.label'),
                  description: runEnabled
                      ? undefined
                      : t(`runProject.reasons.${runStatus}`),
                  icon: runStarting ? (
                      <span className="loading loading-spinner loading-xs" />
                  ) : (
                      <Play className={iconClassName} />
                  ),
                  disabled: !runEnabled,
                  onSelect: () => onRunProject?.(project),
              },
              { type: 'separator', key: 'run-separator' },
              ...(project.is_new === true && !project.last_opened
                  ? [
                        {
                            key: 'clear-new-status',
                            label: t('newStatus.markAsNotNew'),
                            icon: <CircleCheck className={iconClassName} />,
                            onSelect: () => onClearNewStatus(project),
                        },
                        {
                            type: 'separator' as const,
                            key: 'new-status-separator',
                        },
                    ]
                  : []),
              {
                  key: 'duplicate-project',
                  label: t('project.duplicate', { ns: 'menus' }),
                  icon: <Copy className={iconClassName} />,
                  onSelect: () => onDuplicateProject?.(project),
              },
              {
                  type: 'separator',
                  key: 'duplicate-separator',
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
