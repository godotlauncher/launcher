import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    InstalledRelease,
    ProjectDetails,
    RenameProjectOptions,
    RenameProjectResult,
} from '@shared/contracts';
import clsx from 'clsx';
import { GitBranch, PanelTop, Pin } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appBridge } from '../../bridge.ts';
import { getSelectableReleaseKey } from '../../components/selectInstalledRelease/selectInstalledRelease.model';
import { CopyBadge } from '../../components/ui/copyBadge.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import {
    SelectField,
    type SelectFieldOption,
} from '../../components/ui/selectField.component';
import { TextField } from '../../components/ui/textField.component';
import { useAlerts } from '../../hooks/useAlerts';
import { useCodeEditorIntegrations } from '../../hooks/useCodeEditorIntegrations';
import { ProjectCodeEditorSection } from './projectSettingsDrawer/components/projectCodeEditorSection.component';
import {
    canRenameGodotProject,
    hasProjectCodeEditorChanges,
    hasProjectRenameChanges,
    validateProjectRenameName,
} from './projectSettingsDrawer/projectSettings.model';

type ProjectSettingsTab = 'project' | 'sourceControl' | 'codeEditor' | 'launch';

const projectSettingsTabs: ProjectSettingsTab[] = [
    'project',
    'sourceControl',
    'codeEditor',
    'launch',
];

type ProjectSettingsDrawerProps = {
    project: ProjectDetails | null;
    open: boolean;
    installedReleases: InstalledRelease[];
    onOpenChange: (open: boolean) => void;
    onRenameProject: (
        project: ProjectDetails,
        options: RenameProjectOptions,
    ) => Promise<RenameProjectResult>;
    onSetProjectEditor: (
        project: ProjectDetails,
        release: InstalledRelease,
    ) => Promise<ProjectDetails>;
    onSetProjectCodeEditor: (
        project: ProjectDetails,
        codeEditorId: CodeEditorId | null,
    ) => Promise<ProjectDetails>;
    onSetProjectWindowed: (
        project: ProjectDetails,
        windowed: boolean,
    ) => Promise<ProjectDetails>;
    onInitializeProjectGit: (
        project: ProjectDetails,
    ) => Promise<ProjectDetails>;
    onResetProjectCodeEditorConfig: (
        project: ProjectDetails,
    ) => Promise<ProjectDetails>;
    getProjectGodotName: (project: ProjectDetails) => Promise<string | null>;
};

type Translate = (key: string) => string;

function getReleaseLabel(release: InstalledRelease, t: Translate): string {
    const name = release.name ?? release.version;
    const labels = [
        release.mono ? t('installs:badges.dotNet') : null,
        release.prerelease ? t('installs:badges.prerelease') : null,
        release.source === 'custom' ? t('installs:badges.custom') : null,
    ].filter(Boolean);

    return labels.length > 0 ? `${name} (${labels.join(', ')})` : name;
}

export const ProjectSettingsDrawer: React.FC<ProjectSettingsDrawerProps> = ({
    project,
    open,
    installedReleases,
    onOpenChange,
    onRenameProject,
    onSetProjectEditor,
    onSetProjectCodeEditor,
    onSetProjectWindowed,
    onInitializeProjectGit,
    onResetProjectCodeEditorConfig,
    getProjectGodotName,
}) => {
    const { t } = useTranslation([
        'projects',
        'common',
        'installs',
        'createProject',
    ]);
    const { addCustomConfirm } = useAlerts();
    const { listIntegrationSettings } = useCodeEditorIntegrations();
    const [activeTab, setActiveTab] = useState<ProjectSettingsTab>('project');
    const [initialName, setInitialName] = useState('');
    const [name, setName] = useState('');
    const [initialReleaseKey, setInitialReleaseKey] = useState('');
    const [releaseKey, setReleaseKey] = useState('');
    const [initialWindowed, setInitialWindowed] = useState(false);
    const [windowed, setWindowed] = useState(false);
    const [withGit, setWithGit] = useState(false);
    const [gitAvailable, setGitAvailable] = useState(false);
    const [loadingGitAvailability, setLoadingGitAvailability] = useState(false);
    const [isInitializingGit, setIsInitializingGit] = useState(false);
    const [godotProjectName, setGodotProjectName] = useState<string | null>(
        null,
    );
    const [loadingGodotName, setLoadingGodotName] = useState(false);
    const [renameGodotProject, setRenameGodotProject] = useState(false);
    const [nameError, setNameError] = useState<string>();
    const [godotError, setGodotError] = useState<string>();
    const [formError, setFormError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [initialCodeEditorId, setInitialCodeEditorId] =
        useState<CodeEditorId | null>(null);
    const [codeEditorId, setCodeEditorId] = useState<CodeEditorId | null>(null);
    const [codeEditorTouched, setCodeEditorTouched] = useState(false);
    const [codeEditorSettings, setCodeEditorSettings] = useState<
        CodeEditorIntegrationSettings[]
    >([]);
    const [loadingCodeEditors, setLoadingCodeEditors] = useState(false);
    const [codeEditorLoadFailed, setCodeEditorLoadFailed] = useState(false);

    useEffect(() => {
        if (!open || !project) {
            return;
        }

        let disposed = false;
        const currentReleaseKey = getSelectableReleaseKey(project.release);

        setActiveTab('project');
        setInitialName(project.name);
        setName(project.name);
        setInitialReleaseKey(currentReleaseKey);
        setReleaseKey(currentReleaseKey);
        setInitialWindowed(Boolean(project.open_windowed));
        setWindowed(Boolean(project.open_windowed));
        setWithGit(project.withGit);
        setIsInitializingGit(false);
        setGodotProjectName(null);
        setRenameGodotProject(false);
        setNameError(undefined);
        setGodotError(undefined);
        setFormError(undefined);
        setIsSubmitting(false);
        setLoadingGodotName(true);

        getProjectGodotName(project)
            .then((currentGodotProjectName) => {
                if (!disposed) {
                    setGodotProjectName(currentGodotProjectName);
                }
            })
            .catch(() => {
                if (!disposed) {
                    setGodotProjectName(null);
                }
            })
            .finally(() => {
                if (!disposed) {
                    setLoadingGodotName(false);
                }
            });

        return () => {
            disposed = true;
        };
    }, [getProjectGodotName, open, project]);

    useEffect(() => {
        if (!open) {
            return;
        }

        let disposed = false;
        setGitAvailable(false);
        setLoadingGitAvailability(true);

        appBridge
            .getCachedTools({ refreshIfStale: false })
            .then((tools) => {
                if (!disposed) {
                    setGitAvailable(
                        tools.some(
                            (tool) => tool.name === 'Git' && tool.verified,
                        ),
                    );
                }
            })
            .catch(() => {
                if (!disposed) {
                    setGitAvailable(false);
                }
            })
            .finally(() => {
                if (!disposed) {
                    setLoadingGitAvailability(false);
                }
            });

        return () => {
            disposed = true;
        };
    }, [open]);

    useEffect(() => {
        if (!open || !project) {
            return;
        }

        let disposed = false;
        const currentCodeEditorId = project.codeEditorId ?? null;

        setInitialCodeEditorId(currentCodeEditorId);
        setCodeEditorId(currentCodeEditorId);
        setCodeEditorTouched(false);
        setCodeEditorSettings([]);
        setCodeEditorLoadFailed(false);
        setLoadingCodeEditors(true);

        listIntegrationSettings()
            .then((settings) => {
                if (!disposed) {
                    setCodeEditorSettings(settings);
                }
            })
            .catch(() => {
                if (!disposed) {
                    setCodeEditorLoadFailed(true);
                }
            })
            .finally(() => {
                if (!disposed) {
                    setLoadingCodeEditors(false);
                }
            });

        return () => {
            disposed = true;
        };
    }, [listIntegrationSettings, open, project]);

    const selectableReleases = useMemo(() => {
        if (!project) {
            return [];
        }

        const currentMajor = Math.trunc(project.release.version_number);
        return installedReleases.filter(
            (release) =>
                release.valid !== false &&
                Boolean(release.editor_path) &&
                Math.trunc(release.version_number) >= currentMajor,
        );
    }, [installedReleases, project]);

    const releaseOptions = useMemo<SelectFieldOption[]>(() => {
        const options: SelectFieldOption[] = selectableReleases.map(
            (release) => ({
                value: getSelectableReleaseKey(release),
                label: getReleaseLabel(release, t),
            }),
        );

        if (
            project &&
            !options.some(
                (option) =>
                    option.value === getSelectableReleaseKey(project.release),
            )
        ) {
            options.unshift({
                value: getSelectableReleaseKey(project.release),
                label: `${getReleaseLabel(project.release, t)} (${t('editProject.godotEditor.unavailable')})`,
                disabled: true,
            });
        }

        return options;
    }, [project, selectableReleases, t]);

    const getValidationMessage = (
        validationError: ReturnType<typeof validateProjectRenameName>,
    ): string | undefined => {
        if (!validationError) {
            return undefined;
        }

        return t(`editProject.validation.${validationError}`);
    };

    const validateNameField = (): boolean => {
        const validationMessage = getValidationMessage(
            validateProjectRenameName(name),
        );
        setNameError(validationMessage);
        return !validationMessage;
    };

    const handleNameChange = (value: string) => {
        setName(value);
        setNameError(undefined);
        setFormError(undefined);
        setGodotError(undefined);

        if (!canRenameGodotProject(value, godotProjectName)) {
            setRenameGodotProject(false);
        }
    };

    const handleCodeEditorChange = (nextCodeEditorId: CodeEditorId | null) => {
        setCodeEditorId(nextCodeEditorId);
        setCodeEditorTouched(true);
        setFormError(undefined);
    };

    const handleInitializeGit = async () => {
        if (!project || withGit) {
            return;
        }

        setIsInitializingGit(true);
        setFormError(undefined);
        try {
            const updatedProject = await onInitializeProjectGit(project);
            setWithGit(updatedProject.withGit);
        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
                    : t('editProject.sourceControl.initFailed'),
            );
        } finally {
            setIsInitializingGit(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!project || !validateNameField()) {
            setActiveTab('project');
            return;
        }

        setIsSubmitting(true);
        setFormError(undefined);
        setGodotError(undefined);

        try {
            let currentProject = project;
            const renameChanged = hasProjectRenameChanges(
                initialName,
                godotProjectName,
                name,
                renameGodotProject,
            );
            const codeEditorChanged = hasProjectCodeEditorChanges(
                initialCodeEditorId,
                codeEditorId,
                codeEditorTouched,
            );
            const releaseChanged = initialReleaseKey !== releaseKey;
            const windowedChanged = initialWindowed !== windowed;

            if (renameChanged) {
                const result = await onRenameProject(project, {
                    name: name.trim(),
                    renameGodotProject,
                });

                if (!result.success) {
                    const message =
                        result.error ?? t('editProject.updateFailed');
                    setFormError(message);
                    setActiveTab('project');

                    if (result.errorField === 'name') {
                        setNameError(message);
                    } else if (result.errorField === 'godot') {
                        setGodotError(message);
                    }

                    return;
                }

                const updatedName = result.project?.name ?? name.trim();
                currentProject = result.project ?? {
                    ...currentProject,
                    name: updatedName,
                };
                setInitialName(updatedName);
                setName(updatedName);
                if (renameGodotProject) {
                    setGodotProjectName(updatedName);
                }
                setRenameGodotProject(false);
            }

            if (codeEditorChanged) {
                currentProject = await onSetProjectCodeEditor(
                    currentProject,
                    codeEditorId,
                );
                setInitialCodeEditorId(codeEditorId);
                setCodeEditorTouched(false);
            }

            if (releaseChanged) {
                const selectedRelease = selectableReleases.find(
                    (release) =>
                        getSelectableReleaseKey(release) === releaseKey,
                );
                if (!selectedRelease) {
                    throw new Error(t('editProject.godotEditor.unavailable'));
                }
                currentProject = await onSetProjectEditor(
                    currentProject,
                    selectedRelease,
                );
                setInitialReleaseKey(releaseKey);
            }

            if (windowedChanged) {
                await onSetProjectWindowed(currentProject, windowed);
                setInitialWindowed(windowed);
            }

            onOpenChange(false);
        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
                    : t('editProject.updateFailed'),
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const trimmedName = name.trim();
    const godotProjectAvailable = godotProjectName !== null;
    const godotRenameEnabled = canRenameGodotProject(name, godotProjectName);
    const hasRenameChanges =
        project &&
        hasProjectRenameChanges(
            initialName,
            godotProjectName,
            name,
            renameGodotProject,
        );
    const hasCodeEditorChanges =
        project &&
        hasProjectCodeEditorChanges(
            initialCodeEditorId,
            codeEditorId,
            codeEditorTouched,
        );
    const hasReleaseChanges = project && initialReleaseKey !== releaseKey;
    const hasWindowedChanges = project && initialWindowed !== windowed;
    const hasChanges =
        hasRenameChanges ||
        hasCodeEditorChanges ||
        hasReleaseChanges ||
        hasWindowedChanges;
    const selectedCodeEditorSettings = codeEditorId
        ? codeEditorSettings.find(
              (settings) => settings.integration.id === codeEditorId,
          )
        : undefined;
    const selectedCodeEditorName =
        selectedCodeEditorSettings?.integration.displayName ?? codeEditorId;
    const showResetCodeEditorConfig =
        initialCodeEditorId !== null && initialCodeEditorId === codeEditorId;
    const requestCodeEditorConfigReset = () => {
        if (!project || !selectedCodeEditorName) {
            return;
        }

        addCustomConfirm(
            t('editProject.codeEditor.resetConfig.confirmTitle', {
                editor: selectedCodeEditorName,
            }),
            <p>{t('editProject.codeEditor.resetConfig.confirmMessage')}</p>,
            [
                {
                    typeClass: 'btn-primary',
                    text: t('editProject.codeEditor.resetConfig.label'),
                    onClick: async () => {
                        try {
                            await onResetProjectCodeEditorConfig(project);
                        } catch (error) {
                            setFormError(
                                error instanceof Error
                                    ? error.message
                                    : t('editProject.updateFailed'),
                            );
                        }
                        return true;
                    },
                },
                {
                    isCancel: true,
                    typeClass: 'btn-ghost',
                    text: t('common:buttons.cancel'),
                },
            ],
        );
    };
    const saveDisabled =
        !project ||
        trimmedName.length === 0 ||
        !hasChanges ||
        isSubmitting ||
        loadingGodotName;
    const drawerTitle = project
        ? t('editProject.drawerTitle', { project: project.name })
        : t('editProject.title');

    return (
        <Drawer
            open={open && Boolean(project)}
            onOpenChange={onOpenChange}
            side="right"
            ariaLabel={drawerTitle}
            width={560}
            panelClassName="max-w-[100vw]"
        >
            <Drawer.Header>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <Drawer.Title>{drawerTitle}</Drawer.Title>
                        {project?.pinned && (
                            <span className="badge badge-primary badge-outline badge-sm gap-1">
                                <Pin size={12} />
                                {t('editProject.pinned.label')}
                            </span>
                        )}
                    </div>
                    {project && (
                        <CopyBadge
                            value={project.path}
                            label={t('common:buttons.copyPath')}
                            copiedLabel={t('common:success')}
                            className="w-full rounded-lg bg-base-100/80"
                        />
                    )}
                </div>
                <Drawer.CloseButton />
            </Drawer.Header>
            <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(event) => void handleSubmit(event)}
            >
                <div
                    role="tablist"
                    className="grid shrink-0 grid-cols-4 border-b border-base-300 px-5 pt-2"
                >
                    {projectSettingsTabs.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            data-testid={`tabProjectSettings_${tab}`}
                            aria-selected={activeTab === tab}
                            className={clsx(
                                'border-b-2 px-2 py-3 text-sm font-medium transition-colors',
                                activeTab === tab
                                    ? 'border-primary text-base-content'
                                    : 'border-transparent text-base-content/55 hover:text-base-content',
                            )}
                            onClick={() => setActiveTab(tab)}
                        >
                            {t(`editProject.tabs.${tab}`)}
                        </button>
                    ))}
                </div>

                <Drawer.Body className="flex flex-col gap-4">
                    {formError && (
                        <div className="alert alert-error alert-soft">
                            {formError}
                        </div>
                    )}

                    {activeTab === 'project' && (
                        <div className="flex flex-col gap-4">
                            <TextField
                                id="projectEditName"
                                label={t('editProject.fields.name.label')}
                                help={t('editProject.fields.name.help')}
                                value={name}
                                onChange={handleNameChange}
                                onBlur={validateNameField}
                                placeholder={t(
                                    'editProject.fields.name.placeholder',
                                )}
                                error={nameError}
                            />

                            <label
                                className={clsx(
                                    'flex items-start gap-3 rounded-lg border p-3',
                                    godotError
                                        ? 'border-error bg-error/5'
                                        : 'border-base-300 bg-base-200/40',
                                    (!godotProjectAvailable ||
                                        loadingGodotName ||
                                        !godotRenameEnabled) &&
                                        'opacity-70',
                                )}
                            >
                                <input
                                    type="checkbox"
                                    className={clsx(
                                        'checkbox checkbox-primary mt-0.5',
                                        godotError && 'checkbox-error',
                                    )}
                                    checked={renameGodotProject}
                                    disabled={
                                        !godotProjectAvailable ||
                                        loadingGodotName ||
                                        !godotRenameEnabled
                                    }
                                    onChange={(event) => {
                                        setRenameGodotProject(
                                            event.currentTarget.checked,
                                        );
                                        setGodotError(undefined);
                                        setFormError(undefined);
                                    }}
                                />
                                <span className="flex min-w-0 flex-col gap-1">
                                    <span className="font-semibold">
                                        {t('editProject.godot.renameLabel')}
                                    </span>
                                    <span className="text-sm text-base-content/70">
                                        {loadingGodotName &&
                                            t('editProject.godot.loading')}
                                        {!loadingGodotName &&
                                            godotProjectAvailable &&
                                            t('editProject.godot.currentName', {
                                                name: godotProjectName,
                                            })}
                                        {!loadingGodotName &&
                                            !godotProjectAvailable &&
                                            t('editProject.godot.unavailable')}
                                    </span>
                                    {godotError && (
                                        <span className="text-sm text-error">
                                            {godotError}
                                        </span>
                                    )}
                                </span>
                            </label>

                            <SelectField
                                id="selectProjectGodotEditor"
                                testId="selectProjectGodotEditor"
                                label={t('editProject.godotEditor.title')}
                                help={t('editProject.godotEditor.help')}
                                value={releaseKey}
                                onChange={(value) => {
                                    setReleaseKey(value);
                                    setFormError(undefined);
                                }}
                                options={releaseOptions}
                                disabled={isSubmitting}
                                showSelectedCheck
                            />
                        </div>
                    )}

                    {activeTab === 'sourceControl' && project && (
                        <section className="flex flex-col gap-4">
                            <div>
                                <h2 className="text-lg font-bold">
                                    {t('editProject.sourceControl.title')}
                                </h2>
                                <p className="text-sm text-base-content/70">
                                    {t('editProject.sourceControl.help')}
                                </p>
                            </div>
                            <div className="flex items-start justify-between gap-4 rounded-lg border border-base-300 bg-base-200/40 p-4">
                                <div className="flex min-w-0 items-start gap-3">
                                    <GitBranch className="h-5 w-5" />
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <span className="font-semibold">
                                            Git
                                        </span>
                                        <span className="text-sm text-base-content/65">
                                            {t(
                                                withGit
                                                    ? 'editProject.sourceControl.enabled'
                                                    : 'editProject.sourceControl.notConfigured',
                                            )}
                                        </span>
                                        {!withGit &&
                                            !loadingGitAvailability &&
                                            !gitAvailable && (
                                                <span className="text-sm text-warning">
                                                    {t(
                                                        'createProject:otherSettings.gitNotInstalled',
                                                    )}
                                                </span>
                                            )}
                                    </div>
                                </div>
                                {withGit ? (
                                    <span className="badge badge-success badge-outline">
                                        {t('editProject.sourceControl.active')}
                                    </span>
                                ) : loadingGitAvailability ? (
                                    <span className="loading loading-spinner loading-sm" />
                                ) : gitAvailable ? (
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        disabled={
                                            !project.valid || isInitializingGit
                                        }
                                        onClick={() =>
                                            void handleInitializeGit()
                                        }
                                    >
                                        {isInitializingGit && (
                                            <span className="loading loading-spinner loading-xs" />
                                        )}
                                        {t(
                                            isInitializingGit
                                                ? 'editProject.sourceControl.initializing'
                                                : 'editProject.sourceControl.initialize',
                                        )}
                                    </button>
                                ) : null}
                            </div>
                        </section>
                    )}

                    {activeTab === 'codeEditor' && (
                        <ProjectCodeEditorSection
                            t={t}
                            codeEditorId={codeEditorId}
                            settings={codeEditorSettings}
                            loading={loadingCodeEditors}
                            loadFailed={codeEditorLoadFailed}
                            disabled={!project?.valid || isSubmitting}
                            showResetConfig={showResetCodeEditorConfig}
                            onChange={handleCodeEditorChange}
                            onResetConfig={requestCodeEditorConfigReset}
                        />
                    )}

                    {activeTab === 'launch' && (
                        <section className="flex flex-col gap-4">
                            <div>
                                <h2 className="text-lg font-bold">
                                    {t('editProject.launch.title')}
                                </h2>
                                <p className="text-sm text-base-content/70">
                                    {t('editProject.launch.help')}
                                </p>
                            </div>
                            <label className="flex items-start gap-3 rounded-lg border border-base-300 bg-base-200/40 p-4">
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-primary mt-0.5"
                                    checked={windowed}
                                    disabled={isSubmitting}
                                    onChange={(event) => {
                                        setWindowed(
                                            event.currentTarget.checked,
                                        );
                                        setFormError(undefined);
                                    }}
                                />
                                <PanelTop className="mt-0.5 h-5 w-5 shrink-0" />
                                <span className="flex flex-col gap-1">
                                    <span className="font-semibold">
                                        {t('editProject.launch.windowed.label')}
                                    </span>
                                    <span className="text-sm text-base-content/70">
                                        {t('editProject.launch.windowed.help')}
                                    </span>
                                </span>
                            </label>
                        </section>
                    )}
                </Drawer.Body>
                <Drawer.Footer>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={saveDisabled}
                    >
                        {isSubmitting && (
                            <span className="loading loading-spinner loading-xs" />
                        )}
                        {isSubmitting
                            ? t('editProject.actions.updating')
                            : t('editProject.actions.update')}
                    </button>
                </Drawer.Footer>
            </form>
        </Drawer>
    );
};
