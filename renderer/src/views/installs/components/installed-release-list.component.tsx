import type {
    InstalledRelease,
    ReleaseInstallProgress,
} from '@shared/contracts';
import {
    Download,
    FlaskConical,
    FolderOpen,
    RefreshCw,
    Trash2,
    TriangleAlert,
    UserRound,
} from 'lucide-react';
import type React from 'react';
import godotIcon from '../../../assets/icons/godot-icon-color.svg';
import { EditorVersionGroup } from '../../../components/editor-version-group.component.tsx';
import { ReleaseInstallProgressIndicator } from '../../../components/release-install-progress.component';
import { CopyBadge } from '../../../components/ui/copy-badge.component';
import { Tooltip } from '../../../components/ui/tooltip.component.tsx';
import { groupEditorsByBaseVersion } from '../../../editor-version-group.model.ts';
import { useRelease } from '../../../hooks/release.hook';
import type { ReleaseAction } from '../installs-view.model';

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
            className="flex h-full min-h-0 flex-col overflow-auto pb-4 pr-3"
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
 * Renders an editor row with accessible icon actions, metadata and a copyable path.
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
        className={`flex min-h-14 items-start gap-3 rounded-md bg-base-content/2 px-3 py-3 text-base hover:bg-base-content/5 motion-reduce:transition-none ${removing ? 'pointer-events-none opacity-60' : ''}`}
        data-testid={`installedReleaseRow_${release.version}_${release.mono ? 'mono' : 'standard'}`}
        aria-busy={removing}
    >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-2">
                {release.valid === false && (
                    <TriangleAlert
                        className="size-5 shrink-0 text-warning"
                        aria-hidden="true"
                    />
                )}
                {removing && (
                    <span
                        className="loading loading-spinner loading-sm shrink-0"
                        aria-hidden="true"
                    />
                )}
                <span className="truncate font-semibold">
                    {release.name ?? release.version}
                </span>
                {release.source === 'custom' && (
                    <Tooltip placement="top" tip={t('badges.custom')}>
                        <span
                            className="inline-flex size-5 shrink-0 items-center justify-center"
                            role="img"
                            aria-label={t('badges.custom')}
                        >
                            <UserRound
                                size={16}
                                className="text-info"
                                aria-hidden="true"
                            />
                        </span>
                    </Tooltip>
                )}
                {release.prerelease && (
                    <Tooltip placement="top" tip={t('badges.prerelease')}>
                        <span
                            className="inline-flex size-5 shrink-0 items-center justify-center"
                            role="img"
                            aria-label={t('badges.prerelease')}
                        >
                            <FlaskConical
                                size={14}
                                className="text-purple-500"
                                aria-hidden="true"
                            />
                        </span>
                    </Tooltip>
                )}
                {release.mono && (
                    <span className="badge badge-sm badge-outline shrink-0">
                        {t('badges.dotNet')}
                    </span>
                )}
            </div>

            {release.name && (
                <span className="text-sm text-base-content/60">
                    {release.version}
                </span>
            )}

            <div className="flex flex-col gap-1">
                {release.valid === false ? (
                    <>
                        {(release.install_path || release.editor_path) && (
                            <CopyBadge
                                value={
                                    release.install_path || release.editor_path
                                }
                                label={t('buttons.copyPath', { ns: 'common' })}
                                copiedLabel={t('success', { ns: 'common' })}
                                className="self-start hover:bg-base-100! focus-within:bg-base-100!"
                            />
                        )}
                        <div className="alert alert-warning alert-soft text-warning-content dark:text-warning">
                            {release.source === 'custom'
                                ? t('messages.unavailableCustomEditorHint')
                                : t('messages.unavailableHintWithReinstall')}
                        </div>
                    </>
                ) : release.install_path ? (
                    <CopyBadge
                        value={release.install_path}
                        label={t('buttons.copyPath', { ns: 'common' })}
                        copiedLabel={t('success', { ns: 'common' })}
                        className="self-start hover:bg-base-100! focus-within:bg-base-100!"
                    />
                ) : progress ? (
                    <ReleaseInstallProgressIndicator
                        progress={progress}
                        className="max-w-72"
                        onCancel={onCancel}
                    />
                ) : (
                    <div
                        className="flex items-center gap-2 text-base-content/75"
                        role="status"
                    >
                        <span
                            className="loading loading-spinner loading-sm"
                            aria-hidden="true"
                        />
                        {t('status.installing')}
                    </div>
                )}
            </div>
        </div>

        {release.valid === false && (
            <div className="flex shrink-0 self-start items-center gap-1">
                {release.install_path && (
                    <Tooltip
                        placement="top"
                        tip={t('release.openInstalledFolder', { ns: 'menus' })}
                    >
                        <button
                            type="button"
                            data-testid={`btnOpenReleaseFolder_${release.version}_${release.mono ? 'mono' : 'standard'}`}
                            onClick={() => onOpenInstalledFolder(release)}
                            className="btn btn-sm btn-ghost btn-square"
                            aria-label={t('release.openInstalledFolder', {
                                ns: 'menus',
                            })}
                        >
                            <FolderOpen size={16} aria-hidden="true" />
                        </button>
                    </Tooltip>
                )}
                <Tooltip
                    placement="top"
                    tip={t('buttons.retry', { ns: 'common' })}
                >
                    <button
                        type="button"
                        className="btn btn-sm btn-ghost btn-square"
                        aria-label={t('buttons.retry', {
                            ns: 'common',
                        })}
                        onClick={() => onRetry(release)}
                        disabled={isReleaseActionBusy(release)}
                    >
                        {isReleaseActionBusy(release, 'retry') ? (
                            <span
                                className="loading loading-spinner loading-xs"
                                aria-hidden="true"
                            />
                        ) : (
                            <RefreshCw size={16} aria-hidden="true" />
                        )}
                    </button>
                </Tooltip>
                {release.source !== 'custom' && (
                    <Tooltip
                        placement="top"
                        tip={t('buttons.reinstall', {
                            ns: 'common',
                        })}
                    >
                        <button
                            type="button"
                            data-testid={`btnReinstallRelease_${release.version}_${release.mono ? 'mono' : 'standard'}`}
                            className="btn btn-sm btn-ghost btn-square text-primary"
                            onClick={() => onReinstall(release)}
                            disabled={isReleaseActionBusy(release)}
                            aria-label={t('buttons.reinstall', {
                                ns: 'common',
                            })}
                        >
                            {isReleaseActionBusy(release, 'reinstall') ? (
                                <span
                                    className="loading loading-spinner loading-xs"
                                    aria-hidden="true"
                                />
                            ) : (
                                <Download size={16} aria-hidden="true" />
                            )}
                        </button>
                    </Tooltip>
                )}
                <Tooltip
                    placement="top"
                    tip={t('buttons.remove', { ns: 'common' })}
                >
                    <button
                        type="button"
                        data-testid={`btnRemoveRelease_${release.version}_${release.mono ? 'mono' : 'standard'}`}
                        className="btn btn-sm btn-ghost btn-square text-error/80 hover:text-error hover:bg-error/20 hover:border-transparent"
                        aria-label={t('buttons.remove', {
                            ns: 'common',
                        })}
                        onClick={() => onRemove(release)}
                        disabled={isReleaseActionBusy(release)}
                    >
                        {isReleaseActionBusy(release, 'remove') ? (
                            <span
                                className="loading loading-spinner loading-xs"
                                aria-hidden="true"
                            />
                        ) : (
                            <Trash2 size={16} aria-hidden="true" />
                        )}
                    </button>
                </Tooltip>
            </div>
        )}

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
                        className="btn btn-sm btn-ghost btn-square"
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
                        className="btn btn-sm btn-ghost btn-square"
                        aria-label={t('release.startProjectManager', {
                            ns: 'menus',
                        })}
                    >
                        <img src={godotIcon} className="size-5" alt="" />
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
                        className="btn btn-sm btn-ghost btn-square text-error/80 hover:text-error hover:bg-error/20 hover:border-transparent"
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
