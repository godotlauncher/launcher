import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Navigate,
    NavLink,
    Outlet,
    Route,
    Routes,
    useNavigate,
    useParams,
} from 'react-router';

import './App.css';

import clsx from 'clsx';
import { CircleHelp, HardDrive, Package, Settings } from 'lucide-react';
import IconDiscord from './assets/icons/Discord-Symbol-Blurple.svg';
import rocketBlack from './assets/icons/godot_launcher_black.svg';
import rocketWhite from './assets/icons/godot_launcher_white.svg';
import { AppUpdateBanner } from './components/appUpdateBanner.component';
import { WindowsStep } from './components/welcomeSteps/WindowsStep';
import { COMMUNITY_DISCORD_URL } from './constants';
import { useApp } from './hooks/useApp';
import { useAppNavigation } from './hooks/useAppNavigation';
import { usePreferences } from './hooks/usePreferences';
import { useRelease } from './hooks/useRelease';
import { useTheme } from './hooks/useTheme';
import { appRoutePaths, defaultSettingsTab, isSettingsTab } from './routes';
import { HelpVIew } from './views/help.view';
import { InstallsView } from './views/installs.view';
import { ProjectsView } from './views/projects.view';
import { SettingsView } from './views/settings.view';
import { WelcomeView } from './views/welcome.view';

function App() {
    const { preferences, platform, updatePreferences } = usePreferences();
    const { loading: releaseLoading } = useRelease();

    const prefsLoading = !preferences;
    const firstRun = preferences?.first_run || false;
    const version = import.meta.env.VITE_APP_VERSION;

    useEffect(() => {
        document.title = `Godot Launcher ${version}`;
    }, []);

    if (releaseLoading || prefsLoading) {
        return <LoadingView />;
    }

    if (firstRun) {
        return <WelcomeRoutes />;
    }

    if (
        platform === 'win32' &&
        preferences &&
        !preferences.windows_symlink_win_notify
    ) {
        return (
            <WindowsSymlinkNoticeRoutes
                onContinue={() => {
                    updatePreferences({
                        windows_symlink_win_notify: true,
                        prefs_version: Math.max(
                            preferences.prefs_version ?? 3,
                            3,
                        ),
                    });
                }}
            />
        );
    }

    return <MainAppRoutes />;
}

function LoadingView() {
    const { t } = useTranslation('common');
    const { theme, systemTheme } = useTheme();
    const themeToUse = (theme ?? 'auto') === 'auto' ? systemTheme : theme;

    return (
        <div className="flex flex-col items-center justify-center fixed inset-0 z-50 bg-base-100 gap-4">
            <img
                src={themeToUse === 'dark' ? rocketWhite : rocketBlack}
                alt="Godot Launcher Logo"
                className="w-10 h-10 animate-bounce"
            />
            <span className="">{t('app.loadingMessage')}</span>
        </div>
    );
}

function WelcomeRoutes() {
    return (
        <Routes>
            <Route path={appRoutePaths.welcome} element={<WelcomeView />} />
            <Route
                path="*"
                element={<Navigate to={appRoutePaths.welcome} replace />}
            />
        </Routes>
    );
}

type WindowsSymlinkNoticeRoutesProps = {
    onContinue: () => void;
};

function WindowsSymlinkNoticeRoutes({
    onContinue,
}: WindowsSymlinkNoticeRoutesProps) {
    return (
        <Routes>
            <Route
                path={appRoutePaths.windowsSymlinkNotice}
                element={<WindowsSymlinkNotice onContinue={onContinue} />}
            />
            <Route
                path="*"
                element={
                    <Navigate to={appRoutePaths.windowsSymlinkNotice} replace />
                }
            />
        </Routes>
    );
}

type WindowsSymlinkNoticeProps = {
    onContinue: () => void;
};

function WindowsSymlinkNotice({ onContinue }: WindowsSymlinkNoticeProps) {
    const { t } = useTranslation('common');

    return (
        <div className="flex flex-col items-center justify-start w-full h-full">
            <div className="flex flex-col h-[535px] w-[1008px] p-10">
                <WindowsStep />
                <div className="flex-1"></div>
                <div className="flex justify-center">
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onContinue}
                    >
                        {t('buttons.continue')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function MainAppRoutes() {
    return (
        <Routes>
            <Route path={appRoutePaths.welcome} element={<DefaultRoute />} />
            <Route
                path={appRoutePaths.windowsSymlinkNotice}
                element={<DefaultRoute />}
            />
            <Route path={appRoutePaths.root} element={<MainLayout />}>
                <Route index element={<DefaultRoute />} />
                <Route
                    path={routeSegment(appRoutePaths.projects)}
                    element={<ProjectsRoute />}
                />
                <Route
                    path={routeSegment(appRoutePaths.projectNew)}
                    element={<ProjectsRoute createOpen />}
                />
                <Route
                    path={routeSegment(appRoutePaths.installs)}
                    element={<InstallsRoute />}
                />
                <Route
                    path={routeSegment(appRoutePaths.installEditor)}
                    element={<InstallsRoute installOpen />}
                />
                <Route
                    path={routeSegment(appRoutePaths.settings)}
                    element={<DefaultSettingsRoute />}
                />
                <Route path="settings/:tab" element={<SettingsRoute />} />
                <Route
                    path={routeSegment(appRoutePaths.help)}
                    element={<HelpVIew />}
                />
                <Route path="*" element={<DefaultRoute />} />
            </Route>
        </Routes>
    );
}

function routeSegment(path: string): string {
    return path.replace(/^\//, '');
}

function DefaultRoute() {
    const { installedReleases } = useRelease();

    return (
        <Navigate
            to={
                installedReleases.length < 1
                    ? appRoutePaths.installs
                    : appRoutePaths.projects
            }
            replace
        />
    );
}

function DefaultSettingsRoute() {
    return (
        <Navigate to={appRoutePaths.settingsTab(defaultSettingsTab)} replace />
    );
}

function ProjectsRoute({ createOpen = false }: { createOpen?: boolean }) {
    const navigate = useNavigate();

    return (
        <ProjectsView
            createOpen={createOpen}
            onCreateOpenChange={(open) => {
                if (open) {
                    navigate(appRoutePaths.projectNew);
                    return;
                }

                navigate(appRoutePaths.projects, { replace: true });
            }}
        />
    );
}

function InstallsRoute({ installOpen = false }: { installOpen?: boolean }) {
    const navigate = useNavigate();

    return (
        <InstallsView
            installOpen={installOpen}
            onInstallOpenChange={(open) => {
                if (open) {
                    navigate(appRoutePaths.installEditor);
                    return;
                }

                navigate(appRoutePaths.installs, { replace: true });
            }}
        />
    );
}

function SettingsRoute() {
    const navigate = useNavigate();
    const { tab } = useParams();

    if (!isSettingsTab(tab)) {
        return <DefaultSettingsRoute />;
    }

    return (
        <SettingsView
            activeTab={tab}
            onActiveTabChange={(nextTab) => {
                navigate(appRoutePaths.settingsTab(nextTab));
            }}
        />
    );
}

function MainLayout() {
    const { t } = useTranslation('common');
    const { currentView, openExternalLink } = useAppNavigation();
    const { installedReleases } = useRelease();
    const {
        updateAvailable,
        installAndRelaunch,
        downloadAppUpdate,
        skipAppUpdate,
    } = useApp();

    const viewClassName = (view: string) =>
        clsx('py-2 rounded-md', {
            'menu-active': currentView === view,
        });

    return (
        <div className="flex h-full overflow-hidden">
            <div className="flex flex-col h-full w-56 border-r-2 border-solid border-base-200">
                <ul className="menu rounded-box w-56 gap-2">
                    <li>
                        <NavLink
                            to={appRoutePaths.projects}
                            data-testid="btnProjects"
                            className={viewClassName('projects')}
                        >
                            <Package /> {t('app.navigation.projects')}
                        </NavLink>
                    </li>
                    <li>
                        <NavLink
                            to={appRoutePaths.installs}
                            data-testid="btnInstalls"
                            className={viewClassName('installs')}
                        >
                            {' '}
                            <HardDrive />
                            {t('app.navigation.installs')}
                        </NavLink>
                        {installedReleases.length < 1 && (
                            <span className="absolute w-10 h-10 text-warning left-2 bottom-0 loading loading-ring"></span>
                        )}
                    </li>
                </ul>
                <div className="flex flex-1"></div>
                <AppUpdateBanner
                    updateAvailable={updateAvailable}
                    installAndRelaunch={installAndRelaunch}
                    downloadAppUpdate={downloadAppUpdate}
                    skipAppUpdate={skipAppUpdate}
                />
                <div className="border-t-2 border-solid border-base-200">
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
                            <NavLink
                                to={appRoutePaths.help}
                                data-testid="btnHelp"
                                className={clsx('py-2 rounded-md relative', {
                                    'menu-active': currentView === 'help',
                                })}
                            >
                                <CircleHelp />
                                {t('app.navigation.help')}
                            </NavLink>
                        </li>

                        <li className="">
                            <NavLink
                                to={appRoutePaths.settingsTab(
                                    defaultSettingsTab,
                                )}
                                data-testid="btnSettings"
                                className={clsx('py-2 rounded-md relative', {
                                    'menu-active': currentView === 'settings',
                                })}
                            >
                                <Settings />
                                {t('app.navigation.settings')}
                            </NavLink>
                        </li>
                    </ul>
                </div>
                <div className="flex flex-col"></div>
            </div>

            <div className="flex flex-row flex-1 p-2 bg-base-200">
                <Outlet />
            </div>
        </div>
    );
}

export default App;
