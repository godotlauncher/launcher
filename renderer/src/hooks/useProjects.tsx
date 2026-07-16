import type {
    AddProjectOptions,
    AddProjectToListResult,
    ChangeProjectEditorResult,
    CreateProjectResult,
    InstalledRelease,
    ProjectDetails,
    RenameProjectOptions,
    RenameProjectResult,
    RendererType,
    SetProjectVSCodeResult,
} from '@shared/contracts';
import {
    createContext,
    type FC,
    type PropsWithChildren,
    useContext,
    useEffect,
    useState,
} from 'react';
import { appBridge, subscribeAppEvent } from '../bridge.ts';

interface ProjectsContext {
    projects: ProjectDetails[];
    loading: boolean;
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
    setProjectVSCode: (
        project: ProjectDetails,
        enable: boolean,
    ) => Promise<SetProjectVSCodeResult>;
    initializeProjectGit: (project: ProjectDetails) => Promise<ProjectDetails>;
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
        withVSCode: boolean,
        withGit: boolean,
        overwriteProjectPath?: string,
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
    const [projects, setProjects] = useState<ProjectDetails[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    const getProjects = async () => {
        setLoading(true);
        const projects = await appBridge.getProjectsDetails();
        setProjects(projects);
        setLoading(false);
    };

    const createProject = async (
        projectName: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        withVSCode: boolean,
        withGit: boolean,
        overwriteProjectPath?: string,
    ) => {
        const result = await appBridge.createProject(
            projectName,
            release,
            renderer,
            withVSCode,
            withGit,
            overwriteProjectPath,
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
        const addResult = await appBridge.addProject(projectPath, options);
        if (addResult.success && addResult.projects) {
            setProjects(addResult.projects);
        }
        return addResult;
    };

    const setProjectEditor = async (
        project: ProjectDetails,
        release: InstalledRelease,
    ) => {
        const result = await appBridge.setProjectEditor(project, release);
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
        const updatedProject = await appBridge.setProjectWindowed(
            project,
            openWindowed,
        );
        updateProjectState(updatedProject);
        return updatedProject;
    };

    const setProjectVSCode = async (
        project: ProjectDetails,
        enable: boolean,
    ) => {
        const updatedProject = await appBridge.setProjectVSCode(
            project,
            enable,
        );
        updateProjectState(updatedProject);
        return updatedProject;
    };

    const initializeProjectGit = async (project: ProjectDetails) => {
        const updatedProject = await appBridge.initializeProjectGit(project);
        updateProjectState(updatedProject);
        return updatedProject;
    };

    const exportProjectEditorSettings = async (project: ProjectDetails) => {
        await appBridge.exportProjectEditorSettings(project);
    };

    const importProjectEditorSettings = async (project: ProjectDetails) => {
        await appBridge.importProjectEditorSettings(project);
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
        const result = await appBridge.renameProject(project, options);
        if (result.success && result.projects) {
            setProjects(result.projects);
        }
        return result;
    };

    const getProjectGodotName = async (project: ProjectDetails) => {
        return await appBridge.getProjectGodotName(project);
    };

    const removeProject = async (project: ProjectDetails) => {
        const result = await appBridge.removeProject(project);
        setProjects(result);
    };

    const launchProject = async (project: ProjectDetails) => {
        const all = await appBridge.checkAllProjectsValid();
        setProjects(all);

        const p = all.find((p) => p.path === project.path);

        if (p?.valid) {
            await appBridge.launchProject(project);
        }

        return p;
    };

    const refreshProjects = async () => {
        getProjects();
    };

    const checkProjectValid = (project: ProjectDetails) => {
        const result = appBridge.checkProjectValid(project);
        return result;
    };

    // biome-ignore lint/correctness/useExhaustiveDependencies: getProjects would refresh infinitely
    useEffect(() => {
        const off = subscribeAppEvent('projects-updated', setProjects);
        // Initial data fetching on mount
        getProjects();

        return () => {
            off();
        };
    }, []);

    return (
        <projectsContext.Provider
            value={{
                projects,
                loading,
                addProject,
                setProjectEditor,
                setProjectWindowed,
                setProjectVSCode,
                initializeProjectGit,
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
