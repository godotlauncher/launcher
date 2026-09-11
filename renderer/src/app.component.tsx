import clsx from 'clsx';
import {
    Blocks,
    Cable,
    CircleHelp,
    ExternalLink,
    FileOutput,
    HardDrive,
    Images,
    Package,
    Puzzle,
    Settings,
} from 'lucide-react';
import { useCallback, useEffect } from 'react';
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
import { COMMUNITY_DISCORD_URL } from './app.constants';
import { shouldShowAppLoading } from './app.model';
import {
    appRoutePaths,
    defaultSettingsTab,
    isConnectionsPathname,
    isSettingsTab,
    type SettingsTab,
} from './app.routes';
import IconDiscord from './assets/icons/discord-symbol-blurple.svg';
import rocketBlack from './assets/icons/godot-launcher-black.svg';
import rocketWhite from './assets/icons/godot-launcher-white.svg';
import { AppUpdateBanner } from './components/app-update-banner.component';
import { MenuDivider } from './components/ui/menu-divider.component';
import { Tooltip } from './components/ui/tooltip.component';
import { useApp } from './hooks/app.hook';
import { useAppNavigation } from './hooks/app-navigation.hook';
import { usePreferences } from './hooks/preferences.hook';
import { useRelease } from './hooks/release.hook';
import { useTheme } from './hooks/theme.hook';
import { useSplashscreenHandoff } from './splashscreen/splashscreen-handoff.hook';
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
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-base-100">
            <img
                src={themeToUse === 'dark' ? rocketWhite : rocketBlack}
                alt="Godot Launcher Logo"
                className="w-10 h-10 animate-bounce"
            />
            <span>{t('app.loadingMessage')}</span>
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
    return <Navigate to={appRoutePaths.projects} replace />;
}

/**
 * Sends completed onboarding to the Projects welcome workflow.
 *
 * @returns A redirect to the projects view.
 */
function CompletedOnboardingRoute() {
    return <Navigate to={appRoutePaths.projects} replace />;
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

/**
 * Keeps Settings tab navigation stable across child state updates.
 *
 * @returns The route-controlled Settings view or its default redirect.
 */
function SettingsRoute() {
    const location = useLocation();
    const navigate = useNavigate();
    const { tab } = useParams();
    const handleActiveTabChange = useCallback(
        (nextTab: SettingsTab) => {
            navigate(appRoutePaths.settingsTab(nextTab));
        },
        [navigate],
    );

    if (!isSettingsTab(tab)) {
        return <DefaultSettingsRoute />;
    }

    return (
        <SettingsView
            activeTab={tab}
            onActiveTabChange={handleActiveTabChange}
            terminalSettingsOpen={
                tab === 'tools' &&
                new URLSearchParams(location.search).get('terminal') === 'true'
            }
            onTerminalSettingsClose={() =>
                navigate(appRoutePaths.settingsTab('tools'), { replace: true })
            }
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
        clsx({
            'menu-active': currentView === view,
        });
    const connectionsActive = isConnectionsPathname(location.pathname);

    return (
        <div className="flex h-full overflow-hidden">
            <div className="flex h-full w-shell-sidebar shrink-0 flex-col">
                <ul className="menu w-full gap-2 text-base">
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
                {[
                    [
                        { key: 'exportTemplates', icon: FileOutput },
                        { key: 'projectTemplates', icon: Blocks },
                    ],
                    [
                        { key: 'assets', icon: Images },
                        { key: 'addons', icon: Puzzle },
                    ],
                ].map((group) => (
                    <div key={group[0].key}>
                        <MenuDivider />
                        <ul className="menu w-full gap-2 text-base">
                            {group.map(({ key, icon: Icon }) => (
                                <li key={key}>
                                    <Tooltip
                                        tip={t(
                                            'app.navigation.notAvailableYet',
                                        )}
                                        delay={1000}
                                        className="p-0! hover:bg-transparent!"
                                    >
                                        <button
                                            type="button"
                                            aria-disabled="true"
                                            className="flex w-full cursor-default items-center gap-2 rounded-field px-3 py-1.5 text-left text-base-content/50"
                                        >
                                            <Icon
                                                className="size-5 shrink-0"
                                                aria-hidden="true"
                                            />
                                            {t(`app.navigation.${key}`)}
                                        </button>
                                    </Tooltip>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
                <div className="flex flex-1"></div>
                <AppUpdateBanner
                    updateAvailable={updateAvailable}
                    installAndRelaunch={installAndRelaunch}
                    downloadAppUpdate={downloadAppUpdate}
                    skipAppUpdate={skipAppUpdate}
                    openUpdateUrl={openExternalLink}
                />
                <div className="pt-2">
                    <MenuDivider />
                    <ul className="menu w-full gap-1 text-base">
                        <li>
                            <button
                                type="button"
                                data-testid="btnDiscord"
                                data-external-link=""
                                className="relative"
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
                                <ExternalLink
                                    className="size-3.5 shrink-0 justify-self-end opacity-45"
                                    aria-hidden="true"
                                />
                            </button>
                        </li>

                        <li>
                            <NavLink
                                to={appRoutePaths.help}
                                data-testid="btnHelp"
                                className={clsx('relative', {
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
                                className={clsx('relative', {
                                    'menu-active': connectionsActive,
                                })}
                            >
                                <Cable className="size-5" />
                                <span className="flex-1">
                                    {t('app.navigation.connections')}
                                </span>
                                <span className="badge badge-primary">
                                    {t('app.navigation.new')}
                                </span>
                            </NavLink>
                        </li>

                        <li>
                            <NavLink
                                to={appRoutePaths.settingsTab(
                                    defaultSettingsTab,
                                )}
                                data-testid="btnSettings"
                                className={clsx('relative', {
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

            <div className="flex flex-1 flex-row bg-base-200 p-2">
                <Outlet />
            </div>
        </div>
    );
}

export default App;
