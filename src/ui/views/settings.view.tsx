import clsx from 'clsx';
import { useState } from 'react';
import { AutoStartSetting } from '../components/settings/AutoStartSetting.component';
import { CheckForUpdates } from '../components/settings/checkForUpdates.component';
import { EditorsLocation } from '../components/settings/EditorLocation.component';
import { GitToolSettings } from '../components/settings/gitToolSettings.component';
import { ProjectLaunchAction } from '../components/settings/projectLaunchAction.component';
import { ProjectsLocation } from '../components/settings/projectsLocation.component';
import { VSCodeToolSettings } from '../components/settings/vsCodeToolSettings.component';
import { WindowsSymlinkSetting } from '../components/settings/WindowsSymlinkSetting.component';
import { usePreferences } from '../hooks/usePreferences';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

export const SettingsView: React.FC = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'projects' | 'installs' | 'appearance' | 'behavior' | 'tools' | 'updates'>('projects');
    const { preferences, savePreferences } = usePreferences();

    const { theme, setTheme } = useTheme();



    return (
        <>
            <div className="flex flex-col h-full w-full p-1">
                <div className="flex flex-col gap-2 w-full">

                    <div className="flex flex-row justify-between">
                        <h1 data-testid="settingsTitle" className="text-2xl">{t('settings')}</h1>
                        <div className="flex gap-2">
                        </div>
                    </div>
                </div>
                <div className="divider m-0 my-2"></div>

                <div className="flex flex-col gap-0 flex-1">
                    {/* Tabs */}
                    <div role="tablist" className="flex tabs tabs-lifted">
                        <a data-testid="tabProjects" onClick={() => setActiveTab('projects')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'projects') })}>{t('projects')}</a>
                        <a data-testid="tabInstalls" onClick={() => setActiveTab('installs')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'installs') })}>{t('installs')}</a>
                        <a data-testid="tabAppearance" onClick={() => setActiveTab('appearance')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'appearance') })}>{t('appearance')}</a>
                        <a data-testid="tabBehavior" onClick={() => setActiveTab('behavior')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'behavior') })}>{t('behavior')}</a>
                        <a data-testid="tabTools" onClick={() => setActiveTab('tools')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'tools') })}>{t('tools')}</a>
                        <a data-testid="tabUpdates" onClick={() => setActiveTab('updates')} role="tab" className={clsx('tab', { 'tab-active': (activeTab === 'updates') })}>{t('updates')}</a>
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

                            </div>

                            {/* Appearance */}
                            <div className={clsx('flex flex-col h-0 gap-4', { 'hidden': (activeTab !== 'appearance') })}>
                                {/* theme */}
                                <div className="flex flex-col">
                                    <h1 data-testid="themeHeader" className="font-bold">{t('theme')}</h1>
                                    <p data-testid="themeSubHeader" className="text-sm">{t('theme_introduction')}</p>
                                    <div className=" flex flex-row flex-0 p-4 gap-4">
                                        <label className="flex flex-row  items-center justify-start  gap-4 cursor-pointer ">
                                            <input onChange={(e) => { if (e.target.checked) setTheme('light'); }} data-testid="themeLight" type="radio" name="theme-select" className="radio checked:bg-current" checked={theme === 'light'} />
                                            <span className="">{t('light')}</span>
                                        </label>
                                        <label className="flex flex-row   items-center justify-start gap-4 cursor-pointer ">
                                            <input onChange={(e) => { if (e.target.checked) setTheme('dark'); }} data-testid="themeDark" type="radio" name="theme-select" className="radio checked:bg-current" checked={theme === 'dark'} />
                                            <span className="">{t('dark')}</span>
                                        </label>
                                        <label className="flex flex-row  items-center justify-start gap-4 cursor-pointer">
                                            <input onChange={(e) => { if (e.target.checked) setTheme('auto'); }} data-testid="themeAuto" type="radio" name="theme-select" className="radio checked:bg-current" checked={theme === 'auto'} />
                                            <span className="">{t('system')}</span>
                                        </label>

                                    </div>
                                </div>
                                <div className="divider"></div>


                                <div className="flex flex-col">
                                    <h1 data-testid="languageHeader" className="font-bold">{t('language')}</h1>
                                    <p data-testid="languageSubHeader" className="text-sm">{t('select_language_note')}</p>
                                    <div className=" flex flex-col p-4 gap-4">
                                        <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                                            <select
                                                value={preferences?.language_auto ? 'auto' : (preferences?.language || i18n.language)}
                                                onChange={async (e) => {
                                                    const val = e.target.value;
                                                    if (val === 'auto') {
                                                        // enable auto language detection
                                                        await savePreferences({ ...preferences!, language_auto: true });
                                                        // trigger detection by reloading preferences in provider (it will detect system language)
                                                        // also apply immediate detection heuristically here
                                                        const locale = navigator?.language || (navigator as any)?.userLanguage;
                                                        const lang = locale?.startsWith('zh') ? 'zh' : 'en';
                                                        i18n.changeLanguage(lang);
                                                    } else {
                                                        // user chose a specific language
                                                        await savePreferences({ ...preferences!, language: val, language_auto: false });
                                                        i18n.changeLanguage(val);
                                                    }
                                                }}
                                                className="select select-bordered w-full max-w-xs">
                                                <option value="auto">{t('system')}</option>
                                                <option value="en">English</option>
                                                <option value="zh">简体中文</option>
                                            </select>

                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Behavior */}
                            <div className={clsx('flex flex-col h-0 gap-4 ', { 'hidden': (activeTab !== 'behavior') })}>

                                <div className="flex flex-col gap-4">
                                    <div>
                                        <h1 data-testid="projectsSettingsHeader" className="font-bold">{t('projects')}</h1>
                                        <p data-testid="projectsSettingsSubHeader" className="text-sm">{t('ChooseGodotLauncherbehaviorforprojects')}</p>
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
                                            <span className="">{t('Ask_for_confirmation_when_removing_projects')}</span>
                                        </label>
                                    </div>
                                </div>
                                <div className="divider"></div>

                                <ProjectLaunchAction />
                                <div className="divider"></div>
                                <WindowsSymlinkSetting />
                                <div className="divider"></div>
                                <AutoStartSetting />
                            </div>

                            {/* Tools */}
                            <div className={clsx('flex flex-col h-0 gap-4 ', { 'hidden': (activeTab !== 'tools') })}>

                                <GitToolSettings />
                                <div className="divider"></div>
                                <VSCodeToolSettings />

                            </div>

                            {/* Updates */}
                            <div className={clsx('flex flex-col h-0 gap-4 ', { 'hidden': (activeTab !== 'updates') })}>
                                <CheckForUpdates />
                            </div>

                        </div>
                    </div>
                </div>
            </div>

        </>);
};
