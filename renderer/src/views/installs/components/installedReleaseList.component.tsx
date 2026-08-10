import type {
    InstalledRelease,
    ReleaseInstallProgress,
} from '@shared/contracts';
import {
    EllipsisVertical,
    FlaskConical,
    TriangleAlert,
    UserRound,
} from 'lucide-react';
import type React from 'react';
import { EditorVersionGroup } from '../../../components/editor-version-group.component.tsx';
import { ReleaseInstallProgressIndicator } from '../../../components/releaseInstallProgress.component';
import { Tooltip } from '../../../components/ui/tooltip.component.tsx';
import { groupEditorsByBaseVersion } from '../../../editor-version-group.model.ts';
import { useRelease } from '../../../hooks/useRelease';
import type { ReleaseAction } from '../installsView.model';

type Translate = (key: string, options?: { ns?: string }) => string;

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
    onOpenReleaseMoreOptions: (
        event: React.MouseEvent,
        release: InstalledRelease,
    ) => void;
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
    onOpenReleaseMoreOptions,
}) => {
    const { getReleaseInstallProgress } = useRelease();
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
                            t={t}
                            isReleaseActionBusy={isReleaseActionBusy}
                            onRetry={onRetry}
                            onReinstall={onReinstall}
                            onRemove={onRemove}
                            onOpenReleaseMoreOptions={onOpenReleaseMoreOptions}
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
    t: Translate;
    isReleaseActionBusy: (
        release: InstalledRelease,
        action?: ReleaseAction,
    ) => boolean;
    onRetry: (release: InstalledRelease) => void;
    onReinstall: (release: InstalledRelease) => void;
    onRemove: (release: InstalledRelease) => void;
    onOpenReleaseMoreOptions: (
        event: React.MouseEvent,
        release: InstalledRelease,
    ) => void;
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
    t,
    isReleaseActionBusy,
    onRetry,
    onReinstall,
    onRemove,
    onOpenReleaseMoreOptions,
}) => (
    <article
        className="flex min-h-14 items-center gap-3 rounded-box px-3 py-2 hover:bg-base-200/65"
        data-testid={`installedReleaseRow_${release.version}_${release.mono ? 'mono' : 'standard'}`}
    >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                {release.valid === false && (
                    <TriangleAlert
                        className="size-4 shrink-0 text-warning"
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
                    />
                ) : (
                    <div className="flex flex-row items-center gap-2">
                        <div className="loading loading-ring loading-sm" />
                        {t('status.installing')}
                    </div>
                )}
            </div>
        </div>

        {release.install_path && release.valid !== false && (
            <button
                type="button"
                data-testid="btnReleaseMoreOptions"
                onClick={(event) => onOpenReleaseMoreOptions(event, release)}
                className="relative flex size-10 shrink-0 select-none items-center justify-center rounded-lg outline-none hover:bg-base-content/20"
            >
                <EllipsisVertical size={20} aria-hidden="true" />
            </button>
        )}
    </article>
);
