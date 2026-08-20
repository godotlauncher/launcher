import type {
    AppIntegrationSummary,
    CodeEditorId,
    CodeEditorIntegrationSettings,
    ToolIntegrationSummary,
} from '@shared/contracts';
import logger from 'electron-log';
import { TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlerts } from '../hooks/useAlerts';
import { useAppIntegrations } from '../hooks/useAppIntegrations';
import { useCodeEditorIntegrations } from '../hooks/useCodeEditorIntegrations';
import { usePreferences } from '../hooks/usePreferences';
import { useProjects } from '../hooks/useProjects';
import { useTheme } from '../hooks/useTheme';
import { useToolIntegrations } from '../hooks/useToolIntegrations';
import type { SettingsTab } from '../routes';
import { getCodeEditorProjectUsage } from './projects/projectCodeEditorHealth.model';
import { AppearanceSettingsPanel } from './settings/components/appearanceSettingsPanel.component';
import { BehaviorSettingsPanel } from './settings/components/behaviorSettingsPanel.component';
import { CodeEditorSettingsPanel } from './settings/components/codeEditorSettingsPanel.component';
import { ConnectionsSettingsPanel } from './settings/components/connectionsSettingsPanel.component';
import { InstallsSettingsPanel } from './settings/components/installsSettingsPanel.component';
import { ProjectsSettingsPanel } from './settings/components/projectsSettingsPanel.component';
import { SettingsTabs } from './settings/components/settingsTabs.component';
import { ToolsSettingsPanel } from './settings/components/toolsSettingsPanel.component';
import { UpdatesSettingsPanel } from './settings/components/updatesSettingsPanel.component';
import { CodeEditorSettingsDrawer } from './subViews/codeEditorSettingsDrawer.subview';
import { GitToolSettingsDrawer } from './subViews/git-tool-settings-drawer.subview';
import { ToolInstallationSettingsDrawer } from './subViews/tool-installation-settings-drawer.subview';

type SettingsViewProps = {
    activeTab?: SettingsTab;
    onActiveTabChange?: (tab: SettingsTab) => void;
};

export const SettingsView: React.FC<SettingsViewProps> = ({
    activeTab: controlledActiveTab,
    onActiveTabChange,
}) => {
    const { t } = useTranslation(['settings', 'common']);
    const { addCustomConfirm } = useAlerts();
    const { projects, rescanCodeEditorIntegration } = useProjects();
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
    const { preferences, savePreferences, loadPreferences } = usePreferences();
    const { theme, setTheme } = useTheme();
    const {
        listIntegrationSettings,
        updateIntegrationSettings,
        setDefaultIntegration,
        validateIntegrationPath,
    } = useCodeEditorIntegrations();
    const { listIntegrations, rescanIntegration } = useToolIntegrations();
    const { listIntegrations: listAppIntegrations } = useAppIntegrations();

    const [appIntegrations, setAppIntegrations] = useState<
        AppIntegrationSummary[]
    >([]);
    const [appIntegrationsLoading, setAppIntegrationsLoading] = useState(false);
    const [appIntegrationsLoadError, setAppIntegrationsLoadError] =
        useState(false);

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
        setAppIntegrationsLoading(true);
        setAppIntegrationsLoadError(false);

        try {
            setAppIntegrations(await listAppIntegrations());
        } catch {
            logger.error('Failed to load app integrations');
            setAppIntegrationsLoadError(true);
        } finally {
            setAppIntegrationsLoading(false);
        }
    }, [listAppIntegrations]);

    useEffect(() => {
        if (activeTab === 'connections') {
            void syncAppIntegrations();
        }
    }, [activeTab, syncAppIntegrations]);

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
            <div className="flex flex-col gap-2">
                <p>
                    {t('codeEditors.disableConfirm.usage', {
                        count: usage.count,
                        dotnetCount: usage.dotnetCount,
                    })}
                </p>
                <p>{t('codeEditors.disableConfirm.existingProjects')}</p>
                <p>{t('codeEditors.disableConfirm.newProjects')}</p>
            </div>,
            [
                {
                    typeClass: 'btn-warning',
                    text: t('codeEditors.disableConfirm.disable'),
                    onClick: onConfirm,
                },
                {
                    isCancel: true,
                    typeClass: 'btn-ghost',
                    text: t('common:buttons.cancel'),
                },
            ],
            <TriangleAlert className="stroke-warning" />,
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
                    className="flex flex-col py-6 flex-1 max-h-full border border-base-300 border-t-0 bg-base-100 rounded-box rounded-t-none overflow-hidden"
                    data-testid="settingsPanelContainer"
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
                            onRetry={() => void syncAppIntegrations()}
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
        </div>
    );
};
