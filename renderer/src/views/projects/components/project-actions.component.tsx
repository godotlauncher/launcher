import type { ReleaseSummary } from '@shared/contracts';
import {
    Download,
    EllipsisVertical,
    FolderOpen,
    Pin,
    Settings,
    Terminal,
} from 'lucide-react';
import { Tooltip } from '../../../components/ui/tooltip.component';
import type { ProjectListItemProps } from './project-list.types';

type ProjectActionsProps = Pick<
    ProjectListItemProps,
    | 'project'
    | 'onInstallRequiredProjectEditor'
    | 'onTogglePinned'
    | 'onProjectFoldersOptions'
    | 'onOpenTerminal'
    | 'onProjectSettings'
    | 'onProjectMoreOptions'
    | 't'
> & {
    compact: boolean;
    downloadableProjectEditor?: ReleaseSummary;
    releaseInstalled: boolean;
    editorDownloading: boolean;
};

/**
 * Renders the shared project action controls.
 * @param props - Project presentation data and existing action callbacks.
 */
export function ProjectActions({
    project,
    onInstallRequiredProjectEditor,
    onTogglePinned,
    onProjectFoldersOptions,
    onOpenTerminal,
    onProjectSettings,
    onProjectMoreOptions,
    t,
    compact,
    downloadableProjectEditor,
    releaseInstalled,
    editorDownloading,
}: ProjectActionsProps) {
    return (
        <div
            className={`flex min-h-10 shrink-0 items-center gap-2 ${compact ? 'self-end' : 'self-start'}`}
        >
            {downloadableProjectEditor && !releaseInstalled && (
                <Tooltip placement="top" tip={t('card.installRequiredEditor')}>
                    <button
                        type="button"
                        data-testid="btnInstallRequiredProjectEditor"
                        disabled={editorDownloading}
                        className="btn btn-sm btn-ghost btn-square text-primary"
                        aria-label={t('card.installRequiredEditor')}
                        onClick={() =>
                            onInstallRequiredProjectEditor(
                                project,
                                downloadableProjectEditor,
                            )
                        }
                    >
                        {editorDownloading ? (
                            <span className="loading loading-spinner loading-xs" />
                        ) : (
                            <Download size={16} aria-hidden="true" />
                        )}
                    </button>
                </Tooltip>
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
            <Tooltip
                placement="top"
                tip={t('project.openTerminal', { ns: 'menus' })}
            >
                <button
                    type="button"
                    data-testid="btnProjectTerminal"
                    className="btn btn-sm btn-ghost btn-square"
                    aria-label={t('project.openTerminal', { ns: 'menus' })}
                    disabled={project.path.length === 0}
                    onClick={() => onOpenTerminal(project)}
                >
                    <Terminal size={16} aria-hidden="true" />
                </button>
            </Tooltip>
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
