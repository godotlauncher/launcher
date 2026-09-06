import type { ReleaseSummary } from '@shared/contracts';
import {
    Download,
    EllipsisVertical,
    FolderOpen,
    Pin,
    Settings,
} from 'lucide-react';
import { Tooltip } from '../../../components/ui/tooltip.component';
import type { ProjectListItemProps } from './project-list.types';

type ProjectActionsProps = Pick<
    ProjectListItemProps,
    | 'project'
    | 'reorderHandle'
    | 'onInstallRequiredProjectEditor'
    | 'onTogglePinned'
    | 'onProjectFoldersOptions'
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
    reorderHandle,
    onInstallRequiredProjectEditor,
    onTogglePinned,
    onProjectFoldersOptions,
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
            className={`flex shrink-0 items-center gap-2 ${compact ? 'self-end' : 'self-start'}`}
        >
            {reorderHandle}
            {downloadableProjectEditor && !releaseInstalled && (
                <Tooltip placement="top" tip={t('card.installRequiredEditor')}>
                    <button
                        type="button"
                        data-testid="btnInstallRequiredProjectEditor"
                        disabled={editorDownloading}
                        className="btn btn-ghost btn-square h-7 min-h-7 w-7 border border-warning/60 bg-base-100/20 text-warning"
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
                            <Download size={15} />
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
                    className={`btn btn-ghost btn-square h-7 min-h-7 w-7 border bg-base-100/20 ${project.pinned ? 'border-primary/50 text-primary' : 'border-base-300'}`}
                    aria-label={t(
                        project.pinned
                            ? 'project.unpinProject'
                            : 'project.pinProject',
                        { ns: 'menus' },
                    )}
                    onClick={() => onTogglePinned(project)}
                >
                    <Pin size={16} />
                </button>
            </Tooltip>
            <Tooltip placement="top" tip={t('card.openFolders')}>
                <button
                    type="button"
                    data-testid="btnProjectFolders"
                    className="btn btn-ghost btn-square h-7 min-h-7 w-7 border border-base-300 bg-base-100/20"
                    aria-label={t('card.openFolders')}
                    onClick={(event) => onProjectFoldersOptions(event, project)}
                >
                    <FolderOpen size={16} />
                </button>
            </Tooltip>
            <Tooltip placement="top" tip={t('card.projectSettings')}>
                <button
                    type="button"
                    data-testid="btnProjectSettings"
                    className="btn btn-ghost btn-square h-7 min-h-7 w-7 border border-base-300 bg-base-100/20"
                    aria-label={t('card.projectSettings')}
                    onClick={() => onProjectSettings(project)}
                >
                    <Settings size={16} />
                </button>
            </Tooltip>
            <button
                type="button"
                data-testid="btnProjectMoreOptions"
                onClick={(event) => onProjectMoreOptions(event, project)}
                className="btn btn-ghost btn-square h-7 min-h-7 w-7 border border-base-300 bg-base-100/20"
                aria-label={t('table.moreOptions', {
                    project: project.name,
                })}
            >
                <EllipsisVertical size={17} />
            </button>
        </div>
    );
}
