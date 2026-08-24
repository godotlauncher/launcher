import type {
    AddProjectOptions,
    AddProjectToListResult,
    ChangeProjectEditorResult,
    CodeEditorId,
    CodeEditorIntegrationSettings,
    CreateProjectGitOptions,
    CreateProjectResult,
    GitIdentity,
    InitializeProjectGitResult,
    InstalledRelease,
    LaunchProjectResult,
    ProjectDetails,
    ProjectGitIdentityResult,
    RenameProjectOptions,
    RenameProjectResult,
    RendererType,
    SetProjectCodeEditorResult,
} from '@shared/contracts';
import { TriangleAlert } from 'lucide-react';
import {
    createContext,
    type FC,
    type PropsWithChildren,
    useContext,
    useEffect,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
    appBridge,
    codeEditorIntegrationBridge,
    projectsBridge,
    subscribeAppEvent,
} from '../bridge.ts';
import { appRoutePaths } from '../routes';
import { useAlerts } from './useAlerts';

interface ProjectsContext {
    projects: ProjectDetails[];
    codeEditorSettings: CodeEditorIntegrationSettings[];
    loading: boolean;
    rescanCodeEditorIntegration: (
        integrationId: CodeEditorId,
    ) => Promise<CodeEditorIntegrationSettings>;
    addProject: (
        projectPath: string,
        options?: AddProjectOptions,
    ) => Promise<AddProjectToListResult>;
    setProjectEditor: (
        project: ProjectDetails,
        release: InstalledRelease,
    ) => Promise<ChangeProjectEditorResult>;
    setProjectWindowed: (
        project: ProjectDetails,
        openWindowed: boolean,
    ) => Promise<ProjectDetails>;
    setProjectPinned: (
        project: ProjectDetails,
        pinned: boolean,
    ) => Promise<ProjectDetails[]>;
    reorderPinnedProjects: (
        orderedProjectPaths: string[],
    ) => Promise<ProjectDetails[]>;
    setProjectCodeEditor: (
        project: ProjectDetails,
        codeEditorId: CodeEditorId | null,
    ) => Promise<SetProjectCodeEditorResult>;
    resetProjectCodeEditorConfig: (
        project: ProjectDetails,
    ) => Promise<SetProjectCodeEditorResult>;
    initializeProjectGit: (
        project: ProjectDetails,
    ) => Promise<InitializeProjectGitResult>;
    getProjectGitIdentity: (
        project: ProjectDetails,
    ) => Promise<ProjectGitIdentityResult>;
    setProjectGitIdentity: (
        project: ProjectDetails,
        identity: GitIdentity,
    ) => Promise<ProjectGitIdentityResult>;
    exportProjectEditorSettings: (project: ProjectDetails) => Promise<void>;
    importProjectEditorSettings: (project: ProjectDetails) => Promise<void>;
    openProjectFolder: (project: ProjectDetails) => Promise<void>;
    openProjectEditorFolder: (project: ProjectDetails) => Promise<void>;
    renameProject: (
        project: ProjectDetails,
        options: RenameProjectOptions,
    ) => Promise<RenameProjectResult>;
    getProjectGodotName: (project: ProjectDetails) => Promise<string | null>;
    removeProject: (project: ProjectDetails) => Promise<void>;
    launchProject: (
        project: ProjectDetails,
    ) => Promise<ProjectDetails | undefined>;
    refreshProjects: () => Promise<void>;
    checkProjectValid: (project: ProjectDetails) => Promise<ProjectDetails>;
    createProject: (
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        codeEditorId: CodeEditorId | null,
        withGit: boolean,
        overwriteProjectPath?: string,
        gitOptions?: CreateProjectGitOptions,
    ) => Promise<CreateProjectResult>;
}

export const projectsContext = createContext<ProjectsContext>(
    {} as ProjectsContext,
);

export const useProjects = () => {
    const context = useContext(projectsContext);
    if (!context) {
        throw new Error('useProjects must be used within a ProjectsProvider');
    }
    return context;
};

type ProjectsProviderProps = PropsWithChildren;

export const ProjectsProvider: FC<ProjectsProviderProps> = ({ children }) => {
    const { t } = useTranslation(['projects', 'common']);
    const navigate = useNavigate();
    const { addAlert, addCustomConfirm } = useAlerts();
    const [projects, setProjects] = useState<ProjectDetails[]>([]);
    const [codeEditorSettings, setCodeEditorSettings] = useState<
        CodeEditorIntegrationSettings[]
    >([]);
    const [loading, setLoading] = useState<boolean>(true);

    const getProjects = async () => {
        setLoading(true);
        const [projects, integrations] = await Promise.all([
            projectsBridge.getProjectsDetails(),
            codeEditorIntegrationBridge
                .listIntegrationSettings()
                .catch(() => []),
        ]);
        setProjects(projects);
        setCodeEditorSettings(integrations);
        setLoading(false);
    };

    const rescanCodeEditorIntegration = async (integrationId: CodeEditorId) => {
        const updated =
            await codeEditorIntegrationBridge.rescanIntegration(integrationId);
        setCodeEditorSettings((current) =>
            current.some(
                (settings) => settings.integration.id === integrationId,
            )
                ? current.map((settings) =>
                      settings.integration.id === integrationId
                          ? updated
                          : settings,
                  )
                : [...current, updated],
        );
        return updated;
    };

    /**
     * Creates a project and refreshes the project list after success.
     *
     * @param projectName - Display name for the new project.
     * @param release - Godot editor release assigned to the project.
     * @param renderer - Renderer selected for the project.
     * @param codeEditorId - Optional code editor integration to apply.
     * @param withGit - Whether to initialize Git when it is available.
     * @param overwriteProjectPath - Optional target project path.
     * @param gitOptions - Optional initial commit, identity, and Git LFS setup choice.
     * @returns The project creation result.
     */
    const createProject = async (
        projectName: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        codeEditorId: CodeEditorId | null,
        withGit: boolean,
        overwriteProjectPath?: string,
        gitOptions?: CreateProjectGitOptions,
    ) => {
        const result = await projectsBridge.createProject(
            projectName,
            release,
            renderer,
            codeEditorId,
            withGit,
            overwriteProjectPath,
            gitOptions,
        );

        if (result.success) {
            await refreshProjects();
        }

        return result;
    };

    const addProject = async (
        projectPath: string,
        options?: AddProjectOptions,
    ) => {
        const addResult = await projectsBridge.addProject(projectPath, options);
        if (addResult.success && addResult.projects) {
            setProjects(addResult.projects);
        }
        return addResult;
    };

    const setProjectEditor = async (
        project: ProjectDetails,
        release: InstalledRelease,
    ) => {
        const result = await projectsBridge.setProjectEditor(project, release);
        if (result.success && result.projects) {
            setProjects(result.projects);
        }

        return result;
    };

    const updateProjectState = (updatedProject: ProjectDetails) => {
        setProjects((currentProjects) =>
            currentProjects.map((project) =>
                project.path === updatedProject.path ? updatedProject : project,
            ),
        );
    };

    const setProjectWindowed = async (
        project: ProjectDetails,
        openWindowed: boolean,
    ) => {
        const updatedProject = await projectsBridge.setProjectWindowed(
            project,
            openWindowed,
        );
        updateProjectState(updatedProject);
        return updatedProject;
    };

    const setProjectPinned = async (
        project: ProjectDetails,
        pinned: boolean,
    ) => {
        const updatedProjects = await projectsBridge.setProjectPinned(
            project,
            pinned,
        );
        setProjects(updatedProjects);
        return updatedProjects;
    };

    const reorderPinnedProjects = async (orderedProjectPaths: string[]) => {
        const updatedProjects =
            await projectsBridge.reorderPinnedProjects(orderedProjectPaths);
        setProjects(updatedProjects);
        return updatedProjects;
    };

    const setProjectCodeEditor = async (
        project: ProjectDetails,
        codeEditorId: CodeEditorId | null,
    ) => {
        const updatedProject = await projectsBridge.setProjectCodeEditor(
            project,
            codeEditorId,
        );
        updateProjectState(updatedProject);
        return updatedProject;
    };

    const resetProjectCodeEditorConfig = async (project: ProjectDetails) => {
        const updatedProject =
            await projectsBridge.resetProjectCodeEditorConfig(project);
        updateProjectState(updatedProject);
        return updatedProject;
    };

    const initializeProjectGit = async (project: ProjectDetails) => {
        const result = await projectsBridge.initializeProjectGit(project);
        updateProjectState(result.project);
        return result;
    };

    const getProjectGitIdentity = (project: ProjectDetails) =>
        projectsBridge.getProjectGitIdentity(project);

    const setProjectGitIdentity = (
        project: ProjectDetails,
        identity: GitIdentity,
    ) => projectsBridge.setProjectGitIdentity(project, identity);

    const exportProjectEditorSettings = async (project: ProjectDetails) => {
        await projectsBridge.exportProjectEditorSettings(project);
    };

    const importProjectEditorSettings = async (project: ProjectDetails) => {
        await projectsBridge.importProjectEditorSettings(project);
    };

    const openProjectFolder = async (project: ProjectDetails) => {
        await appBridge.openShellFolder(project.path);
    };

    const openProjectEditorFolder = async (project: ProjectDetails) => {
        await appBridge.openShellFolder(project.editor_settings_path);
    };

    const renameProject = async (
        project: ProjectDetails,
        options: RenameProjectOptions,
    ) => {
        const result = await projectsBridge.renameProject(project, options);
        if (result.success && result.projects) {
            setProjects(result.projects);
        }
        return result;
    };

    const getProjectGodotName = async (project: ProjectDetails) => {
        return await projectsBridge.getProjectGodotName(project);
    };

    const removeProject = async (project: ProjectDetails) => {
        const result = await projectsBridge.removeProject(project);
        setProjects(result);
    };

    const showMissingCodeEditorWarning = (
        project: ProjectDetails,
        result: Extract<
            LaunchProjectResult,
            { reason: 'code_editor_unavailable' }
        >,
    ) => {
        const editor = result.integration.displayName;
        const handleError = (error: unknown) => {
            addAlert(
                t('common:error'),
                error instanceof Error
                    ? error.message
                    : t('messages.codeEditorLaunch.actionFailed'),
            );
        };

        addCustomConfirm(
            t('messages.codeEditorLaunch.title', { editor }),
            <div className="flex flex-col gap-2">
                <p>{t('messages.codeEditorLaunch.message', { editor })}</p>
                {project.release.mono && (
                    <p>{t('messages.codeEditorLaunch.dotnet')}</p>
                )}
            </div>,
            [
                {
                    typeClass: 'btn-primary',
                    text: t('messages.codeEditorLaunch.launchAnyway'),
                    onClick: async () => {
                        try {
                            await projectsBridge.launchProject(project, {
                                allowMissingCodeEditor: true,
                            });
                            return true;
                        } catch (error) {
                            handleError(error);
                            return false;
                        }
                    },
                },
                {
                    typeClass: 'btn-neutral',
                    text: t('messages.codeEditorLaunch.disableAndLaunch'),
                    onClick: async () => {
                        try {
                            const updatedProject = await setProjectCodeEditor(
                                project,
                                null,
                            );
                            await projectsBridge.launchProject(updatedProject);
                            return true;
                        } catch (error) {
                            handleError(error);
                            return false;
                        }
                    },
                },
                {
                    typeClass: 'btn-ghost',
                    text: t('messages.codeEditorLaunch.openSettings'),
                    onClick: () => {
                        navigate(appRoutePaths.settingsTab('codeEditors'));
                        return true;
                    },
                },
                {
                    isCancel: true,
                    typeClass: 'btn-ghost',
                    text: t('common:buttons.cancel'),
                },
            ],
            <TriangleAlert className="stroke-warning" />,
        );
    };

    const launchProject = async (project: ProjectDetails) => {
        const result = await projectsBridge.launchProject(project);
        if (!result.launched) {
            if (result.reason === 'code_editor_unavailable') {
                showMissingCodeEditorWarning(project, result);
                return project;
            }
            return result.project;
        }

        return project;
    };

    const refreshProjects = async () => {
        await getProjects();
    };

    const checkProjectValid = (project: ProjectDetails) => {
        const result = projectsBridge.checkProjectValid(project);
        return result;
    };

    // biome-ignore lint/correctness/useExhaustiveDependencies: getProjects would refresh infinitely
    useEffect(() => {
        const off = subscribeAppEvent('projects-updated', setProjects);
        const offCodeEditorIntegrations = subscribeAppEvent(
            'code-editor-integrations-updated',
            setCodeEditorSettings,
        );
        const offLaunchWarning = subscribeAppEvent(
            'project-launch-code-editor-warning',
            ({ project, result }) =>
                showMissingCodeEditorWarning(project, result),
        );
        // Initial data fetching on mount
        getProjects();

        return () => {
            off();
            offCodeEditorIntegrations();
            offLaunchWarning();
        };
    }, []);

    return (
        <projectsContext.Provider
            value={{
                projects,
                codeEditorSettings,
                loading,
                rescanCodeEditorIntegration,
                addProject,
                setProjectEditor,
                setProjectWindowed,
                setProjectPinned,
                reorderPinnedProjects,
                setProjectCodeEditor,
                resetProjectCodeEditorConfig,
                initializeProjectGit,
                getProjectGitIdentity,
                setProjectGitIdentity,
                exportProjectEditorSettings,
                importProjectEditorSettings,
                openProjectFolder,
                openProjectEditorFolder,
                renameProject,
                getProjectGodotName,
                removeProject,
                launchProject,
                refreshProjects,
                checkProjectValid,
                createProject,
            }}
        >
            {children}
        </projectsContext.Provider>
    );
};
