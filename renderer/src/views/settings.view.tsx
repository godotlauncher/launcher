import type {
    AppIntegrationAccessTargetSummary,
    AppIntegrationActionFailureReason,
    AppIntegrationActionResult,
    AppIntegrationConnectionSummary,
    AppIntegrationSummary,
    CodeEditorId,
    CodeEditorIntegrationSettings,
    ToolIntegrationSummary,
} from '@shared/contracts';
import logger from 'electron-log';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { SettingsTab } from '../app.routes';
import { GitHubConnectionDialog } from '../components/github-connection/github-connection-dialog.component';
import { useAlerts } from '../hooks/alerts.hook';
import { useAppIntegrations } from '../hooks/app-integrations.hook';
import { useCodeEditorIntegrations } from '../hooks/code-editor-integrations.hook';
import { usePreferences } from '../hooks/preferences.hook';
import { useProjects } from '../hooks/projects.hook';
import { useTheme } from '../hooks/theme.hook';
import { useToolIntegrations } from '../hooks/tool-integrations.hook';
import { getCodeEditorProjectUsage } from './projects/project-code-editor-health.model';
import { AppIntegrationDisconnectConfirm } from './settings/components/app-integration-disconnect-confirm.component';
import { AppearanceSettingsPanel } from './settings/components/appearance-settings-panel.component';
import { BehaviorSettingsPanel } from './settings/components/behavior-settings-panel.component';
import { CodeEditorSettingsPanel } from './settings/components/code-editor-settings-panel.component';
import { ConnectionsSettingsPanel } from './settings/components/connections-settings-panel.component';
import { InstallsSettingsPanel } from './settings/components/installs-settings-panel.component';
import { ProjectsSettingsPanel } from './settings/components/projects-settings-panel.component';
import { SettingsTabs } from './settings/components/settings-tabs.component';
import { ToolsSettingsPanel } from './settings/components/tools-settings-panel.component';
import { UpdatesSettingsPanel } from './settings/components/updates-settings-panel.component';
import { CodeEditorSettingsDrawer } from './sub-views/code-editor-settings-drawer.subview';
import { GitToolSettingsDrawer } from './sub-views/git-tool-settings-drawer.subview';
import { TerminalToolSettingsDrawer } from './sub-views/terminal-tool-settings-drawer.subview';
import { ToolInstallationSettingsDrawer } from './sub-views/tool-installation-settings-drawer.subview';

type SettingsViewProps = {
    activeTab?: SettingsTab;
    terminalSettingsOpen?: boolean;
    onTerminalSettingsClose?: () => void;
    onActiveTabChange?: (tab: SettingsTab) => void;
};

/**
 * Renders settings panels and route-requested terminal recovery.
 * @param props - Active tab, optional terminal drawer request and navigation callbacks.
 */
export const SettingsView: React.FC<SettingsViewProps> = ({
    terminalSettingsOpen = false,
    onTerminalSettingsClose,
    activeTab: controlledActiveTab,
    onActiveTabChange,
}) => {
    const { t } = useTranslation(['settings', 'common']);
    const { addCustomConfirm } = useAlerts();
    const { projects, rescanCodeEditorIntegration } = useProjects();
    const [localActiveTab, setLocalActiveTab] =
        useState<SettingsTab>('projects');
    const activeTab = controlledActiveTab ?? localActiveTab;
    const setActiveTab = useCallback(
        (tab: SettingsTab) => {
            if (onActiveTabChange) {
                onActiveTabChange(tab);
                return;
            }

            setLocalActiveTab(tab);
        },
        [onActiveTabChange],
    );
    const { preferences, savePreferences, loadPreferences } = usePreferences();
    const { theme, setTheme } = useTheme();
    const {
        listIntegrationSettings,
        updateIntegrationSettings,
        setDefaultIntegration,
        validateIntegrationPath,
    } = useCodeEditorIntegrations();
    const { listIntegrations, refreshIntegration, rescanIntegration } =
        useToolIntegrations();
    const {
        listIntegrations: listAppIntegrations,
        refresh: refreshAppIntegration,
        manageAccess: manageAppIntegrationAccess,
        disconnect: disconnectAppIntegration,
    } = useAppIntegrations();

    const [appIntegrations, setAppIntegrations] = useState<
        AppIntegrationSummary[]
    >([]);
    const appIntegrationsRef = useRef<AppIntegrationSummary[]>([]);
    appIntegrationsRef.current = appIntegrations;
    const [appIntegrationsLoading, setAppIntegrationsLoading] = useState(false);
    const [appIntegrationsLoadError, setAppIntegrationsLoadError] =
        useState(false);
    const [appIntegrationManagementErrors, setAppIntegrationManagementErrors] =
        useState<
            Partial<
                Record<string, AppIntegrationActionFailureReason | undefined>
            >
        >({});
    const [githubConnectionDialog, setGithubConnectionDialog] = useState<{
        connectionId?: string;
    } | null>(null);

    const [codeEditorSettings, setCodeEditorSettings] = useState<
        CodeEditorIntegrationSettings[]
    >([]);
    const [selectedCodeEditor, setSelectedCodeEditor] =
        useState<CodeEditorIntegrationSettings | null>(null);
    const [codeEditorsLoading, setCodeEditorsLoading] = useState(false);
    const [codeEditorsLoadError, setCodeEditorsLoadError] = useState(false);
    const [pendingCodeEditorId, setPendingCodeEditorId] =
        useState<CodeEditorId | null>(null);
    const [rescanningCodeEditorId, setRescanningCodeEditorId] =
        useState<CodeEditorId | null>(null);
    const [codeEditorActionErrors, setCodeEditorActionErrors] = useState<
        Partial<Record<CodeEditorId, string>>
    >({});

    const [toolIntegrations, setToolIntegrations] = useState<
        ToolIntegrationSummary[]
    >([]);
    const [toolsLoading, setToolsLoading] = useState(false);
    const [toolsLoadError, setToolsLoadError] = useState(false);
    const [pendingToolId, setPendingToolId] = useState<string | null>(null);
    const [toolActionErrors, setToolActionErrors] = useState<
        Record<string, string | undefined>
    >({});
    const [selectedToolId, setSelectedToolId] = useState<string | null>(null);

    /** Loads renderer-safe integration summaries for the Connections panel. */
    const syncAppIntegrations = useCallback(async () => {
        const initialLoad = appIntegrationsRef.current.length === 0;
        if (initialLoad) {
            setAppIntegrationsLoading(true);
        }
        setAppIntegrationsLoadError(false);

        try {
            const listed = await listAppIntegrations();
            setAppIntegrations(listed);
        } catch {
            logger.error('Failed to load app integrations');
            setAppIntegrationsLoadError(true);
        } finally {
            if (initialLoad) {
                setAppIntegrationsLoading(false);
            }
        }
    }, [listAppIntegrations]);

    /** Replaces one renderer-safe app integration summary. */
    const replaceAppIntegration = useCallback(
        (updated: AppIntegrationSummary) => {
            setAppIntegrations((current) =>
                current.map((integration) =>
                    integration.id === updated.id ? updated : integration,
                ),
            );
        },
        [],
    );

    /**
     * Runs one Settings management action and refreshes its renderer-safe state.
     *
     * @param integrationId - Registered integration ID.
     * @param action - Bridge action to run.
     * @returns Whether the action completed successfully.
     */
    const runAppIntegrationAction = useCallback(
        async (
            integrationId: string,
            action: (id: string) => Promise<AppIntegrationActionResult>,
        ): Promise<boolean> => {
            setAppIntegrationManagementErrors((current) => ({
                ...current,
                [integrationId]: undefined,
            }));
            try {
                const result = await action(integrationId);
                replaceAppIntegration(result.integration);
                if (!result.ok) {
                    setAppIntegrationManagementErrors((current) => ({
                        ...current,
                        [integrationId]: result.reason,
                    }));
                }
                return result.ok;
            } catch {
                setAppIntegrationManagementErrors((current) => ({
                    ...current,
                    [integrationId]: 'unknown',
                }));
                void syncAppIntegrations();
                return false;
            }
        },
        [replaceAppIntegration, syncAppIntegrations],
    );

    /** Confirms and removes one local integration connection. */
    const confirmAppIntegrationDisconnect = useCallback(
        (
            integration: AppIntegrationSummary,
            connection: AppIntegrationConnectionSummary,
            accessTarget: AppIntegrationAccessTargetSummary,
        ) => {
            const disconnect = (revokeAuthorisation: boolean) =>
                runAppIntegrationAction(integration.id, () =>
                    disconnectAppIntegration(
                        integration.id,
                        connection.id,
                        accessTarget.id,
                        { revokeAuthorisation },
                    ),
                );
            const revocationAvailable =
                integration.id === 'github' &&
                connection.accessTargets.length === 1;
            if (revocationAvailable) {
                addCustomConfirm(
                    t('connections.disconnectConfirm.title', {
                        connection: accessTarget.login,
                    }),
                    (renderLayout, close) => (
                        <AppIntegrationDisconnectConfirm
                            renderLayout={renderLayout}
                            description={t(
                                'connections.disconnectConfirm.finalDescription',
                            )}
                            close={close}
                            copy={{
                                checkbox: t(
                                    'connections.disconnectConfirm.revokeAllDevices',
                                ),
                                checkedDetail: t(
                                    'connections.disconnectConfirm.revokeDetail',
                                ),
                                checkedAction: t(
                                    'connections.disconnectConfirm.revokeAction',
                                ),
                                uncheckedDetail: t(
                                    'connections.disconnectConfirm.localOnlyWarning',
                                ),
                                uncheckedAction: t(
                                    'connections.disconnectConfirm.localOnlyAction',
                                ),
                                failureDetail: t(
                                    'connections.disconnectConfirm.failureDetail',
                                ),
                                cancel: t('common:buttons.cancel'),
                            }}
                            onConfirm={disconnect}
                        />
                    ),
                    [],
                    undefined,
                    'warning',
                );
                return;
            }

            addCustomConfirm(
                t('connections.disconnectConfirm.title', {
                    connection: accessTarget.login,
                }),
                <p>{t('connections.disconnectConfirm.description')}</p>,
                [
                    {
                        isCancel: true,
                        typeClass: 'btn-ghost',
                        text: t('common:buttons.cancel'),
                    },
                    {
                        typeClass: 'btn-error',
                        text: t('connections.actions.disconnect'),
                        onClick: () => disconnect(false),
                    },
                ],
                undefined,
                'warning',
            );
        },
        [
            addCustomConfirm,
            disconnectAppIntegration,
            runAppIntegrationAction,
            t,
        ],
    );

    /**
     * Refreshes one integration without presenting it as a browser action.
     *
     * @param integrationId - Registered integration ID.
     */
    const refreshAppIntegrationState = useCallback(
        (integrationId: string) => {
            const integration = appIntegrationsRef.current.find(
                (candidate) => candidate.id === integrationId,
            );
            if (integration?.connectionStage) {
                return;
            }
            void runAppIntegrationAction(integrationId, refreshAppIntegration);
        },
        [refreshAppIntegration, runAppIntegrationAction],
    );

    /** Opens the shared GitHub connection dialog for a new or existing account. */
    const openGitHubConnection = useCallback((connectionId?: string) => {
        setGithubConnectionDialog(
            connectionId === undefined ? {} : { connectionId },
        );
    }, []);

    /** Closes the GitHub dialog and refreshes the Settings connection summaries. */
    const closeGitHubConnection = useCallback(() => {
        setGithubConnectionDialog(null);
        void syncAppIntegrations();
    }, [syncAppIntegrations]);

    useEffect(() => {
        if (activeTab !== 'connections') {
            return;
        }

        void syncAppIntegrations();
        const handleFocus = () => {
            if (githubConnectionDialog) return;
            for (const integration of appIntegrationsRef.current) {
                if (
                    integration.connections.length > 0 &&
                    integration.state !== 'connecting'
                ) {
                    refreshAppIntegrationState(integration.id);
                }
            }
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [
        activeTab,
        githubConnectionDialog,
        refreshAppIntegrationState,
        syncAppIntegrations,
    ]);

    const quickCheckTools = useCallback(async () => {
        return await listIntegrations();
    }, [listIntegrations]);

    const replaceToolIntegration = useCallback(
        (updated: ToolIntegrationSummary) => {
            setToolIntegrations((current) =>
                current.map((tool) =>
                    tool.id === updated.id ? updated : tool,
                ),
            );
            setToolActionErrors((current) => ({
                ...current,
                [updated.id]: undefined,
            }));
        },
        [],
    );

    const rescanTool = useCallback(
        async (tool: ToolIntegrationSummary): Promise<boolean> => {
            if (pendingToolId) {
                return false;
            }
            setPendingToolId(tool.id);
            setToolActionErrors((current) => ({
                ...current,
                [tool.id]: undefined,
            }));
            try {
                replaceToolIntegration(await rescanIntegration(tool.id));
                return true;
            } catch {
                logger.error('Failed to rescan tool integration');
                setToolActionErrors((current) => ({
                    ...current,
                    [tool.id]: t('tools.errors.rescan'),
                }));
                return false;
            } finally {
                setPendingToolId(null);
            }
        },
        [pendingToolId, replaceToolIntegration, rescanIntegration, t],
    );

    const rescanToolById = useCallback(
        async (toolId: string): Promise<boolean> => {
            const tool = toolIntegrations.find(
                (integration) => integration.id === toolId,
            );
            if (tool) {
                return await rescanTool(tool);
            }
            return false;
        },
        [rescanTool, toolIntegrations],
    );

    const selectedTool = useMemo(
        () =>
            toolIntegrations.find((tool) => tool.id === selectedToolId) ?? null,
        [selectedToolId, toolIntegrations],
    );

    const syncTools = useCallback(async () => {
        setToolsLoading(true);
        setToolsLoadError(false);
        try {
            const tools = await quickCheckTools();
            setToolIntegrations(tools);
            setToolActionErrors({});
        } catch {
            logger.error('Failed to load tool integrations');
            setToolsLoadError(true);
        } finally {
            setToolsLoading(false);
        }
    }, [quickCheckTools]);

    useEffect(() => {
        if (activeTab !== 'tools') {
            return;
        }

        let disposed = false;

        const syncVisibleTools = async () => {
            await syncTools();
        };

        void syncVisibleTools();

        const handleFocus = () => {
            if (!disposed) {
                void syncVisibleTools();
            }
        };

        window.addEventListener('focus', handleFocus);

        return () => {
            disposed = true;
            window.removeEventListener('focus', handleFocus);
        };
    }, [activeTab, syncTools]);

    useEffect(() => {
        if (activeTab !== 'codeEditors') {
            return;
        }

        let disposed = false;

        const syncCodeEditors = async () => {
            setCodeEditorsLoading(true);
            setCodeEditorsLoadError(false);

            try {
                const settings = await listIntegrationSettings();

                if (!disposed) {
                    setCodeEditorSettings(settings);
                    setCodeEditorActionErrors({});
                }
            } catch (error) {
                logger.error('Failed to load code editor integrations', error);
                if (!disposed) {
                    setCodeEditorsLoadError(true);
                }
            } finally {
                if (!disposed) {
                    setCodeEditorsLoading(false);
                }
            }
        };

        void syncCodeEditors();

        return () => {
            disposed = true;
        };
    }, [activeTab, listIntegrationSettings]);

    const replaceCodeEditorSettings = (
        updatedSettings: CodeEditorIntegrationSettings,
        syncProjectHealth = true,
    ) => {
        setCodeEditorSettings((currentSettings) =>
            currentSettings.map((current) =>
                current.integration.id === updatedSettings.integration.id
                    ? updatedSettings
                    : current,
            ),
        );
        setCodeEditorActionErrors((current) => ({
            ...current,
            [updatedSettings.integration.id]: undefined,
        }));
        if (syncProjectHealth) {
            void rescanCodeEditorIntegration(
                updatedSettings.integration.id,
            ).catch((error) => {
                logger.error('Failed to synchronize code editor health', error);
            });
        }
        void loadPreferences();
    };

    const applyCodeEditorEnabled = async (
        currentSettings: CodeEditorIntegrationSettings,
        enabled: boolean,
    ): Promise<boolean> => {
        if (pendingCodeEditorId) {
            return false;
        }

        const integrationId = currentSettings.integration.id;
        setPendingCodeEditorId(integrationId);
        setCodeEditorActionErrors((current) => ({
            ...current,
            [integrationId]: undefined,
        }));

        try {
            const updatedSettings = await updateIntegrationSettings(
                integrationId,
                {
                    enabled,
                    customPath: currentSettings.customPath,
                    execFlagsOverride: currentSettings.execFlagsOverride,
                },
            );
            replaceCodeEditorSettings(updatedSettings);
            return true;
        } catch (error) {
            logger.error(
                `Failed to ${enabled ? 'enable' : 'disable'} code editor integration`,
                error,
            );
            setCodeEditorActionErrors((current) => ({
                ...current,
                [integrationId]: t('codeEditors.messages.integrationError', {
                    editor: currentSettings.integration.displayName,
                    error: t('codeEditors.drawer.errors.save'),
                }),
            }));
            return false;
        } finally {
            setPendingCodeEditorId((current) =>
                current === integrationId ? null : current,
            );
        }
    };

    const setCodeEditorEnabled = async (
        currentSettings: CodeEditorIntegrationSettings,
        enabled: boolean,
    ) => {
        if (enabled) {
            await applyCodeEditorEnabled(currentSettings, true);
            return;
        }

        if (
            confirmCodeEditorDisable(currentSettings, () =>
                applyCodeEditorEnabled(currentSettings, false),
            )
        ) {
            return;
        }

        await applyCodeEditorEnabled(currentSettings, false);
    };

    const confirmCodeEditorDisable = (
        currentSettings: CodeEditorIntegrationSettings,
        onConfirm: () => Promise<boolean>,
    ): boolean => {
        const usage = getCodeEditorProjectUsage(
            projects,
            currentSettings.integration.id,
        );
        if (usage.count === 0) {
            return false;
        }

        addCustomConfirm(
            t('codeEditors.disableConfirm.title', {
                editor: currentSettings.integration.displayName,
            }),
            <div className="flex flex-col gap-[12px]">
                <div className="alert alert-warning alert-soft text-warning-content dark:text-warning">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <Trans
                            ns="settings"
                            i18nKey="codeEditors.disableConfirm.usage"
                            values={{
                                count: usage.count,
                                dotnetCount: usage.dotnetCount,
                            }}
                            components={{
                                Projects: (
                                    <span className="inline-flex items-center gap-2" />
                                ),
                                Dotnet: (
                                    <span className="inline-flex items-center gap-2" />
                                ),
                                Count: (
                                    <span className="badge badge-sm badge-warning font-semibold text-warning-content" />
                                ),
                            }}
                        />
                    </div>
                </div>
                <p>{t('codeEditors.disableConfirm.newProjects')}</p>
                <p className="text-base-content/75">
                    {t('codeEditors.disableConfirm.existingProjects')}
                </p>
            </div>,
            [
                {
                    isCancel: true,
                    typeClass: 'btn-ghost',
                    text: t('common:buttons.cancel'),
                },
                {
                    typeClass: 'btn-warning',
                    text: t('codeEditors.disableConfirm.disable'),
                    onClick: onConfirm,
                },
            ],
            undefined,
            'warning',
        );

        return true;
    };

    const rescanCodeEditor = async (
        currentSettings: CodeEditorIntegrationSettings,
    ) => {
        if (pendingCodeEditorId) {
            return;
        }

        const integrationId = currentSettings.integration.id;
        setPendingCodeEditorId(integrationId);
        setRescanningCodeEditorId(integrationId);
        try {
            const updatedSettings =
                await rescanCodeEditorIntegration(integrationId);
            replaceCodeEditorSettings(updatedSettings, false);
        } catch (error) {
            logger.error('Failed to rescan code editor integration', error);
            setCodeEditorActionErrors((current) => ({
                ...current,
                [integrationId]: t('codeEditors.messages.integrationError', {
                    editor: currentSettings.integration.displayName,
                    error: t('codeEditors.status.rescanFailed'),
                }),
            }));
        } finally {
            setPendingCodeEditorId(null);
            setRescanningCodeEditorId(null);
        }
    };

    const setDefaultCodeEditor = async (
        currentSettings: CodeEditorIntegrationSettings,
    ) => {
        if (pendingCodeEditorId) {
            return;
        }

        const integrationId = currentSettings.integration.id;
        setPendingCodeEditorId(integrationId);
        setCodeEditorActionErrors((current) => ({
            ...current,
            [integrationId]: undefined,
        }));

        try {
            const updatedSettings = await setDefaultIntegration(integrationId);
            setCodeEditorSettings(updatedSettings);
        } catch (error) {
            logger.error(
                'Failed to set default code editor integration',
                error,
            );
            setCodeEditorActionErrors((current) => ({
                ...current,
                [integrationId]: t('codeEditors.messages.integrationError', {
                    editor: currentSettings.integration.displayName,
                    error: t('codeEditors.drawer.errors.save'),
                }),
            }));
        } finally {
            setPendingCodeEditorId((current) =>
                current === integrationId ? null : current,
            );
        }
    };

    const codeEditorProjectUsage = useMemo(
        () =>
            Object.fromEntries(
                codeEditorSettings.map((settings) => {
                    return [
                        settings.integration.id,
                        getCodeEditorProjectUsage(
                            projects,
                            settings.integration.id,
                        ),
                    ];
                }),
            ),
        [codeEditorSettings, projects],
    );

    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-[16px] p-1">
            <h1
                data-testid="settingsTitle"
                className="shrink-0 pl-3 text-[20px] font-semibold"
            >
                {t('title')}
            </h1>

            <div className="flex min-h-0 flex-1 flex-col">
                <SettingsTabs
                    activeTab={activeTab}
                    t={t}
                    onActiveTabChange={setActiveTab}
                />

                <div
                    className="flex min-h-0 flex-1 flex-col overflow-hidden bg-base-100"
                    data-testid="settingsPanelContainer"
                >
                    <div className="min-h-0 flex-1 overflow-y-auto p-[24px]">
                        <ProjectsSettingsPanel
                            active={activeTab === 'projects'}
                        />
                        <InstallsSettingsPanel
                            active={activeTab === 'installs'}
                        />
                        <AppearanceSettingsPanel
                            active={activeTab === 'appearance'}
                            theme={theme}
                            onThemeChange={setTheme}
                        />
                        <BehaviorSettingsPanel
                            active={activeTab === 'behavior'}
                            t={t}
                            preferences={preferences}
                            onPreferencesChange={savePreferences}
                        />
                        <CodeEditorSettingsPanel
                            active={activeTab === 'codeEditors'}
                            t={t}
                            settings={codeEditorSettings}
                            onEdit={setSelectedCodeEditor}
                            onRescan={rescanCodeEditor}
                            onEnabledChange={setCodeEditorEnabled}
                            onSetDefault={setDefaultCodeEditor}
                            loading={codeEditorsLoading}
                            loadError={codeEditorsLoadError}
                            pendingIntegrationId={pendingCodeEditorId}
                            rescanningIntegrationId={rescanningCodeEditorId}
                            projectUsage={codeEditorProjectUsage}
                            actionErrors={codeEditorActionErrors}
                        />
                        <ToolsSettingsPanel
                            active={activeTab === 'tools'}
                            t={t}
                            tools={toolIntegrations}
                            loading={toolsLoading}
                            loadError={toolsLoadError}
                            pendingToolId={pendingToolId}
                            actionErrors={toolActionErrors}
                            onEdit={(tool) => setSelectedToolId(tool.id)}
                            onRescan={rescanTool}
                        />
                        <ConnectionsSettingsPanel
                            active={activeTab === 'connections'}
                            t={t}
                            integrations={appIntegrations}
                            loading={appIntegrationsLoading}
                            loadError={appIntegrationsLoadError}
                            actionErrors={appIntegrationManagementErrors}
                            onRetry={() => void syncAppIntegrations()}
                            connectionDialogOpen={
                                githubConnectionDialog !== null
                            }
                            onOpenConnection={openGitHubConnection}
                            onRefresh={refreshAppIntegrationState}
                            onManageAccess={(
                                integrationId,
                                connectionId,
                                accessTargetId,
                            ) =>
                                void runAppIntegrationAction(
                                    integrationId,
                                    () =>
                                        manageAppIntegrationAccess(
                                            integrationId,
                                            connectionId,
                                            accessTargetId,
                                        ),
                                )
                            }
                            onDisconnect={confirmAppIntegrationDisconnect}
                        />
                        <UpdatesSettingsPanel
                            active={activeTab === 'updates'}
                        />
                    </div>
                </div>
            </div>
            <CodeEditorSettingsDrawer
                settings={selectedCodeEditor}
                open={Boolean(selectedCodeEditor)}
                onOpenChange={(drawerOpen) => {
                    if (!drawerOpen) {
                        setSelectedCodeEditor(null);
                    }
                }}
                onValidatePath={validateIntegrationPath}
                onSave={updateIntegrationSettings}
                onConfirmDisable={confirmCodeEditorDisable}
                onSaved={replaceCodeEditorSettings}
            />
            <GitToolSettingsDrawer
                tool={selectedTool}
                open={Boolean(selectedTool)}
                onOpenChange={(drawerOpen) => {
                    if (!drawerOpen) {
                        setSelectedToolId(null);
                    }
                }}
                onRescan={rescanToolById}
            />
            <ToolInstallationSettingsDrawer
                tool={selectedTool}
                open={Boolean(selectedTool)}
                onOpenChange={(drawerOpen) => {
                    if (!drawerOpen) {
                        setSelectedToolId(null);
                    }
                }}
                onRescan={rescanToolById}
            />
            <TerminalToolSettingsDrawer
                open={selectedToolId === 'terminal' || terminalSettingsOpen}
                onOpenChange={(drawerOpen) => {
                    if (!drawerOpen) {
                        setSelectedToolId(null);
                        if (terminalSettingsOpen) onTerminalSettingsClose?.();
                    }
                }}
                onSummaryChanged={async () => {
                    replaceToolIntegration(
                        await refreshIntegration('terminal'),
                    );
                }}
            />
            {githubConnectionDialog && (
                <GitHubConnectionDialog
                    connectionId={githubConnectionDialog.connectionId}
                    onConnected={closeGitHubConnection}
                    onCancel={closeGitHubConnection}
                />
            )}
        </div>
    );
};
