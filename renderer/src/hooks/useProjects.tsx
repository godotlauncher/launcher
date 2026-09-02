import type {
    AddProjectOptions,
    AddProjectToListResult,
    ChangeProjectEditorResult,
    CheckCreateProjectRepositoryNameAvailabilityResult,
    CodeEditorId,
    CodeEditorIntegrationSettings,
    CreateProjectGitOptions,
    CreateProjectParentRepositoryConsent,
    CreateProjectPublicationOptions,
    CreateProjectResult,
    GitIdentity,
    GitRepositoryInspection,
    InitializeProjectGitResult,
    InstalledRelease,
    LaunchProjectResult,
    ListCreateProjectPublicationTargetsResult,
    ProjectDetails,
    ProjectGitIdentityResult,
    ProjectPublicationRecoveryAction,
    ReleaseSummary,
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
    useRef,
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
import { useRelease } from './useRelease';

export type ProjectEditorRepairRequest = {
    release: ReleaseSummary;
    mono: boolean;
    projects: ProjectDetails[];
};

interface ProjectsContext {
    projects: ProjectDetails[];
    projectGitHubUrls: ReadonlyMap<string, string>;
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
    queueProjectEditorRepairs: (requests: ProjectEditorRepairRequest[]) => void;
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
        publication?: CreateProjectPublicationOptions,
        parentRepositoryConsent?: CreateProjectParentRepositoryConsent,
    ) => Promise<CreateProjectResult>;
    listCreateProjectPublicationTargets: () => Promise<ListCreateProjectPublicationTargetsResult>;
    checkCreateProjectRepositoryNameAvailability: (
        publication: CreateProjectPublicationOptions,
    ) => Promise<CheckCreateProjectRepositoryNameAvailabilityResult>;
    inspectCreateProjectRepository: (
        projectName: string,
        overwriteProjectPath?: string,
    ) => Promise<GitRepositoryInspection>;
    retryCreateProjectPublication: (
        attemptId: string,
        publication?: CreateProjectPublicationOptions,
        recoveryAction?: ProjectPublicationRecoveryAction,
    ) => Promise<CreateProjectResult>;
    discardCreateProjectPublication: (attemptId: string) => Promise<void>;
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
    const { installRelease } = useRelease();
    const [projects, setProjects] = useState<ProjectDetails[]>([]);
    const [projectGitHubUrls, setProjectGitHubUrls] = useState<
        ReadonlyMap<string, string>
    >(new Map());
    const githubLinksRequestRef = useRef(0);
    const [codeEditorSettings, setCodeEditorSettings] = useState<
        CodeEditorIntegrationSettings[]
    >([]);
    const [loading, setLoading] = useState<boolean>(true);

    /** Refreshes the process-local project-to-GitHub URL cache. */
    const refreshProjectGitHubLinks = async (): Promise<void> => {
        const requestId = ++githubLinksRequestRef.current;
        try {
            const links = await projectsBridge.refreshProjectGitHubLinks();
            if (githubLinksRequestRef.current === requestId) {
                setProjectGitHubUrls(
                    new Map(
                        links.map(({ projectPath, url }) => [projectPath, url]),
                    ),
                );
            }
        } catch {
            if (githubLinksRequestRef.current === requestId) {
                setProjectGitHubUrls(new Map());
            }
        }
    };

    /** Refreshes stored projects, editor integrations, and cached GitHub links. */
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
        void refreshProjectGitHubLinks();
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
     * @param publication - Optional private GitHub repository publication request.
     * @param parentRepositoryConsent - Exact parent repository accepted for this submission.
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
        publication?: CreateProjectPublicationOptions,
        parentRepositoryConsent?: CreateProjectParentRepositoryConsent,
    ) => {
        const result = await projectsBridge.createProject(
            projectName,
            release,
            renderer,
            codeEditorId,
            withGit,
            overwriteProjectPath,
            gitOptions,
            publication,
            parentRepositoryConsent,
        );

        if (result.projectDetails) {
            await refreshProjects();
        }

        return result;
    };

    /** Lists GitHub owners eligible for Create Project publishing. */
    const listCreateProjectPublicationTargets = () =>
        projectsBridge.listCreateProjectPublicationTargets('github');

    /** Checks a Create Project repository name through its selected owner route. */
    const checkCreateProjectRepositoryNameAvailability = (
        publication: CreateProjectPublicationOptions,
    ) =>
        projectsBridge.checkCreateProjectRepositoryNameAvailability(
            publication,
        );

    /**
     * Inspects the final planned Create Project path for an enclosing repository.
     *
     * @param projectName - Display name for the new project.
     * @param overwriteProjectPath - Optional path used to choose the project parent directory.
     * @returns The repository inspection for the final sanitised project path.
     */
    const inspectCreateProjectRepository = (
        projectName: string,
        overwriteProjectPath?: string,
    ) =>
        projectsBridge.inspectCreateProjectRepository(
            projectName,
            overwriteProjectPath,
        );

    /**
     * Retries a process-local Create Project publication attempt.
     *
     * @param attemptId - Opaque failed publication attempt ID.
     * @param publication - Optional edited selection before remote creation.
     * @param recoveryAction - Exact uncertain-recovery action shown by main.
     * @returns The latest project creation and publication result.
     */
    const retryCreateProjectPublication = async (
        attemptId: string,
        publication?: CreateProjectPublicationOptions,
        recoveryAction?: ProjectPublicationRecoveryAction,
    ) => {
        const result = await projectsBridge.retryCreateProjectPublication(
            attemptId,
            publication,
            recoveryAction,
        );
        if (result.publication?.status === 'published') {
            void refreshProjectGitHubLinks();
        }
        return result;
    };

    /**
     * Forgets a process-local publication attempt without changing repositories.
     *
     * @param attemptId - Opaque failed publication attempt ID.
     * @returns A promise that resolves after the attempt is forgotten.
     */
    const discardCreateProjectPublication = (attemptId: string) =>
        projectsBridge.discardCreateProjectPublication(attemptId);

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

    /**
     * Installs one queued editor and assigns it to every associated project.
     *
     * @param request - Editor release and projects to repair in the background.
     * @returns A promise that ends after installation and project repair.
     */
    const runProjectEditorRepair = async (
        request: ProjectEditorRepairRequest,
    ): Promise<void> => {
        const installResult = await installRelease(
            request.release,
            request.mono,
            'project',
        );
        if (!installResult.success || !installResult.release) {
            addAlert(
                t('common:error'),
                installResult.error || t('messages.addProjectError'),
                <TriangleAlert className="stroke-error" />,
            );
            return;
        }

        let assignmentError: string | undefined;
        for (const project of request.projects) {
            try {
                const result = await setProjectEditor(
                    project,
                    installResult.release,
                );
                if (!result.success) {
                    assignmentError ??=
                        result.error ?? t('messages.addProjectError');
                }
            } catch (error) {
                assignmentError ??=
                    error instanceof Error ? error.message : String(error);
            }
        }

        if (assignmentError) {
            addAlert(
                t('common:error'),
                assignmentError,
                <TriangleAlert className="stroke-error" />,
            );
        }
    };

    /**
     * Submits editor repairs without making the active project flow wait.
     *
     * @param requests - Editor installs and their associated projects.
     */
    const queueProjectEditorRepairs = (
        requests: ProjectEditorRepairRequest[],
    ): void => {
        for (const request of requests) {
            void runProjectEditorRepair(request);
        }
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
        const off = subscribeAppEvent('projects-updated', (updatedProjects) => {
            setProjects(updatedProjects);
            void refreshProjectGitHubLinks();
        });
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
                projectGitHubUrls,
                codeEditorSettings,
                loading,
                rescanCodeEditorIntegration,
                addProject,
                setProjectEditor,
                queueProjectEditorRepairs,
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
                listCreateProjectPublicationTargets,
                checkCreateProjectRepositoryNameAvailability,
                inspectCreateProjectRepository,
                retryCreateProjectPublication,
                discardCreateProjectPublication,
            }}
        >
            {children}
        </projectsContext.Provider>
    );
};
