import clsx from 'clsx';
import { Cable, CircleHelp, HardDrive, Package, Settings } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Navigate,
    NavLink,
    Outlet,
    Route,
    Routes,
    useLocation,
    useNavigate,
    useParams,
} from 'react-router';
import { shouldShowAppLoading } from './App.model';
import IconDiscord from './assets/icons/Discord-Symbol-Blurple.svg';
import rocketBlack from './assets/icons/godot_launcher_black.svg';
import rocketWhite from './assets/icons/godot_launcher_white.svg';
import { AppUpdateBanner } from './components/appUpdateBanner.component';
import { COMMUNITY_DISCORD_URL } from './constants';
import { useApp } from './hooks/useApp';
import { useAppNavigation } from './hooks/useAppNavigation';
import { usePreferences } from './hooks/usePreferences';
import { useRelease } from './hooks/useRelease';
import { useTheme } from './hooks/useTheme';
import {
    appRoutePaths,
    defaultSettingsTab,
    isConnectionsPathname,
    isSettingsTab,
} from './routes';
import { useSplashscreenHandoff } from './splashscreen/useSplashscreenHandoff';
import { HelpVIew } from './views/help.view';
import { InstallsView } from './views/installs.view';
import { OnboardingView } from './views/onboarding.view';
import { ProjectsView } from './views/projects.view';
import { SettingsView } from './views/settings.view';

function App() {
    const { preferences } = usePreferences();
    const { initialized: releasesInitialized } = useRelease();

    const prefsLoading = !preferences;
    const firstRun = preferences?.first_run || false;
    const version = import.meta.env.VITE_APP_VERSION;

    useEffect(() => {
        document.title = `Godot Launcher ${version}`;
    }, []);

    const loading = shouldShowAppLoading({
        prefsLoading,
        releasesInitialized,
    });

    useSplashscreenHandoff(!loading);

    if (loading) {
        return <LoadingView />;
    }

    if (firstRun) {
        return <WelcomeRoutes />;
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
            <Route path={appRoutePaths.welcome} element={<OnboardingView />} />
            <Route
                path="*"
                element={<Navigate to={appRoutePaths.welcome} replace />}
            />
        </Routes>
    );
}

function MainAppRoutes() {
    return (
        <Routes>
            <Route
                path={appRoutePaths.welcome}
                element={<CompletedOnboardingRoute />}
            />
            <Route path={appRoutePaths.root} element={<MainLayout />}>
                <Route index element={<DefaultRoute />} />
                <Route
                    path={routeSegment(appRoutePaths.projects)}
                    element={<ProjectsRoute />}
                >
                    <Route path="new" element={null} />
                </Route>
                <Route
                    path={routeSegment(appRoutePaths.installs)}
                    element={<InstallsRoute />}
                >
                    <Route path="install" element={null} />
                </Route>
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

/**
 * Sends completed onboarding directly into the first useful workflow.
 *
 * @returns A redirect to the install drawer or projects view.
 */
function CompletedOnboardingRoute() {
    const { installedReleases } = useRelease();

    return (
        <Navigate
            to={
                installedReleases.length < 1
                    ? appRoutePaths.installEditor
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

/**
 * Keeps the projects view mounted while its route-controlled drawer changes.
 *
 * @returns The projects view with route-derived drawer state.
 */
function ProjectsRoute() {
    const location = useLocation();
    const navigate = useNavigate();
    const createOpen = location.pathname === appRoutePaths.projectNew;

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

/**
 * Keeps the installs view mounted while its route-controlled drawer changes.
 *
 * @returns The installs view with route-derived drawer state.
 */
function InstallsRoute() {
    const location = useLocation();
    const navigate = useNavigate();
    const installOpen = location.pathname === appRoutePaths.installEditor;

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

/**
 * Renders the main application navigation and active route.
 *
 * @returns The primary application layout.
 */
function MainLayout() {
    const { t } = useTranslation('common');
    const location = useLocation();
    const { currentView, openExternalLink } = useAppNavigation();
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
    const connectionsActive = isConnectionsPathname(location.pathname);

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
                            <Package className="size-5" />{' '}
                            {t('app.navigation.projects')}
                        </NavLink>
                    </li>
                    <li>
                        <NavLink
                            to={appRoutePaths.installs}
                            data-testid="btnInstalls"
                            className={viewClassName('installs')}
                        >
                            {' '}
                            <HardDrive className="size-5" />
                            {t('app.navigation.installs')}
                        </NavLink>
                    </li>
                </ul>
                <div className="flex flex-1"></div>
                <AppUpdateBanner
                    updateAvailable={updateAvailable}
                    installAndRelaunch={installAndRelaunch}
                    downloadAppUpdate={downloadAppUpdate}
                    skipAppUpdate={skipAppUpdate}
                    openUpdateUrl={openExternalLink}
                />
                <div className="pt-2">
                    <div
                        className="mx-3 border-t border-base-content/5"
                        aria-hidden="true"
                    />
                    <ul className="menu menu-md rounded-box w-56 gap-1 ">
                        <li>
                            <button
                                type="button"
                                data-testid="btnDiscord"
                                data-external-link=""
                                className="py-2 rounded-md relative"
                                onClick={() =>
                                    openExternalLink(COMMUNITY_DISCORD_URL)
                                }
                            >
                                <img
                                    src={IconDiscord}
                                    alt="Discord"
                                    className="size-5"
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
                                <CircleHelp className="size-5" />
                                {t('app.navigation.help')}
                            </NavLink>
                        </li>

                        <li>
                            <NavLink
                                to={appRoutePaths.settingsTab('connections')}
                                data-testid="btnConnections"
                                className={clsx('py-2 rounded-md relative', {
                                    'menu-active': connectionsActive,
                                })}
                            >
                                <Cable className="size-5" />
                                <span className="flex-1">
                                    {t('app.navigation.connections')}
                                </span>
                                <span className="badge badge-primary badge-xs">
                                    {t('app.navigation.new')}
                                </span>
                            </NavLink>
                        </li>

                        <li className="">
                            <NavLink
                                to={appRoutePaths.settingsTab(
                                    defaultSettingsTab,
                                )}
                                data-testid="btnSettings"
                                className={clsx('py-2 rounded-md relative', {
                                    'menu-active':
                                        currentView === 'settings' &&
                                        !connectionsActive,
                                })}
                            >
                                <Settings className="size-5" />
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
