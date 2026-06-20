import clsx from 'clsx';
import { HardDrive, RefreshCcw } from 'lucide-react';
import type React from 'react';
import { Tooltip } from '../../../../components/ui/tooltip.component';
import type { InstallEditorTab } from '../installEditor.model';

type InstallEditorTabsProps = {
    tab: InstallEditorTab;
    releaseInstalledCount: number;
    prereleaseInstalledCount: number;
    releaseDownloading: boolean;
    prereleaseDownloading: boolean;
    filterInstalled: boolean;
    releasedLabel: string;
    prereleaseLabel: string;
    showInstalledOnlyLabel: string;
    reloadLabel: string;
    onTabChange: (tab: InstallEditorTab) => void;
    onFilterInstalledChange: (enabled: boolean) => void;
    onRefresh: () => void;
};

export const InstallEditorTabs: React.FC<InstallEditorTabsProps> = ({
    tab,
    releaseInstalledCount,
    prereleaseInstalledCount,
    releaseDownloading,
    prereleaseDownloading,
    filterInstalled,
    releasedLabel,
    prereleaseLabel,
    showInstalledOnlyLabel,
    reloadLabel,
    onTabChange,
    onFilterInstalledChange,
    onRefresh,
}) => (
    <div className="flex flex-row justify-between">
        <div role="tablist" className="tabs tabs-border flex flex-1 flex-row ">
            <button
                type="button"
                role="tab"
                onClick={() => onTabChange('RELEASE')}
                data-testid="tabInstallsRelease"
                className={clsx('tab w-[150px] justify-start pl-4', {
                    'tab-active': tab === 'RELEASE',
                })}
            >
                <div className="flex gap-2 items-center">
                    {releasedLabel}({releaseInstalledCount})
                    {releaseDownloading && (
                        <div className="loading loading-ring loading-xs m-0 p-0"></div>
                    )}
                </div>
            </button>
            <button
                type="button"
                role="tab"
                onClick={() => onTabChange('PRERELEASE')}
                data-testid="tabInstallsPrerelease"
                className={clsx('tab w-[150px] justify-start pl-4', {
                    'tab-active': tab === 'PRERELEASE',
                })}
            >
                <p className="flex gap-2 items-center">
                    {prereleaseLabel}({prereleaseInstalledCount})
                    {prereleaseDownloading && (
                        <div className="loading loading-ring loading-xs m-0 p-0"></div>
                    )}
                </p>
            </button>
        </div>
        <div className="flex flex-row gap-2 items-center">
            <Tooltip tip={showInstalledOnlyLabel} tone="info">
                <label className="swap swap-indeterminate">
                    <input
                        type="checkbox"
                        checked={filterInstalled}
                        onChange={(event) =>
                            onFilterInstalledChange(event.target.checked)
                        }
                    />
                    <div className="swap-on  text-sm flex gap-2 items-center text-info">
                        <HardDrive className="stroke-info" />
                        {showInstalledOnlyLabel}
                    </div>
                    <div className="swap-off text-sm flex gap-2 items-center text-base-content">
                        <HardDrive />
                        {showInstalledOnlyLabel}
                    </div>
                </label>
            </Tooltip>

            <button
                type="button"
                onClick={onRefresh}
                className="btn btn-sm"
                title={reloadLabel}
            >
                <RefreshCcw className="w-4" />
            </button>
        </div>
    </div>
);
