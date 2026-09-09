import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    GitIdentity,
    InitializeProjectGitResult,
    InstalledRelease,
    ProjectDetails,
    ProjectGitIdentityResult,
    RenameProjectOptions,
    RenameProjectResult,
} from '@shared/contracts';
import clsx from 'clsx';
import { CircleCheck, GitBranch, PanelTop, Pin } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentDivider } from '../../components/ui/content-divider.component';
import { CopyBadge } from '../../components/ui/copy-badge.component';
import { CopyButton } from '../../components/ui/copy-button.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { TextField } from '../../components/ui/text-field.component';
import { useAlerts } from '../../hooks/alerts.hook';
import { useCodeEditorIntegrations } from '../../hooks/code-editor-integrations.hook';
import { useProjects } from '../../hooks/projects.hook';
import { useRelease } from '../../hooks/release.hook';
import { useToolIntegrations } from '../../hooks/tool-integrations.hook';
import { sortReleases } from '../../release-sorting.util';
import { CreateProjectEditorPicker } from './create-project/components/create-project-editor-picker.component';
import {
    type CreateProjectEditorSelection,
    getCreateProjectReleaseKey,
    prepareCreateProjectRelease,
} from './create-project/create-project.model';
import { ProjectCodeEditorSection } from './project-settings-drawer/components/project-code-editor-section.component';
import {
    canRenameGodotProject,
    hasProjectCodeEditorChanges,
    hasProjectRenameChanges,
    validateProjectRenameName,
} from './project-settings-drawer/project-settings.model';

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
    ) => Promise<InitializeProjectGitResult>;
    getProjectGitIdentity: (
        project: ProjectDetails,
    ) => Promise<ProjectGitIdentityResult>;
    onSetProjectGitIdentity: (
        project: ProjectDetails,
        identity: GitIdentity,
    ) => Promise<ProjectGitIdentityResult>;
    onResetProjectCodeEditorConfig: (
        project: ProjectDetails,
    ) => Promise<ProjectDetails>;
    getProjectGodotName: (project: ProjectDetails) => Promise<string | null>;
};

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
    getProjectGitIdentity,
    onSetProjectGitIdentity,
    onResetProjectCodeEditorConfig,
    getProjectGodotName,
}) => {
    const { t } = useTranslation([
        'projects',
        'common',
        'installs',
        'createProject',
    ]);
    const { addAlert, addCustomConfirm } = useAlerts();
    const { listIntegrationSettings } = useCodeEditorIntegrations();
    const { listIntegrations } = useToolIntegrations();
    const {
        availableReleases,
        availablePrereleases,
        releaseInstallProgress,
        loading: releasesLoading,
        hasError: catalogueError,
        refreshAvailableReleases,
        cancelInstall,
        installRelease,
    } = useRelease();
    const [activeTab, setActiveTab] = useState<ProjectSettingsTab>('project');
    const [initialName, setInitialName] = useState('');
    const [name, setName] = useState('');
    const [initialReleaseKey, setInitialReleaseKey] = useState('');
    const [releaseSelection, setReleaseSelection] =
        useState<CreateProjectEditorSelection | null>(null);
    const [initialWindowed, setInitialWindowed] = useState(false);
    const [windowed, setWindowed] = useState(false);
    const [withGit, setWithGit] = useState(false);
    const [gitAvailable, setGitAvailable] = useState(false);
    const [loadingGitAvailability, setLoadingGitAvailability] = useState(false);
    const [isInitializingGit, setIsInitializingGit] = useState(false);
    const [gitIdentity, setGitIdentity] =
        useState<ProjectGitIdentityResult | null>(null);
    const [loadingGitIdentity, setLoadingGitIdentity] = useState(false);
    const [editingGitIdentity, setEditingGitIdentity] = useState(false);
    const [gitIdentityName, setGitIdentityName] = useState('');
    const [gitIdentityEmail, setGitIdentityEmail] = useState('');
    const [savingGitIdentity, setSavingGitIdentity] = useState(false);
    const [gitIdentityError, setGitIdentityError] = useState<string>();
    const [godotProjectName, setGodotProjectName] = useState<string | null>(
        null,
    );
    const [loadingGodotName, setLoadingGodotName] = useState(false);
    const [renameGodotProject, setRenameGodotProject] = useState(false);
    const [nameError, setNameError] = useState<string>();
    const [godotError, setGodotError] = useState<string>();
    const [formError, setFormError] = useState<string>();
    const [isSavingLocally, setIsSubmitting] = useState(false);
    const { settingsSaves, startSettingsSave, clearSettingsSave } =
        useProjects();
    const settingsSave = project ? settingsSaves?.get(project.path) : undefined;
    const savingInBackground = settingsSave?.status === 'pending';
    const isSubmitting = isSavingLocally || savingInBackground;
    const [initialCodeEditorId, setInitialCodeEditorId] =
        useState<CodeEditorId | null>(null);
    const [codeEditorId, setCodeEditorId] = useState<CodeEditorId | null>(null);
    const [codeEditorTouched, setCodeEditorTouched] = useState(false);
    const [codeEditorSettings, setCodeEditorSettings] = useState<
        CodeEditorIntegrationSettings[]
    >([]);
    const [loadingCodeEditors, setLoadingCodeEditors] = useState(false);
    const [codeEditorLoadFailed, setCodeEditorLoadFailed] = useState(false);
    const activeProjectPathRef = useRef<string | null>(null);
    const codeEditorProjectPathRef = useRef<string | null>(null);
    const sessionRef = useRef(0);
    const submissionRef = useRef(false);

    useEffect(() => {
        return () => {
            sessionRef.current += 1;
        };
    }, []);

    useEffect(() => {
        if (!open || !project) {
            activeProjectPathRef.current = null;
            codeEditorProjectPathRef.current = null;
            sessionRef.current += 1;
            return;
        }

        const projectChanged = activeProjectPathRef.current !== project.path;
        activeProjectPathRef.current = project.path;
        if (!projectChanged) {
            return;
        }

        sessionRef.current += 1;
        let disposed = false;
        const currentReleaseKey = getCreateProjectReleaseKey(project.release);

        setActiveTab('project');
        setInitialName(project.name);
        setName(project.name);
        setInitialReleaseKey(currentReleaseKey);
        setReleaseSelection({
            source: 'installed',
            key: currentReleaseKey,
            release: project.release,
        });
        setInitialWindowed(Boolean(project.open_windowed));
        setWindowed(Boolean(project.open_windowed));
        setWithGit(project.withGit);
        setIsInitializingGit(false);
        setGitIdentity(null);
        setEditingGitIdentity(false);
        setGitIdentityError(undefined);
        setGodotProjectName(null);
        setRenameGodotProject(false);
        setNameError(undefined);
        setGodotError(undefined);
        setFormError(undefined);
        setIsSubmitting(false);
        submissionRef.current = false;
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

        listIntegrations()
            .then((tools) => {
                if (!disposed) {
                    setGitAvailable(
                        tools.some(
                            (tool) =>
                                tool.id === 'git' &&
                                tool.status === 'available',
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
    }, [listIntegrations, open]);

    useEffect(() => {
        if (!open || !project || activeTab !== 'sourceControl' || !withGit) {
            return;
        }

        let disposed = false;
        setLoadingGitIdentity(true);
        setGitIdentityError(undefined);
        getProjectGitIdentity(project)
            .then((identity) => {
                if (!disposed) {
                    setGitIdentity(identity);
                }
            })
            .catch((error) => {
                if (!disposed) {
                    setGitIdentityError(
                        error instanceof Error
                            ? error.message
                            : t('editProject.sourceControl.identityLoadFailed'),
                    );
                }
            })
            .finally(() => {
                if (!disposed) {
                    setLoadingGitIdentity(false);
                }
            });

        return () => {
            disposed = true;
        };
    }, [activeTab, getProjectGitIdentity, open, project, t, withGit]);

    useEffect(() => {
        if (!open || !project) {
            codeEditorProjectPathRef.current = null;
            return;
        }

        if (codeEditorProjectPathRef.current === project.path) {
            return;
        }

        codeEditorProjectPathRef.current = project.path;

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

    const restoredSaveRef = useRef<typeof settingsSave>(undefined);
    useEffect(() => {
        if (!open || !project) {
            restoredSaveRef.current = undefined;
            return;
        }
        if (
            !settingsSave ||
            restoredSaveRef.current === settingsSave ||
            loadingCodeEditors ||
            loadingGodotName
        )
            return;
        restoredSaveRef.current = settingsSave;
        if (settingsSave.status === 'complete' && settingsSave.project) {
            const saved = settingsSave.project;
            setName(saved.name);
            setInitialName(saved.name);
            setReleaseSelection({
                source: 'installed',
                key: getCreateProjectReleaseKey(saved.release),
                release: saved.release,
            });
            setInitialReleaseKey(getCreateProjectReleaseKey(saved.release));
            setWindowed(Boolean(saved.open_windowed));
            setInitialWindowed(Boolean(saved.open_windowed));
            setCodeEditorId(saved.codeEditorId ?? null);
            setInitialCodeEditorId(saved.codeEditorId ?? null);
            setCodeEditorTouched(false);
            setRenameGodotProject(false);
            if (settingsSave.draft.renameGodotProject)
                setGodotProjectName(saved.name);
            setFormError(undefined);
            clearSettingsSave(project.path);
        } else {
            const draft = settingsSave.draft;
            setName(draft.name);
            setReleaseSelection(draft.releaseSelection);
            setWindowed(draft.windowed);
            setCodeEditorId(draft.codeEditorId);
            setCodeEditorTouched(draft.codeEditorTouched);
            setRenameGodotProject(draft.renameGodotProject);
            setFormError(settingsSave.error);
        }
    }, [
        open,
        project,
        settingsSave,
        loadingCodeEditors,
        loadingGodotName,
        clearSettingsSave,
    ]);

    const selectableReleases = useMemo(() => {
        if (!project) {
            return [];
        }

        const currentMajor = Math.trunc(project.release.version_number);
        return installedReleases
            .filter(
                (release) =>
                    release.valid !== false &&
                    Boolean(release.editor_path) &&
                    Math.trunc(release.version_number) >= currentMajor,
            )
            .sort(sortReleases);
    }, [installedReleases, project]);

    const compatibleCatalogueReleases = useMemo(() => {
        if (!project) {
            return [];
        }

        const currentMajor = Math.trunc(project.release.version_number);
        return availableReleases.filter(
            (release) => Math.trunc(release.version_number) >= currentMajor,
        );
    }, [availableReleases, project]);

    const compatibleCataloguePrereleases = useMemo(() => {
        if (!project) {
            return [];
        }

        const currentMajor = Math.trunc(project.release.version_number);
        return availablePrereleases.filter(
            (release) => Math.trunc(release.version_number) >= currentMajor,
        );
    }, [availablePrereleases, project]);

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
            const result = await onInitializeProjectGit(project);
            setWithGit(result.project.withGit);
            if (result.gitSetup.status === 'existing-repository') {
                addAlert(
                    t('editProject.sourceControl.existingRepositoryTitle'),
                    result.gitSetup.isProjectRoot
                        ? t('editProject.sourceControl.existingRepositoryRoot')
                        : t(
                              'editProject.sourceControl.existingRepositoryParent',
                              { root: result.gitSetup.root },
                          ),
                );
            }
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

    const handleEditGitIdentity = () => {
        if (gitIdentity?.status !== 'available' || !gitIdentity.canUpdate) {
            return;
        }
        setGitIdentityName(gitIdentity.name.value);
        setGitIdentityEmail(gitIdentity.email.value);
        setGitIdentityError(undefined);
        setEditingGitIdentity(true);
    };

    const handleSaveGitIdentity = async () => {
        if (!project || !gitIdentityName.trim() || !gitIdentityEmail.trim()) {
            setGitIdentityError(
                t('editProject.sourceControl.identityRequired'),
            );
            return;
        }

        setSavingGitIdentity(true);
        setGitIdentityError(undefined);
        try {
            const identity = await onSetProjectGitIdentity(project, {
                name: gitIdentityName,
                email: gitIdentityEmail,
            });
            setGitIdentity(identity);
            setEditingGitIdentity(false);
        } catch (error) {
            setGitIdentityError(
                error instanceof Error
                    ? error.message
                    : t('editProject.sourceControl.updateFailed'),
            );
        } finally {
            setSavingGitIdentity(false);
        }
    };

    /**
     * Submits catalogue installation and settings in the background, or saves an installed selection.
     *
     * @param event - The settings form submission event.
     * @returns A promise that ends after the staged settings are saved or fail.
     */
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (submissionRef.current || savingInBackground) {
            return;
        }

        if (!project || !releaseSelection || !validateNameField()) {
            setActiveTab('project');
            return;
        }

        submissionRef.current = true;
        const submissionSession = sessionRef.current;
        setIsSubmitting(true);
        setFormError(undefined);
        setGodotError(undefined);

        if (
            releaseSelection.source === 'catalogue' &&
            !releaseSelection.installedRelease
        ) {
            startSettingsSave(
                project.path,
                {
                    name,
                    renameGodotProject,
                    windowed,
                    codeEditorId,
                    codeEditorTouched,
                    releaseSelection,
                },
                async () => {
                    const installation = prepareCreateProjectRelease(
                        releaseSelection,
                        installRelease,
                    );
                    const result = await installation;
                    if (!result.success || !result.release) {
                        throw new Error(
                            result.error ?? t('editProject.updateFailed'),
                        );
                    }
                    let savedProject = project;
                    if (
                        hasProjectRenameChanges(
                            initialName,
                            godotProjectName,
                            name,
                            renameGodotProject,
                        )
                    ) {
                        const renamed = await onRenameProject(savedProject, {
                            name: name.trim(),
                            renameGodotProject,
                        });
                        if (!renamed.success) {
                            throw new Error(
                                renamed.error ?? t('editProject.updateFailed'),
                            );
                        }
                        savedProject = renamed.project ?? {
                            ...savedProject,
                            name: name.trim(),
                        };
                    }
                    if (
                        hasProjectCodeEditorChanges(
                            initialCodeEditorId,
                            codeEditorId,
                            codeEditorTouched,
                        )
                    ) {
                        savedProject = await onSetProjectCodeEditor(
                            savedProject,
                            codeEditorId,
                        );
                    }
                    savedProject = await onSetProjectEditor(
                        savedProject,
                        result.release,
                    );
                    if (initialWindowed !== windowed) {
                        savedProject = await onSetProjectWindowed(
                            savedProject,
                            windowed,
                        );
                    }
                    return savedProject;
                },
            );
            setIsSubmitting(false);
            submissionRef.current = false;
            onOpenChange(false);
            return;
        }

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
            const selectedReleaseKey = getCreateProjectReleaseKey({
                version: releaseSelection.release.version,
                mono:
                    releaseSelection.source === 'installed'
                        ? releaseSelection.release.mono
                        : releaseSelection.mono,
            });
            const releaseChanged =
                initialReleaseKey !== selectedReleaseKey ||
                (releaseSelection.source === 'catalogue' &&
                    (project.release.valid === false ||
                        !project.release.editor_path));
            const windowedChanged = initialWindowed !== windowed;
            let selectedRelease: InstalledRelease | undefined;

            if (releaseChanged) {
                if (
                    releaseSelection.source === 'installed' &&
                    (releaseSelection.release.valid === false ||
                        !releaseSelection.release.editor_path)
                ) {
                    setFormError(t('editProject.godotEditor.unavailable'));
                    return;
                }

                const installResult = await prepareCreateProjectRelease(
                    releaseSelection,
                    installRelease,
                );

                if (submissionSession !== sessionRef.current) {
                    return;
                }

                if (!installResult.success || !installResult.release) {
                    setFormError(
                        installResult.error ?? t('editProject.updateFailed'),
                    );
                    return;
                }

                selectedRelease = installResult.release;
                if (releaseSelection.source === 'catalogue') {
                    setReleaseSelection((currentSelection) =>
                        currentSelection?.source === 'catalogue' &&
                        currentSelection.key === releaseSelection.key
                            ? {
                                  ...currentSelection,
                                  installedRelease: installResult.release,
                              }
                            : currentSelection,
                    );
                }
            }

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
                if (!selectedRelease) {
                    throw new Error(t('editProject.godotEditor.unavailable'));
                }
                currentProject = await onSetProjectEditor(
                    currentProject,
                    selectedRelease,
                );
                setInitialReleaseKey(
                    getCreateProjectReleaseKey(selectedRelease),
                );
            }

            if (windowedChanged) {
                await onSetProjectWindowed(currentProject, windowed);
                setInitialWindowed(windowed);
            }

            clearSettingsSave(project.path);
            onOpenChange(false);
        } catch (error) {
            if (submissionSession === sessionRef.current) {
                setFormError(
                    error instanceof Error
                        ? error.message
                        : t('editProject.updateFailed'),
                );
            }
        } finally {
            if (submissionSession === sessionRef.current) {
                submissionRef.current = false;
                setIsSubmitting(false);
            }
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
    const hasReleaseChanges =
        project &&
        releaseSelection !== null &&
        (initialReleaseKey !==
            getCreateProjectReleaseKey({
                version: releaseSelection.release.version,
                mono:
                    releaseSelection.source === 'installed'
                        ? releaseSelection.release.mono
                        : releaseSelection.mono,
            }) ||
            (releaseSelection.source === 'catalogue' &&
                (project.release.valid === false ||
                    !project.release.editor_path)));
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
            <div className="flex flex-col gap-4 text-base">
                <p className="text-base-content/75">
                    {t('editProject.codeEditor.resetConfig.confirmMessage')}
                </p>
                <p className="rounded-box bg-base-200/60 p-3 break-words font-semibold">
                    {project.name}
                </p>
            </div>,
            [
                {
                    isCancel: true,
                    typeClass: 'btn-ghost text-base',
                    text: t('common:buttons.cancel'),
                },
                {
                    typeClass: 'btn-warning text-base',
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
            ],
            undefined,
            'warning',
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
    const gitUnavailable = withGit && gitIdentity?.status === 'git-unavailable';

    return (
        <Drawer
            open={open && Boolean(project)}
            onOpenChange={(nextOpen) => {
                if (!nextOpen && isSavingLocally) {
                    return;
                }
                onOpenChange(nextOpen);
            }}
            side="right"
            ariaLabel={drawerTitle}
            width={560}
            panelClassName="max-w-[100vw]"
            closeOnBackdrop={!isSavingLocally}
            closeOnEscape={!isSavingLocally}
        >
            <Drawer.Header className="items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Drawer.Title className="text-lg font-semibold">
                            {drawerTitle}
                        </Drawer.Title>
                        {project?.pinned && (
                            <span className="badge badge-sm badge-primary badge-soft gap-1">
                                <Pin size={12} aria-hidden="true" />
                                {t('editProject.pinned.label')}
                            </span>
                        )}
                    </div>
                    {project && (
                        <CopyBadge
                            value={project.path}
                            label={t('common:buttons.copyPath')}
                            copiedLabel={t('common:success')}
                            className="-ml-3 self-start"
                        />
                    )}
                </div>
                <Drawer.CloseButton
                    className="btn-sm"
                    disabled={isSavingLocally}
                />
            </Drawer.Header>
            <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(event) => void handleSubmit(event)}
            >
                <div
                    role="tablist"
                    className="tabs tabs-border grid shrink-0 grid-cols-4 px-5 pt-2"
                >
                    {projectSettingsTabs.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            data-testid={`tabProjectSettings_${tab}`}
                            aria-selected={activeTab === tab}
                            className={clsx(
                                'tab px-2 text-base',
                                activeTab === tab && 'tab-active',
                            )}
                            onClick={() => setActiveTab(tab)}
                        >
                            {t(`editProject.tabs.${tab}`)}
                        </button>
                    ))}
                </div>

                <Drawer.Body className="flex flex-col gap-4 text-base">
                    {savingInBackground && (
                        <p className="text-base-content/75" role="status">
                            {t('editProject.actions.installingEditor')}
                        </p>
                    )}
                    <fieldset
                        disabled={isSubmitting}
                        className="flex min-w-0 flex-col gap-4"
                    >
                        {formError && (
                            <div
                                className="alert alert-error alert-soft text-error-content dark:text-error"
                                role="alert"
                            >
                                {formError}
                            </div>
                        )}

                        {activeTab === 'project' && (
                            <div className="flex flex-col gap-[12px]">
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

                                <label className="flex items-start gap-3 rounded-md bg-base-content/5 p-3">
                                    <input
                                        type="checkbox"
                                        className={clsx(
                                            'checkbox checkbox-sm mt-0.5 shrink-0',
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
                                    <span
                                        className={clsx(
                                            'flex min-w-0 flex-col gap-1',
                                            (isSubmitting ||
                                                !godotProjectAvailable ||
                                                loadingGodotName ||
                                                !godotRenameEnabled) &&
                                                'opacity-50',
                                        )}
                                    >
                                        <span>
                                            {t('editProject.godot.renameLabel')}
                                        </span>
                                        <span className="text-base-content">
                                            {loadingGodotName &&
                                                t('editProject.godot.loading')}
                                            {!loadingGodotName &&
                                                godotProjectAvailable &&
                                                t(
                                                    'editProject.godot.currentName',
                                                    {
                                                        name: godotProjectName,
                                                    },
                                                )}
                                            {!loadingGodotName &&
                                                !godotProjectAvailable &&
                                                t(
                                                    'editProject.godot.unavailable',
                                                )}
                                        </span>
                                        {godotError && (
                                            <span className="text-error">
                                                {godotError}
                                            </span>
                                        )}
                                    </span>
                                </label>

                                <ContentDivider />
                                <div className="flex flex-col gap-2">
                                    <div>
                                        <h3 className="text-base font-semibold">
                                            {t('editProject.godotEditor.title')}
                                        </h3>
                                        <p className="text-base-content/75">
                                            {t('editProject.godotEditor.help')}
                                        </p>
                                    </div>
                                    <CreateProjectEditorPicker
                                        open={open}
                                        disabled={isSubmitting}
                                        triggerTestId="selectProjectGodotEditor"
                                        triggerLabel={t(
                                            'editProject.godotEditor.title',
                                        )}
                                        installedReleases={selectableReleases}
                                        availableReleases={
                                            compatibleCatalogueReleases
                                        }
                                        availablePrereleases={
                                            compatibleCataloguePrereleases
                                        }
                                        releaseInstallProgress={
                                            releaseInstallProgress
                                        }
                                        loading={releasesLoading}
                                        catalogueError={catalogueError}
                                        selection={releaseSelection}
                                        onSelectionChange={(selection) => {
                                            setReleaseSelection(selection);
                                            setFormError(undefined);
                                        }}
                                        onCancelInstall={(jobId) =>
                                            void cancelInstall(jobId)
                                        }
                                        onRetryCatalogue={
                                            refreshAvailableReleases
                                        }
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'sourceControl' && project && (
                            <section className="flex flex-col gap-[12px]">
                                <div className="flex min-w-0 flex-col gap-[4px]">
                                    <h2 className="text-base font-semibold">
                                        {t('editProject.sourceControl.title')}
                                    </h2>
                                    <p className="break-words text-base-content/75">
                                        {t('editProject.sourceControl.help')}
                                    </p>
                                </div>
                                <div className="flex items-start justify-between gap-4 rounded-md bg-base-200/40 p-4">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <GitBranch
                                            className="size-5 shrink-0"
                                            aria-hidden="true"
                                        />
                                        <div className="flex min-w-0 flex-col gap-1">
                                            <span className="font-semibold">
                                                Git
                                            </span>
                                            <span className="text-base-content/75">
                                                {t(
                                                    withGit
                                                        ? gitUnavailable
                                                            ? 'editProject.sourceControl.enabledUnavailable'
                                                            : 'editProject.sourceControl.enabled'
                                                        : 'editProject.sourceControl.notConfigured',
                                                )}
                                            </span>
                                            {!withGit &&
                                                !loadingGitAvailability &&
                                                !gitAvailable && (
                                                    <span className="text-warning">
                                                        {t(
                                                            'createProject:otherSettings.gitNotInstalled',
                                                        )}
                                                    </span>
                                                )}
                                        </div>
                                    </div>
                                    {gitUnavailable ? (
                                        <span
                                            className="badge badge-sm badge-soft badge-warning text-warning-content dark:text-warning"
                                            data-testid="projectGitUnavailable"
                                        >
                                            {t(
                                                'editProject.sourceControl.identityUnavailable',
                                            )}
                                        </span>
                                    ) : withGit ? (
                                        <span
                                            className="badge badge-sm badge-soft badge-success text-success-content dark:text-success gap-1.5"
                                            data-testid="projectGitActive"
                                        >
                                            <CircleCheck
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                            />
                                            {t(
                                                'editProject.sourceControl.active',
                                            )}
                                        </span>
                                    ) : loadingGitAvailability ? (
                                        <span className="loading loading-spinner loading-sm" />
                                    ) : gitAvailable ? (
                                        <button
                                            type="button"
                                            className="btn btn-primary shrink-0 text-base"
                                            disabled={
                                                !project.valid ||
                                                isInitializingGit
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
                                {withGit && <ContentDivider />}
                                {withGit && loadingGitIdentity && (
                                    <div className="flex justify-center py-4">
                                        <span className="loading loading-spinner loading-sm" />
                                    </div>
                                )}
                                {withGit &&
                                    gitIdentity?.status === 'available' && (
                                        <div className="flex flex-col gap-[12px]">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex min-w-0 flex-col gap-[4px]">
                                                    <h3 className="text-base font-semibold">
                                                        {t(
                                                            'editProject.sourceControl.identityTitle',
                                                        )}
                                                    </h3>
                                                    <p className="break-words text-base-content/75">
                                                        {t(
                                                            'editProject.sourceControl.identityHelp',
                                                        )}
                                                    </p>
                                                </div>
                                                {!editingGitIdentity &&
                                                    gitIdentity.canUpdate && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost shrink-0 text-base"
                                                            onClick={
                                                                handleEditGitIdentity
                                                            }
                                                        >
                                                            {t(
                                                                'editProject.sourceControl.updateIdentity',
                                                            )}
                                                        </button>
                                                    )}
                                            </div>
                                            {editingGitIdentity ? (
                                                <div className="flex flex-col gap-3">
                                                    <TextField
                                                        id="projectGitIdentityName"
                                                        label={t(
                                                            'editProject.sourceControl.identityName',
                                                        )}
                                                        help={t(
                                                            'editProject.sourceControl.identityNameHelp',
                                                        )}
                                                        value={gitIdentityName}
                                                        onChange={
                                                            setGitIdentityName
                                                        }
                                                        disabled={
                                                            savingGitIdentity
                                                        }
                                                    />
                                                    <TextField
                                                        id="projectGitIdentityEmail"
                                                        label={t(
                                                            'editProject.sourceControl.identityEmail',
                                                        )}
                                                        help={t(
                                                            'editProject.sourceControl.identityEmailHelp',
                                                        )}
                                                        value={gitIdentityEmail}
                                                        onChange={
                                                            setGitIdentityEmail
                                                        }
                                                        disabled={
                                                            savingGitIdentity
                                                        }
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost text-base"
                                                            disabled={
                                                                savingGitIdentity
                                                            }
                                                            onClick={() => {
                                                                setEditingGitIdentity(
                                                                    false,
                                                                );
                                                                setGitIdentityError(
                                                                    undefined,
                                                                );
                                                            }}
                                                        >
                                                            {t(
                                                                'common:buttons.cancel',
                                                            )}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary shrink-0 text-base"
                                                            disabled={
                                                                savingGitIdentity
                                                            }
                                                            onClick={() =>
                                                                void handleSaveGitIdentity()
                                                            }
                                                        >
                                                            {savingGitIdentity && (
                                                                <span className="loading loading-spinner loading-xs" />
                                                            )}
                                                            {t(
                                                                'editProject.sourceControl.saveIdentity',
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <dl className="grid gap-3">
                                                    {(
                                                        [
                                                            [
                                                                'identityName',
                                                                gitIdentity.name,
                                                            ],
                                                            [
                                                                'identityEmail',
                                                                gitIdentity.email,
                                                            ],
                                                        ] as const
                                                    ).map(([label, value]) => (
                                                        <div
                                                            key={label}
                                                            className="min-w-0"
                                                        >
                                                            <dt className="flex flex-wrap items-center gap-2 text-base-content/75">
                                                                <span>
                                                                    {t(
                                                                        `editProject.sourceControl.${label}`,
                                                                    )}
                                                                </span>
                                                                <span className="badge badge-sm badge-soft capitalize">
                                                                    {t(
                                                                        `editProject.sourceControl.identitySource.${value.source}`,
                                                                    )}
                                                                </span>
                                                            </dt>
                                                            <dd className="mt-1 flex min-w-0 items-center gap-2 rounded-md bg-base-content/5 px-3 py-2">
                                                                <span className="min-w-0 flex-1 break-all select-text">
                                                                    {value.value ||
                                                                        t(
                                                                            'editProject.sourceControl.identityMissing',
                                                                        )}
                                                                </span>
                                                                {value.value && (
                                                                    <div className="shrink-0">
                                                                        <CopyButton
                                                                            value={
                                                                                value.value
                                                                            }
                                                                        />
                                                                    </div>
                                                                )}
                                                            </dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                            )}
                                            {!gitIdentity.canUpdate && (
                                                <p className="break-words text-base-content/75">
                                                    {t(
                                                        gitIdentity.repository
                                                            .kind ===
                                                            'linked-worktree'
                                                            ? 'editProject.sourceControl.linkedWorktreeReadOnly'
                                                            : 'editProject.sourceControl.parentRepositoryReadOnly',
                                                        {
                                                            root: gitIdentity
                                                                .repository
                                                                .root,
                                                        },
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                {withGit &&
                                    gitIdentity?.status ===
                                        'git-unavailable' && (
                                        <div className="flex flex-col gap-[12px]">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex min-w-0 flex-col gap-[4px]">
                                                    <h3 className="text-base font-semibold">
                                                        {t(
                                                            'editProject.sourceControl.identityTitle',
                                                        )}
                                                    </h3>
                                                    <p className="break-words text-base-content/75">
                                                        {t(
                                                            'editProject.sourceControl.identityUnavailableHelp',
                                                        )}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost shrink-0 text-base"
                                                    disabled
                                                >
                                                    {t(
                                                        'editProject.sourceControl.updateIdentity',
                                                    )}
                                                </button>
                                            </div>
                                            <dl className="grid gap-3">
                                                {[
                                                    'identityName',
                                                    'identityEmail',
                                                ].map((label) => (
                                                    <div
                                                        key={label}
                                                        className="min-w-0"
                                                    >
                                                        <dt className="text-base-content/75">
                                                            {t(
                                                                `editProject.sourceControl.${label}`,
                                                            )}
                                                        </dt>
                                                        <dd className="mt-1 rounded-md bg-base-content/5 px-3 py-2 text-base-content/60">
                                                            {t(
                                                                'editProject.sourceControl.identityUnavailable',
                                                            )}
                                                        </dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        </div>
                                    )}
                                {gitIdentityError && (
                                    <p
                                        className="break-words text-error"
                                        role="alert"
                                    >
                                        {gitIdentityError}
                                    </p>
                                )}
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
                            <section className="flex flex-col gap-[12px]">
                                <div className="flex flex-col gap-[4px]">
                                    <h2 className="text-base font-semibold">
                                        {t('editProject.launch.title')}
                                    </h2>
                                    <p className="text-base-content/75">
                                        {t('editProject.launch.help')}
                                    </p>
                                </div>
                                <label
                                    className={clsx(
                                        'flex items-start gap-3 rounded-md bg-base-content/5 p-3',
                                        isSubmitting && 'opacity-50',
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-sm mt-0.5 shrink-0"
                                        checked={windowed}
                                        disabled={isSubmitting}
                                        onChange={(event) => {
                                            setWindowed(
                                                event.currentTarget.checked,
                                            );
                                            setFormError(undefined);
                                        }}
                                    />
                                    <PanelTop
                                        className="mt-0.5 size-5 shrink-0"
                                        aria-hidden="true"
                                    />
                                    <span className="flex flex-col gap-1">
                                        <span>
                                            {t(
                                                'editProject.launch.windowed.label',
                                            )}
                                        </span>
                                        <span className="text-base-content/75">
                                            {t(
                                                'editProject.launch.windowed.help',
                                            )}
                                        </span>
                                    </span>
                                </label>
                            </section>
                        )}
                    </fieldset>
                </Drawer.Body>
                <Drawer.Footer>
                    <button
                        type="button"
                        className="btn btn-ghost text-base"
                        onClick={() => onOpenChange(false)}
                        disabled={isSavingLocally}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary text-base"
                        disabled={saveDisabled}
                    >
                        {isSubmitting && (
                            <span className="loading loading-spinner loading-xs" />
                        )}
                        {isSubmitting &&
                        releaseSelection?.source === 'catalogue' &&
                        !releaseSelection.installedRelease
                            ? t('editProject.actions.installingEditor')
                            : hasReleaseChanges &&
                                releaseSelection?.source === 'catalogue' &&
                                !releaseSelection.installedRelease
                              ? t('editProject.actions.installAndSave')
                              : isSubmitting
                                ? t('editProject.actions.updating')
                                : t('editProject.actions.update')}
                    </button>
                </Drawer.Footer>
            </form>
        </Drawer>
    );
};
