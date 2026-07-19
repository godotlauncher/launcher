import type { CachedTool } from '@shared/contracts';
import clsx from 'clsx';
import logger from 'electron-log';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appBridge } from '../bridge.ts';
import { usePreferences } from '../hooks/usePreferences';
import { useTheme } from '../hooks/useTheme';
import type { SettingsTab } from '../routes';
import { AppearanceSettingsPanel } from './settings/components/appearanceSettingsPanel.component';
import { BehaviorSettingsPanel } from './settings/components/behaviorSettingsPanel.component';
import { InstallsSettingsPanel } from './settings/components/installsSettingsPanel.component';
import { ProjectsSettingsPanel } from './settings/components/projectsSettingsPanel.component';
import { SettingsTabs } from './settings/components/settingsTabs.component';
import { ToolsSettingsPanel } from './settings/components/toolsSettingsPanel.component';
import { UpdatesSettingsPanel } from './settings/components/updatesSettingsPanel.component';

type SettingsViewProps = {
    activeTab?: SettingsTab;
    onActiveTabChange?: (tab: SettingsTab) => void;
};

export const SettingsView: React.FC<SettingsViewProps> = ({
    activeTab: controlledActiveTab,
    onActiveTabChange,
}) => {
    const { t } = useTranslation('settings');
    const [localActiveTab, setLocalActiveTab] =
        useState<SettingsTab>('projects');
    const activeTab = controlledActiveTab ?? localActiveTab;
    const setActiveTab = (tab: SettingsTab) => {
        if (onActiveTabChange) {
            onActiveTabChange(tab);
            return;
        }

        setLocalActiveTab(tab);
    };
    const { preferences, savePreferences } = usePreferences();
    const { theme, setTheme } = useTheme();

    const [cachedTools, setCachedTools] = useState<CachedTool[]>([]);
    const [rescanCount, setRescanCount] = useState(0);
    const isRescanningTools = rescanCount > 0;

    const quickCheckTools = useCallback(async () => {
        return await appBridge.getCachedTools({ refreshIfStale: false });
    }, []);

    const rescanTools = useCallback(async () => {
        setRescanCount((count) => count + 1);
        try {
            const tools = await appBridge.refreshToolCache();
            setCachedTools(tools);
        } catch (error) {
            logger.error('Failed to refresh tool cache', error);
        } finally {
            setRescanCount((count) => Math.max(0, count - 1));
        }
    }, []);

    useEffect(() => {
        if (activeTab !== 'tools') {
            return;
        }

        let disposed = false;

        const syncTools = async () => {
            try {
                const tools = await quickCheckTools();
                if (!disposed) {
                    setCachedTools(tools);
                }
            } catch (error) {
                logger.error('Failed to load cached tools', error);
            }
        };

        void syncTools();

        const handleFocus = () => {
            void syncTools();
        };

        window.addEventListener('focus', handleFocus);

        return () => {
            disposed = true;
            window.removeEventListener('focus', handleFocus);
        };
    }, [activeTab, quickCheckTools]);

    const gitTool = useMemo(
        () => cachedTools.find((tool) => tool.name === 'Git'),
        [cachedTools],
    );

    const vsCodeTool = useMemo(
        () => cachedTools.find((tool) => tool.name === 'VSCode'),
        [cachedTools],
    );

    return (
        <div className="flex flex-col h-full w-full p-1">
            <div className="flex flex-col gap-2 w-full">
                <div className="flex flex-row justify-between">
                    <h1 data-testid="settingsTitle" className="text-2xl">
                        {t('title')}
                    </h1>
                    <div className="flex gap-2"></div>
                </div>
            </div>
            <div className="divider m-0 my-2"></div>

            <div className="flex flex-col gap-0 flex-1">
                <SettingsTabs
                    activeTab={activeTab}
                    t={t}
                    onActiveTabChange={setActiveTab}
                />

                <div
                    className={clsx(
                        'flex flex-col py-6 flex-1 max-h-full border border-base-300 border-t-0 bg-base-100 rounded-box overflow-hidden',
                        { 'rounded-tl-none': activeTab === 'projects' },
                    )}
                >
                    <div className="flex-1 overflow-y-auto px-6">
                        <ProjectsSettingsPanel
                            active={activeTab === 'projects'}
                        />
                        <InstallsSettingsPanel
                            active={activeTab === 'installs'}
                        />
                        <AppearanceSettingsPanel
                            active={activeTab === 'appearance'}
                            t={t}
                            theme={theme}
                            onThemeChange={setTheme}
                        />
                        <BehaviorSettingsPanel
                            active={activeTab === 'behavior'}
                            t={t}
                            preferences={preferences}
                            onPreferencesChange={savePreferences}
                        />
                        <ToolsSettingsPanel
                            active={activeTab === 'tools'}
                            t={t}
                            gitTool={gitTool}
                            vsCodeTool={vsCodeTool}
                            isRescanningTools={isRescanningTools}
                            onRescanTools={rescanTools}
                        />
                        <UpdatesSettingsPanel
                            active={activeTab === 'updates'}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
