import type { ProjectDetails } from '@shared/contracts';
import { Check, Copy, ExternalLink, FolderCog, FolderOpen } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
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
    showCopyProjectPath?: boolean;
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
    showCopyProjectPath = false,
    t,
    onClose,
    onOpenProjectFolder,
    onOpenEditorSettingsFolder,
    onOpenGitHub,
}) => {
    const [copyFeedback, setCopyFeedback] = useState<{
        path: string;
        status: 'copied' | 'error';
    } | null>(null);
    const copyAttemptRef = useRef(0);
    const copyStatus =
        copyFeedback && copyFeedback.path === project?.path
            ? copyFeedback.status
            : 'idle';

    // biome-ignore lint/correctness/useExhaustiveDependencies: A different project invalidates the previous clipboard result.
    useEffect(() => {
        copyAttemptRef.current += 1;
        setCopyFeedback(null);
    }, [project?.path]);

    useEffect(() => {
        if (!copyFeedback) return;
        const timeoutId = window.setTimeout(() => setCopyFeedback(null), 1600);
        return () => window.clearTimeout(timeoutId);
    }, [copyFeedback]);

    /** Dismisses the menu and invalidates any pending clipboard result. */
    const handleClose = () => {
        copyAttemptRef.current += 1;
        setCopyFeedback(null);
        onClose();
    };

    /** Copies a project path and reports the clipboard result in the open menu.
     * @param path - The path of the selected project.
     */
    const copyProjectPath = async (path: string) => {
        const attempt = ++copyAttemptRef.current;
        try {
            await window.navigator.clipboard.writeText(path);
            if (attempt === copyAttemptRef.current) {
                setCopyFeedback({ path, status: 'copied' });
            }
        } catch {
            if (attempt === copyAttemptRef.current) {
                setCopyFeedback({ path, status: 'error' });
            }
        }
    };

    const { theme, systemTheme } = useTheme();
    const effectiveTheme = (theme ?? 'auto') === 'auto' ? systemTheme : theme;
    const githubIconSrc =
        effectiveTheme === 'dark'
            ? githubInvertocatWhite
            : githubInvertocatBlack;
    const items: ActionMenuItem[] = project
        ? [
              ...(showCopyProjectPath
                  ? [
                        {
                            key: 'copy-project-path',
                            label: t(
                                copyStatus === 'copied'
                                    ? 'common:success'
                                    : copyStatus === 'error'
                                      ? 'common:error'
                                      : 'menus:project.copyProjectPath',
                            ),
                            icon:
                                copyStatus === 'copied' ? (
                                    <Check
                                        className={`${iconClassName} text-success`}
                                    />
                                ) : (
                                    <Copy
                                        className={`${iconClassName} ${copyStatus === 'error' ? 'text-error' : ''}`}
                                    />
                                ),
                            testId: 'btnCopyProjectPathMenu',
                            closeOnSelect: false,
                            onSelect: () => copyProjectPath(project.path),
                        },
                        {
                            type: 'separator' as const,
                            key: 'copy-separator',
                        },
                    ]
                  : []),
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
            onClose={handleClose}
        />
    );
};
