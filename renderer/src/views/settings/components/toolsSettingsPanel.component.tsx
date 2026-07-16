import type { CachedTool } from '@shared/contracts';
import type React from 'react';
import { GitToolSettings } from '../../../components/settings/gitToolSettings.component';
import { VSCodeToolSettings } from '../../../components/settings/vsCodeToolSettings.component';
import { SettingsPanelSection } from './settingsPanelSection.component';

type Translate = (key: string) => string;

type ToolsSettingsPanelProps = {
    active: boolean;
    t: Translate;
    gitTool?: CachedTool;
    vsCodeTool?: CachedTool;
    isRescanningTools: boolean;
    onRescanTools: () => Promise<void>;
};

export const ToolsSettingsPanel: React.FC<ToolsSettingsPanelProps> = ({
    active,
    t,
    gitTool,
    vsCodeTool,
    isRescanningTools,
    onRescanTools,
}) => (
    <SettingsPanelSection active={active} className=" ">
        <div className="flex flex-col gap-4">
            <div>
                <p className="text-sm text-base-content/70">
                    {t('tools.overview')}
                </p>
            </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                    void onRescanTools();
                }}
                disabled={isRescanningTools}
            >
                <span className="flex items-center gap-2">
                    {isRescanningTools && (
                        <span
                            className="loading loading-spinner loading-xs"
                            aria-hidden="true"
                        ></span>
                    )}
                    {isRescanningTools
                        ? t('tools.actions.scanning')
                        : t('tools.actions.refresh')}
                </span>
            </button>
        </div>
        <div className="divider"></div>
        <GitToolSettings tool={gitTool} />
        <div className="divider"></div>
        <VSCodeToolSettings
            tool={vsCodeTool}
            refreshing={isRescanningTools}
            onRescan={onRescanTools}
        />
    </SettingsPanelSection>
);
