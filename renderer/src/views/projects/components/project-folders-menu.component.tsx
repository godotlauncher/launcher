import type { ProjectDetails } from '@shared/contracts';
import { ExternalLink, FolderCog, FolderOpen } from 'lucide-react';
import type React from 'react';
import githubInvertocatBlack from '../../../assets/icons/github-invertocat-black.svg';
import githubInvertocatWhite from '../../../assets/icons/github-invertocat-white.svg';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    type ActionMenuItem,
} from '../../../components/ui/action-menu.component';
import { useTheme } from '../../../hooks/theme.hook';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ProjectFoldersMenuProps = {
    project: ProjectDetails | null;
    anchorRect: ActionMenuAnchorRect | null;
    githubUrl: string | null;
    t: Translate;
    onClose: () => void;
    onOpenProjectFolder: (project: ProjectDetails) => void;
    onOpenEditorSettingsFolder: (project: ProjectDetails) => void;
    onOpenGitHub: (url: string) => void;
};

const iconClassName = 'size-[16px]';

/** Renders local folder actions and an optional cached GitHub destination. */
export const ProjectFoldersMenu: React.FC<ProjectFoldersMenuProps> = ({
    project,
    anchorRect,
    githubUrl,
    t,
    onClose,
    onOpenProjectFolder,
    onOpenEditorSettingsFolder,
    onOpenGitHub,
}) => {
    const { theme, systemTheme } = useTheme();
    const effectiveTheme = (theme ?? 'auto') === 'auto' ? systemTheme : theme;
    const githubIconSrc =
        effectiveTheme === 'dark'
            ? githubInvertocatWhite
            : githubInvertocatBlack;
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
              ...(githubUrl
                  ? [
                        {
                            type: 'separator' as const,
                            key: 'github-separator',
                        },
                        {
                            key: 'open-in-github',
                            label: t('project.openInGitHub', { ns: 'menus' }),
                            trailingIcon: (
                                <ExternalLink
                                    size={16}
                                    className="shrink-0 opacity-50"
                                    aria-hidden="true"
                                />
                            ),
                            icon: (
                                <img
                                    src={githubIconSrc}
                                    className="size-5"
                                    alt=""
                                    aria-hidden="true"
                                    data-testid="githubProjectLinkIcon"
                                />
                            ),
                            onSelect: () => onOpenGitHub(githubUrl),
                        },
                    ]
                  : []),
          ]
        : [];

    return (
        <ActionMenu
            open={Boolean(project)}
            anchorRect={anchorRect}
            ariaLabel={t('card.openFolders')}
            items={items}
            onClose={onClose}
        />
    );
};
