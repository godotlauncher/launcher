import type { ReleaseInstallProgress, ReleaseSummary } from '@shared/contracts';
import {
    ChevronDown,
    Download,
    EllipsisVertical,
    FolderOpen,
    Pin,
    Settings,
    Terminal,
    X,
} from 'lucide-react';
import { useState } from 'react';
import { CodeEditorIntegrationIcon } from '../../../components/code-editor-integration-icon.component';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../../../components/ui/action-menu.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import type { ProjectListItemProps } from './project-list.types';

type ProjectActionsProps = Pick<
    ProjectListItemProps,
    | 'project'
    | 'onInstallRequiredProjectEditor'
    | 'onCancelEditorInstall'
    | 'onTogglePinned'
    | 'onProjectFoldersOptions'
    | 'onOpenTerminal'
    | 'onOpenCodeEditor'
    | 'terminalAvailable'
    | 'onProjectSettings'
    | 'onProjectMoreOptions'
    | 't'
> & {
    codeEditorName?: string | null;
    compact: boolean;
    dense?: boolean;
    downloadableProjectEditor?: ReleaseSummary;
    releaseInstalled: boolean;
    editorDownloading: boolean;
    installProgress?: ReleaseInstallProgress;
};

/**
 * Renders the shared project action controls.
 * @param props - Project presentation, available tools and opening callbacks.
 */
export function ProjectActions({
    project,
    onInstallRequiredProjectEditor,
    onTogglePinned,
    onProjectFoldersOptions,
    onOpenTerminal,
    onOpenCodeEditor,
    codeEditorName,
    terminalAvailable,
    onProjectSettings,
    onProjectMoreOptions,
    t,
    compact,
    dense = false,
    downloadableProjectEditor,
    releaseInstalled,
    editorDownloading,
    installProgress,
    onCancelEditorInstall,
}: ProjectActionsProps) {
    const [toolsAnchor, setToolsAnchor] = useState<ActionMenuAnchorRect | null>(
        null,
    );
    const toolsLabel = t('project.openTools', {
        ns: 'menus',
        project: project.name,
    });
    const cancelLabel = t('progress.cancelLabel', { ns: 'installEditor' });
    const installLabel =
        editorDownloading && installProgress
            ? t(`progress.${installProgress.stage}`, { ns: 'installEditor' })
            : t('card.installRequiredEditor');
    const codeEditorOnly = !terminalAvailable && project.codeEditorId;
    const primaryToolLabel = codeEditorOnly
        ? t('project.openCodeEditor', {
              ns: 'menus',
              editor: codeEditorName ?? codeEditorOnly,
          })
        : t('project.openTerminal', { ns: 'menus' });
    return (
        <div
            className={`flex shrink-0 items-center ${dense ? 'min-h-8 gap-1' : 'min-h-10 gap-2'} ${compact ? 'self-end' : 'self-start'}`}
        >
            {downloadableProjectEditor && !releaseInstalled && (
                <div
                    className={
                        editorDownloading
                            ? 'flex items-center rounded-(--radius-field) bg-base-content/3'
                            : undefined
                    }
                >
                    <Tooltip placement="top" tip={installLabel}>
                        <button
                            type="button"
                            data-testid="btnInstallRequiredProjectEditor"
                            disabled={editorDownloading}
                            className="btn btn-sm btn-ghost btn-square text-warning/80 hover:text-warning hover:bg-warning/20 hover:border-transparent"
                            aria-label={installLabel}
                            onClick={() =>
                                onInstallRequiredProjectEditor(
                                    project,
                                    downloadableProjectEditor,
                                )
                            }
                        >
                            {editorDownloading ? (
                                <span
                                    role="status"
                                    aria-label={installLabel}
                                    className="loading loading-spinner loading-xs"
                                />
                            ) : (
                                <Download size={16} aria-hidden="true" />
                            )}
                        </button>
                    </Tooltip>
                    {editorDownloading && installProgress?.canCancel && (
                        <Tooltip placement="top" tip={cancelLabel}>
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost btn-square"
                                aria-label={cancelLabel}
                                onClick={() =>
                                    void onCancelEditorInstall(
                                        installProgress.id,
                                    )
                                }
                            >
                                <X size={16} aria-hidden="true" />
                            </button>
                        </Tooltip>
                    )}
                </div>
            )}
            <Tooltip
                placement="top"
                tip={t(
                    project.pinned
                        ? 'project.unpinProject'
                        : 'project.pinProject',
                    { ns: 'menus' },
                )}
            >
                <button
                    type="button"
                    data-testid="btnToggleProjectPinned"
                    className="btn btn-sm btn-ghost btn-square"
                    aria-pressed={Boolean(project.pinned)}
                    aria-label={t(
                        project.pinned
                            ? 'project.unpinProject'
                            : 'project.pinProject',
                        { ns: 'menus' },
                    )}
                    onClick={() => onTogglePinned(project)}
                >
                    <Pin
                        size={16}
                        aria-hidden="true"
                        className={project.pinned ? 'text-primary' : undefined}
                    />
                </button>
            </Tooltip>
            <div className="flex items-center rounded-(--radius-field) transition-colors hover:bg-base-content/3 focus-within:bg-base-content/3">
                <Tooltip placement="top" tip={primaryToolLabel}>
                    <button
                        type="button"
                        data-testid={
                            codeEditorOnly
                                ? 'btnProjectCodeEditor'
                                : 'btnProjectTerminal'
                        }
                        className="btn btn-sm btn-ghost btn-square"
                        aria-label={primaryToolLabel}
                        disabled={project.path.length === 0}
                        onClick={() =>
                            codeEditorOnly
                                ? onOpenCodeEditor(project)
                                : onOpenTerminal(project)
                        }
                    >
                        {codeEditorOnly ? (
                            <CodeEditorIntegrationIcon
                                integrationId={codeEditorOnly}
                                className="size-4"
                            />
                        ) : (
                            <Terminal size={16} aria-hidden="true" />
                        )}
                    </button>
                </Tooltip>
                {terminalAvailable && project.codeEditorId && (
                    <>
                        <button
                            type="button"
                            data-testid="btnProjectOpenTools"
                            className="btn btn-sm btn-ghost w-5 px-0"
                            aria-label={toolsLabel}
                            aria-haspopup="dialog"
                            aria-expanded={toolsAnchor !== null}
                            disabled={!project.path}
                            onClick={(event) => {
                                event.stopPropagation();
                                setToolsAnchor(
                                    toolsAnchor
                                        ? null
                                        : getActionMenuAnchorRect(
                                              event.currentTarget,
                                          ),
                                );
                            }}
                        >
                            <ChevronDown size={12} aria-hidden="true" />
                        </button>
                        <ActionMenu
                            open={toolsAnchor !== null}
                            anchorRect={toolsAnchor}
                            ariaLabel={toolsLabel}
                            onClose={() => setToolsAnchor(null)}
                            items={[
                                {
                                    key: 'terminal',
                                    label: t('project.openTerminal', {
                                        ns: 'menus',
                                    }),
                                    icon: (
                                        <Terminal
                                            size={16}
                                            aria-hidden="true"
                                        />
                                    ),
                                    onSelect: () => onOpenTerminal(project),
                                },
                                {
                                    key: 'code-editor',
                                    label: t('project.openCodeEditor', {
                                        ns: 'menus',
                                        editor:
                                            codeEditorName ??
                                            project.codeEditorId,
                                    }),
                                    icon: (
                                        <CodeEditorIntegrationIcon
                                            integrationId={project.codeEditorId}
                                            className="size-4"
                                        />
                                    ),
                                    onSelect: () => onOpenCodeEditor(project),
                                },
                            ]}
                        />
                    </>
                )}
            </div>
            <Tooltip placement="top" tip={t('card.openFolders')}>
                <button
                    type="button"
                    data-testid="btnProjectFolders"
                    className="btn btn-sm btn-ghost btn-square"
                    aria-label={t('card.openFolders')}
                    onClick={(event) => onProjectFoldersOptions(event, project)}
                >
                    <FolderOpen size={16} aria-hidden="true" />
                </button>
            </Tooltip>
            <Tooltip placement="top" tip={t('card.projectSettings')}>
                <button
                    type="button"
                    data-testid="btnProjectSettings"
                    className="btn btn-sm btn-ghost btn-square"
                    aria-label={t('card.projectSettings')}
                    onClick={() => onProjectSettings(project)}
                >
                    <Settings size={16} aria-hidden="true" />
                </button>
            </Tooltip>
            <Tooltip
                placement="top"
                tip={t('table.moreOptions', { project: project.name })}
            >
                <button
                    type="button"
                    data-testid="btnProjectMoreOptions"
                    data-project-actions={project.path}
                    onClick={(event) => onProjectMoreOptions(event, project)}
                    className="btn btn-sm btn-ghost btn-square"
                    aria-label={t('table.moreOptions', {
                        project: project.name,
                    })}
                >
                    <EllipsisVertical size={16} aria-hidden="true" />
                </button>
            </Tooltip>
        </div>
    );
}
