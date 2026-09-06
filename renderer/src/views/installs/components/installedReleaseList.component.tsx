import type {
    InstalledRelease,
    ReleaseInstallProgress,
} from '@shared/contracts';
import {
    FlaskConical,
    FolderOpen,
    Trash2,
    TriangleAlert,
    UserRound,
} from 'lucide-react';
import type React from 'react';
import godotIcon from '../../../assets/icons/godot_icon_color.svg';
import { EditorVersionGroup } from '../../../components/editor-version-group.component.tsx';
import { ReleaseInstallProgressIndicator } from '../../../components/releaseInstallProgress.component';
import { Tooltip } from '../../../components/ui/tooltip.component.tsx';
import { groupEditorsByBaseVersion } from '../../../editor-version-group.model.ts';
import { useRelease } from '../../../hooks/useRelease';
import type { ReleaseAction } from '../installsView.model';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type InstalledReleaseListProps = {
    rows: InstalledRelease[];
    t: Translate;
    isReleaseActionBusy: (
        release: InstalledRelease,
        action?: ReleaseAction,
    ) => boolean;
    onRetry: (release: InstalledRelease) => void;
    onReinstall: (release: InstalledRelease) => void;
    onRemove: (release: InstalledRelease) => void;
    onOpenInstalledFolder: (release: InstalledRelease) => void;
    onStartProjectManager: (release: InstalledRelease) => void;
};

/**
 * Renders installed editors in sticky version groups.
 *
 * @param props - The installed editors and their actions.
 * @returns The grouped installed editor list.
 */
export const InstalledReleaseList: React.FC<InstalledReleaseListProps> = ({
    rows,
    t,
    isReleaseActionBusy,
    onRetry,
    onReinstall,
    onRemove,
    onOpenInstalledFolder,
    onStartProjectManager,
}) => {
    const { cancelInstall, getReleaseInstallProgress } = useRelease();
    const groups = groupEditorsByBaseVersion(rows);

    return (
        <div
            className="flex h-full min-h-0 flex-col overflow-auto pb-4"
            data-testid="installedReleaseList"
        >
            {groups.map((group) => (
                <EditorVersionGroup
                    key={group.baseVersion ?? 'other'}
                    title={group.baseVersion ?? t('groups.other')}
                    count={group.items.length}
                    headingLevel="h2"
                >
                    {group.items.map((release) => (
                        <InstalledReleaseRow
                            key={`${release.version}_${release.mono ? 'mono' : (release.flavor ?? 'standard')}`}
                            release={release}
                            progress={getReleaseInstallProgress(
                                release.version,
                                release.mono,
                            )}
                            removing={isReleaseActionBusy(release, 'remove')}
                            t={t}
                            isReleaseActionBusy={isReleaseActionBusy}
                            onRetry={onRetry}
                            onReinstall={onReinstall}
                            onRemove={onRemove}
                            onOpenInstalledFolder={onOpenInstalledFolder}
                            onStartProjectManager={onStartProjectManager}
                            onCancel={(jobId) => void cancelInstall(jobId)}
                        />
                    ))}
                </EditorVersionGroup>
            ))}
        </div>
    );
};

type InstalledReleaseRowProps = {
    release: InstalledRelease;
    progress: ReleaseInstallProgress | undefined;
    removing: boolean;
    t: Translate;
    isReleaseActionBusy: (
        release: InstalledRelease,
        action?: ReleaseAction,
    ) => boolean;
    onRetry: (release: InstalledRelease) => void;
    onReinstall: (release: InstalledRelease) => void;
    onRemove: (release: InstalledRelease) => void;
    onOpenInstalledFolder: (release: InstalledRelease) => void;
    onStartProjectManager: (release: InstalledRelease) => void;
    onCancel: (jobId: string) => void;
};

/**
 * Renders one installed editor row and its current state.
 *
 * @param props - The editor, progress, labels, and row actions.
 * @returns One borderless installed editor row.
 */
const InstalledReleaseRow: React.FC<InstalledReleaseRowProps> = ({
    release,
    progress,
    removing,
    t,
    isReleaseActionBusy,
    onRetry,
    onReinstall,
    onRemove,
    onOpenInstalledFolder,
    onStartProjectManager,
    onCancel,
}) => (
    <article
        className={`flex min-h-14 items-center gap-3 rounded-box px-3 py-2 transition-colors hover:bg-base-content/10 focus-within:bg-base-content/10 motion-reduce:transition-none ${removing ? 'pointer-events-none opacity-60' : ''}`}
        data-testid={`installedReleaseRow_${release.version}_${release.mono ? 'mono' : 'standard'}`}
        aria-busy={removing}
    >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                {release.valid === false && (
                    <TriangleAlert
                        className="size-4 shrink-0 text-warning"
                        aria-hidden="true"
                    />
                )}
                {removing && (
                    <span
                        className="loading loading-spinner loading-sm shrink-0"
                        aria-hidden="true"
                    />
                )}
                <span className="truncate text-lg font-semibold leading-tight text-base-content">
                    {release.name ?? release.version}
                </span>
                {release.source === 'custom' && (
                    <Tooltip
                        placement="top"
                        tip={t('badges.custom')}
                        tone="info"
                    >
                        <span
                            className="inline-flex size-5 shrink-0 items-center justify-center text-info"
                            role="img"
                            aria-label={t('badges.custom')}
                        >
                            <UserRound size={15} aria-hidden="true" />
                        </span>
                    </Tooltip>
                )}
                {release.prerelease && (
                    <Tooltip
                        placement="top"
                        tip={t('badges.prerelease')}
                        tone="secondary"
                    >
                        <span
                            className="inline-flex size-5 shrink-0 items-center justify-center text-secondary"
                            role="img"
                            aria-label={t('badges.prerelease')}
                        >
                            <FlaskConical size={15} aria-hidden="true" />
                        </span>
                    </Tooltip>
                )}
                {release.mono && (
                    <span className="shrink-0 text-xs font-medium text-base-content/60">
                        {t('badges.dotNet')}
                    </span>
                )}
            </div>

            {release.name && (
                <span className="text-xs text-base-content/50">
                    {release.version}
                </span>
            )}

            <div className="flex flex-col gap-1 text-xs text-base-content/50">
                {release.valid === false ? (
                    <>
                        <span>
                            {release.source === 'custom'
                                ? t('messages.unavailableCustomEditorHint')
                                : t('messages.unavailableHintWithReinstall')}
                        </span>
                        <div className="flex flex-row flex-wrap gap-2">
                            <button
                                type="button"
                                className="btn btn-xs flex items-center gap-2"
                                onClick={() => onRetry(release)}
                                disabled={isReleaseActionBusy(release)}
                            >
                                {isReleaseActionBusy(release, 'retry') && (
                                    <span className="loading loading-spinner loading-xs" />
                                )}
                                {t('buttons.retry', { ns: 'common' })}
                            </button>
                            {release.source !== 'custom' && (
                                <button
                                    type="button"
                                    data-testid={`btnReinstallRelease_${release.version}_${release.mono ? 'mono' : 'standard'}`}
                                    className="btn btn-primary btn-xs flex items-center gap-2"
                                    onClick={() => onReinstall(release)}
                                    disabled={isReleaseActionBusy(release)}
                                    aria-label={t('buttons.reinstall', {
                                        ns: 'common',
                                    })}
                                >
                                    {isReleaseActionBusy(
                                        release,
                                        'reinstall',
                                    ) && (
                                        <span className="loading loading-spinner loading-xs" />
                                    )}
                                    {t('buttons.reinstall', { ns: 'common' })}
                                </button>
                            )}
                            <button
                                type="button"
                                data-testid={`btnRemoveRelease_${release.version}_${release.mono ? 'mono' : 'standard'}`}
                                className="btn btn-error btn-xs"
                                onClick={() => onRemove(release)}
                                disabled={isReleaseActionBusy(release)}
                            >
                                {isReleaseActionBusy(release, 'remove') && (
                                    <span className="loading loading-spinner loading-xs" />
                                )}
                                {t('buttons.remove', { ns: 'common' })}
                            </button>
                        </div>
                    </>
                ) : release.install_path ? (
                    release.install_path
                ) : progress ? (
                    <ReleaseInstallProgressIndicator
                        progress={progress}
                        className="max-w-72"
                        onCancel={onCancel}
                    />
                ) : (
                    <div className="flex flex-row items-center gap-2">
                        <div className="loading loading-ring loading-sm" />
                        {t('status.installing')}
                    </div>
                )}
            </div>
        </div>

        {release.install_path && release.valid !== false && !removing && (
            <div className="flex shrink-0 self-start items-center gap-1">
                <Tooltip
                    placement="top"
                    tip={t('release.openInstalledFolder', { ns: 'menus' })}
                >
                    <button
                        type="button"
                        data-testid={`btnOpenReleaseFolder_${release.version}_${release.mono ? 'mono' : 'standard'}`}
                        onClick={() => onOpenInstalledFolder(release)}
                        className="btn btn-ghost btn-square h-7 min-h-7 w-7 border border-base-300 bg-base-100/20"
                        aria-label={t('release.openInstalledFolder', {
                            ns: 'menus',
                        })}
                    >
                        <FolderOpen size={16} aria-hidden="true" />
                    </button>
                </Tooltip>
                <Tooltip
                    placement="top"
                    tip={t('release.startProjectManager', { ns: 'menus' })}
                >
                    <button
                        type="button"
                        data-testid={`btnStartProjectManager_${release.version}_${release.mono ? 'mono' : 'standard'}`}
                        onClick={() => onStartProjectManager(release)}
                        className="btn btn-ghost btn-square h-7 min-h-7 w-7 border border-base-300 bg-base-100/20"
                        aria-label={t('release.startProjectManager', {
                            ns: 'menus',
                        })}
                    >
                        <img src={godotIcon} className="size-[18px]" alt="" />
                    </button>
                </Tooltip>
                <Tooltip
                    placement="top"
                    tip={
                        release.source === 'custom'
                            ? t('removeCustomEditor.menuLabel', {
                                  ns: 'dialogs',
                              })
                            : t('release.deleteRelease', { ns: 'menus' })
                    }
                >
                    <button
                        type="button"
                        data-testid={`btnRemoveRelease_${release.version}_${release.mono ? 'mono' : 'standard'}`}
                        onClick={() => onRemove(release)}
                        className="btn btn-ghost btn-square h-7 min-h-7 w-7 border border-base-300 bg-base-100/20 text-error hover:bg-error/10"
                        aria-label={
                            release.source === 'custom'
                                ? t('removeCustomEditor.menuLabel', {
                                      ns: 'dialogs',
                                  })
                                : t('release.deleteRelease', { ns: 'menus' })
                        }
                    >
                        <Trash2 size={16} aria-hidden="true" />
                    </button>
                </Tooltip>
            </div>
        )}
    </article>
);
