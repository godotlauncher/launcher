import logger from 'electron-log';

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AutoStartSetting } from '../components/settings/AutoStartSetting.component';
import { CheckForUpdates } from '../components/settings/checkForUpdates.component';
import { EditorsLocation } from '../components/settings/EditorLocation.component';
import { GitToolSettings } from '../components/settings/gitToolSettings.component';
import { LanguageSelector } from '../components/settings/LanguageSelector';
import { ProjectLaunchAction } from '../components/settings/projectLaunchAction.component';
import { ProjectsLocation } from '../components/settings/projectsLocation.component';
import { ClearReleaseCacheControl } from '../components/settings/ClearReleaseCacheControl.component';
import { VSCodeToolSettings } from '../components/settings/vsCodeToolSettings.component';
import { WindowsSymlinkSetting } from '../components/settings/WindowsSymlinkSetting.component';
import { usePreferences } from '../hooks/usePreferences';
import { useTheme } from '../hooks/useTheme';

export const SettingsView: React.FC = () => {
    const { t } = useTranslation('settings');
    const [activeTab, setActiveTab] = useState<'projects' | 'installs' | 'appearance' | 'behavior' | 'tools' | 'updates'>('projects');
    const { preferences, savePreferences } = usePreferences();

    const { theme, setTheme } = useTheme();

    const [cachedTools, setCachedTools] = useState<CachedTool[]>([]);
    const [rescanCount, setRescanCount] = useState(0);

    const isRescanningTools = rescanCount > 0;

    const quickCheckTools = useCallback(async () => {
        return await window.electron.getCachedTools({ refreshIfStale: false });
    }, []);

    const rescanTools = useCallback(async () => {
        setRescanCount(count => count + 1);
        try {
            const tools = await window.electron.refreshToolCache();
            setCachedTools(tools);
        }
        catch (error) {
            logger.error('Failed to refresh tool cache', error);
        }
        finally {
            setRescanCount(count => Math.max(0, count - 1));
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
            }
            catch (error) {
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
        () => cachedTools.find(tool => tool.name === 'Git'),
        [cachedTools]
    );

    const vsCodeTool = useMemo(
        () => cachedTools.find(tool => tool.name === 'VSCode'),
        [cachedTools]
    );


    return (
        <>
            <div className="flex flex-col h-full w-full p-1">
                <div className="flex flex-col gap-2 w-full">

                    <div className="flex flex-row justify-between">
                        <h1 data-testid="settingsTitle" className="text-2xl">{t('title')}</h1>
                        <div className="flex gap-2">
                        </div>
                    </div>
                </div>
                <div className="divider m-0 my-2"></div>

                <div className="flex flex-col gap-0 flex-1">
                    {/* Tabs */}
                    <div role="tablist" className="flex tabs tabs-lifted">
                        <a data-testid="tabProjects" onClick={() => setActiveTab('projects')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'projects') })}>{t('tabs.projects')}</a>
                        <a data-testid="tabInstalls" onClick={() => setActiveTab('installs')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'installs') })}>{t('tabs.installs')}</a>
                        <a data-testid="tabAppearance" onClick={() => setActiveTab('appearance')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'appearance') })}>{t('tabs.appearance')}</a>
                        <a data-testid="tabBehavior" onClick={() => setActiveTab('behavior')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'behavior') })}>{t('tabs.behavior')}</a>
                        <a data-testid="tabTools" onClick={() => setActiveTab('tools')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'tools') })}>{t('tabs.tools')}</a>
                        <a data-testid="tabUpdates" onClick={() => setActiveTab('updates')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'updates') })}>{t('tabs.updates')}</a>
                    </div >

                    {/* Scrollable Content */}
                    <div className={clsx('flex flex-col py-6 flex-1 max-h-full border border-base-300 border-t-0 bg-base-100 rounded-box overflow-hidden', { 'rounded-tl-none': (activeTab === 'projects') })}>
                        <div className="flex-1 overflow-y-auto px-6">

                            {/* Projects */}
                            <div className={clsx('flex flex-col h-0 gap-4', { 'hidden': (activeTab !== 'projects') })}>
                                <ProjectsLocation />
                            </div>

                            {/* Installs */}
                            <div className={clsx('flex flex-col h-0 gap-4 ', { 'hidden': (activeTab !== 'installs') })}>
                                <EditorsLocation />
                                <div className="divider"></div>
                                {/* Clear Release Cache */}
                                <ClearReleaseCacheControl />

                            </div>

                            {/* Appearance */}
                            <div className={clsx('flex flex-col h-0 gap-4', { 'hidden': (activeTab !== 'appearance') })}>
                                {/* theme */}
                                <div className="flex flex-col">
                                    <h1 data-testid="themeHeader" className="font-bold">{t('appearance.theme.title')}</h1>
                                    <p data-testid="themeSubHeader" className="text-sm">{t('appearance.theme.description')}</p>
                                    <div className=" flex flex-row flex-0 p-4 gap-4">
                                        <label className="flex flex-row  items-center justify-start  gap-4 cursor-pointer ">
                                            <input onChange={(e) => { if (e.target.checked) setTheme('light'); }} data-testid="themeLight" type="radio" name="theme-select" className="radio checked:bg-current" checked={theme === 'light'} />
                                            <span className="">{t('appearance.theme.light')}</span>
                                        </label>
                                        <label className="flex flex-row   items-center justify-start gap-4 cursor-pointer ">
                                            <input onChange={(e) => { if (e.target.checked) setTheme('dark'); }} data-testid="themeDark" type="radio" name="theme-select" className="radio checked:bg-current" checked={theme === 'dark'} />
                                            <span className="">{t('appearance.theme.dark')}</span>
                                        </label>
                                        <label className="flex flex-row  items-center justify-start gap-4 cursor-pointer">
                                            <input onChange={(e) => { if (e.target.checked) setTheme('auto'); }} data-testid="themeAuto" type="radio" name="theme-select" className="radio checked:bg-current" checked={theme === 'auto'} />
                                            <span className="">{t('appearance.theme.system')}</span>
                                        </label>

                                    </div>
                                </div>
                                <div className="divider"></div>


                                <LanguageSelector />
                            </div>

                            {/* Behavior */}
                            <div className={clsx('flex flex-col h-0 gap-4 ', { 'hidden': (activeTab !== 'behavior') })}>

                                <div className="flex flex-col gap-4">
                                    <div>
                                        <h1 data-testid="projectsSettingsHeader" className="font-bold">{t('behavior.projects.title')}</h1>
                                        <p data-testid="projectsSettingsSubHeader" className="text-sm">{t('behavior.projects.description')}</p>
                                    </div>
                                    <div className=" flex flex-col gap-8">
                                        <label className="flex flex-row items-start cursor-pointer gap-4">
                                            <input type="checkbox" className="checkbox"
                                                data-testid="chkConfirmProjectRemoveCheckbox"
                                                checked={preferences?.confirm_project_remove}
                                                onChange={(e) => {
                                                    if (preferences) {
                                                        savePreferences({ ...preferences, confirm_project_remove: e.target.checked });
                                                    }
                                                }} />
                                            <span className="">{t('behavior.projects.confirmRemove')}</span>
                                        </label>
                                    </div>
                                </div>
                                <div className="divider"></div>

                                <ProjectLaunchAction />
                                {/* Windows Symlink Setting includes divider */}
                                <WindowsSymlinkSetting />

                                <div className="divider"></div>
                                <AutoStartSetting />
                            </div>

                            {/* Tools */}
                            <div className={clsx('flex flex-col h-0 gap-4 ', { 'hidden': (activeTab !== 'tools') })}>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm text-base-content/70">
                                        {t('tools.overview')}
                                    </p>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline"
                                        onClick={() => { void rescanTools(); }}
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
                                <GitToolSettings tool={gitTool} />
                                <div className="divider"></div>
                                <VSCodeToolSettings
                                    tool={vsCodeTool}
                                    refreshing={isRescanningTools}
                                    onRescan={rescanTools}
                                />
                            </div>

                            {/* Updates */}
                            <div className={clsx('flex flex-col h-0 gap-4 ', { 'hidden': (activeTab !== 'updates') })}>
                                <CheckForUpdates />
                            </div>

                        </div>
                    </div>
                </div>
            </div >

        </>);
};
