import clsx from 'clsx';
import { RefreshCcw } from 'lucide-react';
import type React from 'react';
import { Tooltip } from '../../../components/ui/tooltip.component.tsx';
import type {
    InstallEditorChannel,
    InstallEditorShow,
} from './install-editor.model.ts';

type InstallEditorFiltersProps = {
    show: InstallEditorShow;
    channel: InstallEditorChannel;
    loading: boolean;
    refreshCooldownSeconds: number;
    showLabel: string;
    latestLabel: string;
    allLabel: string;
    channelLabel: string;
    stableLabel: string;
    prereleaseLabel: string;
    refreshLabel: string;
    loadingLabel: string;
    cooldownLabel: string;
    cooldownTooltip: string;
    onShowChange: (show: InstallEditorShow) => void;
    onChannelChange: (channel: InstallEditorChannel) => void;
    onRefresh: () => void;
};

/**
 * Renders the compact catalog controls used by the drawer.
 *
 * @param props - The current filters, labels, and filter actions.
 * @returns The catalog filter row.
 */
export const InstallEditorFilters: React.FC<InstallEditorFiltersProps> = ({
    show,
    channel,
    loading,
    refreshCooldownSeconds,
    showLabel,
    latestLabel,
    allLabel,
    channelLabel,
    stableLabel,
    prereleaseLabel,
    refreshLabel,
    loadingLabel,
    cooldownLabel,
    cooldownTooltip,
    onShowChange,
    onChannelChange,
    onRefresh,
}) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
            <span className="text-base-content/70">{showLabel}</span>
            <div role="tablist" className="tabs tabs-box tabs-sm">
                <button
                    type="button"
                    role="tab"
                    data-testid="tabInstallsLatest"
                    aria-selected={show === 'latest'}
                    className={clsx('tab', {
                        'tab-active': show === 'latest',
                    })}
                    onClick={() => onShowChange('latest')}
                >
                    {latestLabel}
                </button>
                <button
                    type="button"
                    role="tab"
                    data-testid="tabInstallsAll"
                    aria-selected={show === 'all'}
                    className={clsx('tab', {
                        'tab-active': show === 'all',
                    })}
                    onClick={() => onShowChange('all')}
                >
                    {allLabel}
                </button>
            </div>
        </div>

        <div className="flex items-center gap-2">
            <span className="text-base-content/70">{channelLabel}</span>
            <div role="tablist" className="tabs tabs-box tabs-sm">
                <button
                    type="button"
                    role="tab"
                    data-testid="tabInstallsRelease"
                    aria-selected={channel === 'stable'}
                    className={clsx('tab', {
                        'tab-active': channel === 'stable',
                    })}
                    onClick={() => onChannelChange('stable')}
                >
                    {stableLabel}
                </button>
                <button
                    type="button"
                    role="tab"
                    data-testid="tabInstallsPrerelease"
                    aria-selected={channel === 'prerelease'}
                    className={clsx('tab', {
                        'tab-active': channel === 'prerelease',
                    })}
                    onClick={() => onChannelChange('prerelease')}
                >
                    {prereleaseLabel}
                </button>
            </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center">
                {loading && (
                    <span
                        className="loading loading-spinner loading-sm text-primary"
                        role="status"
                        aria-label={loadingLabel}
                    />
                )}
            </div>
            {refreshCooldownSeconds > 0 && (
                <span className="whitespace-nowrap text-xs text-base-content/60">
                    {cooldownLabel}
                </span>
            )}
            <Tooltip
                placement="top"
                tip={
                    refreshCooldownSeconds > 0 ? cooldownTooltip : refreshLabel
                }
            >
                <button
                    type="button"
                    data-testid="btnRefreshInstallEditorCatalog"
                    className="btn btn-ghost btn-sm btn-square"
                    aria-label={refreshLabel}
                    onClick={onRefresh}
                    disabled={loading || refreshCooldownSeconds > 0}
                >
                    <RefreshCcw size={16} aria-hidden="true" />
                </button>
            </Tooltip>
        </div>
    </div>
);
