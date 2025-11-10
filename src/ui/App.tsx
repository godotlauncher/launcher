import React, { useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import './App.css';

import clsx from 'clsx';
import { CircleHelp, HardDrive, Package, Settings } from 'lucide-react';
import IconDiscord from './assets/icons/Discord-Symbol-Blurple.svg';
import logo from './assets/logo.png';
import { WindowsStep } from './components/welcomeSteps/WindowsStep';
import { COMMUNITY_DISCORD_URL } from './constants';
import { useApp } from './hooks/useApp';
import { useAppNavigation, type View } from './hooks/useAppNavigation';
import { usePreferences } from './hooks/usePreferences';
import { usePromotion } from './hooks/usePromotion';
import { useRelease } from './hooks/useRelease';
import { PromotionCTA } from './promotion';
import { HelpVIew } from './views/help.view';
import { InstallsView } from './views/installs.view';
import { ProjectsView } from './views/projects.view';
import { SettingsView } from './views/settings.view';
import { WelcomeView } from './views/welcome.view';

function App() {
    const { t } = useTranslation('common');
    const [loading, setLoading] = React.useState(true);

    const { currentView, setCurrentView, openExternalLink } =
        useAppNavigation();

    const { installedReleases, loading: releaseLoading } = useRelease();
    const { preferences, platform, updatePreferences } = usePreferences();
    const { promotion, countdown, buildClickPayload } = usePromotion();

    const { updateAvailable, installAndRelaunch } = useApp();

    // Derive values from preferences and loading state
    const prefsLoading = !preferences;
    const firstRun = preferences?.first_run || false;
    // set the title of the app
    const version = import.meta.env.VITE_APP_VERSION;

    useEffect(() => {
        document.title = `Godot Launcher ${version}`;
    });

    useEffect(() => {
        if (!releaseLoading) {
            // Coordinating loading states is a valid use case
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLoading(false);
            if (installedReleases.length < 1) {
                setCurrentView('installs');
            }
        }
    }, [releaseLoading, installedReleases.length, setCurrentView]);

    const changeView = (view: View) => {
        setCurrentView(view);
    };

    const handlePromotionClick = React.useCallback(() => {
        if (!promotion) {
            return;
        }

        const payload = buildClickPayload();
        if (payload) {
            void window.electron.promotionClicked(payload);
        }

        if (promotion.externalLink) {
            void openExternalLink(promotion.externalLink);
        }
    }, [promotion, buildClickPayload, openExternalLink]);

    const ShowView = () => {
        switch (currentView) {
            case 'projects':
                return <ProjectsView />;
            case 'installs':
                return <InstallsView />;
            case 'settings':
                return <SettingsView />;
            case 'help':
                return <HelpVIew />;
        }
    };

    if (loading || prefsLoading) {
        return (
            <div className="flex flex-col items-center justify-center fixed inset-0 z-50 bg-base-100 gap-4">
                <img
                    src={logo}
                    alt="Godot Launcher Logo"
                    className="w-10 h-10 animate-pulse"
                />
                <span className="">{t('app.loadingMessage')}</span>
            </div>
        );
    }

    if (firstRun) {
        return <WelcomeView />;
    }

    // if the user is on windows and has not acknowledged the symlink change, show the windows step
    if (
        platform === 'win32' &&
        preferences &&
        !preferences.windows_symlink_win_notify
    ) {
        return (
            <div className="flex flex-col items-center justify-start w-full h-full">
                <div className="flex flex-col h-[535px] w-[1008px] p-10">
                    <WindowsStep />
                    <div className="flex-1"></div>
                    <div className="flex justify-center">
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                                updatePreferences({
                                    windows_symlink_win_notify: true,
                                    prefs_version: Math.max(
                                        preferences.prefs_version ?? 3,
                                        3,
                                    ),
                                });
                            }}
                        >
                            {t('buttons.continue')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full overflow-hidden">
            <div className="flex flex-col h-full w-56 border-r-2 border-solid border-base-200">
                <ul className="menu rounded-box w-56 gap-2">
                    <li>
                        <button
                            type="button"
                            data-testid="btnProjects"
                            className={clsx('py-2 rounded-md', {
                                'menu-active': currentView === 'projects',
                            })}
                            onClick={() => changeView('projects')}
                        >
                            <Package /> {t('app.navigation.projects')}
                        </button>
                    </li>
                    <li>
                        <button
                            type="button"
                            data-testid="btnInstalls"
                            className={clsx('py-2 rounded-md', {
                                'menu-active': currentView === 'installs',
                            })}
                            onClick={() => changeView('installs')}
                        >
                            {' '}
                            <HardDrive />
                            {t('app.navigation.installs')}
                        </button>
                        {installedReleases.length < 1 && (
                            <span className="absolute w-10 h-10 text-warning left-2 bottom-0 loading loading-ring"></span>
                        )}
                    </li>
                </ul>
                <div className="flex flex-1"></div>
                {updateAvailable && updateAvailable?.type === 'ready' && (
                    <div className="gap-2 p-4 m-2 text-sm text-info rounded-xl bg-base-200">
                        {updateAvailable?.version ? (
                            <Trans
                                ns="common"
                                i18nKey="app.update.bannerWithVersion"
                                values={{ version: updateAvailable.version }}
                                components={{
                                    Button: (
                                        <button
                                            type="button"
                                            onClick={installAndRelaunch}
                                            className="underline cursor-pointer hover:no-underline"
                                        />
                                    ),
                                }}
                            />
                        ) : (
                            <Trans
                                ns="common"
                                i18nKey="app.update.bannerNoVersion"
                                components={{
                                    Button: (
                                        <button
                                            type="button"
                                            onClick={installAndRelaunch}
                                            className="underline cursor-pointer hover:no-underline"
                                        />
                                    ),
                                }}
                            />
                        )}
                    </div>
                )}
                {promotion && (
                    <div className="pb-2">
                        <ul className="menu rounded-box w-56 gap-1">
                            <PromotionCTA
                                promotion={promotion}
                                countdown={countdown}
                                onClick={handlePromotionClick}
                            />
                        </ul>
                    </div>
                )}
                <div className="border-t-2 border-solid border-base-200">
                    {/* <div className="flex flex-row items-center mx-2 rounded p-2 bg-info/50 h-10 text-xs text-white">Update Available</div> */}
                    <ul className="menu menu-md rounded-box w-56 gap-1 ">
                        <li>
                            <button
                                type="button"
                                data-testid="btnDiscord"
                                className="py-2 rounded-md relative"
                                onClick={() =>
                                    openExternalLink(COMMUNITY_DISCORD_URL)
                                }
                            >
                                <img
                                    src={IconDiscord}
                                    alt="Discord"
                                    className="w-6 h-6"
                                />
                                {t('app.navigation.joinCommunity')}
                            </button>
                        </li>

                        <li>
                            <button
                                type="button"
                                data-testid="btnHelp"
                                className={clsx('py-2 rounded-md relative', {
                                    'menu-active': currentView === 'help',
                                })}
                                onClick={() => changeView('help')}
                            >
                                <CircleHelp />
                                {t('app.navigation.help')}
                            </button>
                        </li>

                        <li className="">
                            <button
                                type="button"
                                data-testid="btnSettings"
                                className={clsx('py-2 rounded-md relative', {
                                    'menu-active': currentView === 'settings',
                                })}
                                onClick={() => changeView('settings')}
                            >
                                <Settings />
                                {t('app.navigation.settings')}
                            </button>
                        </li>
                    </ul>
                </div>
                <div className="flex flex-col"></div>
            </div>

            <div className="flex flex-row flex-1 p-2 bg-base-200">
                {ShowView()}
            </div>
        </div>
    );
}

export default App;
