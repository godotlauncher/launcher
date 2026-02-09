import {
    createContext,
    type FC,
    type PropsWithChildren,
    useContext,
    useEffect,
    useState,
} from 'react';

interface ProjectsContext {
    projects: ProjectDetails[];
    loading: boolean;
    addProject: (projectPath: string) => Promise<AddProjectToListResult>;
    setProjectEditor: (
        project: ProjectDetails,
        release: InstalledRelease,
    ) => Promise<ChangeProjectEditorResult>;
    openProjectFolder: (project: ProjectDetails) => Promise<void>;
    showProjectMenu: (project: ProjectDetails) => Promise<void>;
    openProjectEditorFolder: (project: ProjectDetails) => Promise<void>;
    removeProject: (project: ProjectDetails) => Promise<void>;
    launchProject: (project: ProjectDetails) => Promise<boolean>;
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
        const projects = await window.electron.getProjectsDetails();
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
        const result = await window.electron.createProject(
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

    const addProject = async (projectPath: string) => {
        const addResult = await window.electron.addProject(projectPath);
        if (addResult.success && addResult.projects) {
            setProjects(addResult.projects);
        }
        return addResult;
    };

    const setProjectEditor = async (
        project: ProjectDetails,
        release: InstalledRelease,
    ) => {
        const result = await window.electron.setProjectEditor(project, release);
        if (result.success && result.projects) {
            setProjects(result.projects);
        }

        return result;
    };

    const openProjectFolder = async (project: ProjectDetails) => {
        await window.electron.openShellFolder(project.path);
    };

    const openProjectEditorFolder = async (project: ProjectDetails) => {
        await window.electron.openShellFolder(project.editor_settings_path);
    };

    const removeProject = async (project: ProjectDetails) => {
        const result = await window.electron.removeProject(project);
        setProjects(result);
    };

    const launchProject = async (project: ProjectDetails) => {
        const all = await window.electron.checkAllProjectsValid();
        setProjects(all);

        const p = all.find((p) => p.path === project.path);

        if (p?.valid) {
            await window.electron.launchProject(project);
        }

        return p?.valid ?? false;
    };

    const refreshProjects = async () => {
        getProjects();
    };

    const checkProjectValid = (project: ProjectDetails) => {
        const result = window.electron.checkProjectValid(project);
        return result;
    };

    const showProjectMenu = async (project: ProjectDetails) => {
        await window.electron.showProjectMenu(project);
    };

    // biome-ignore lint/correctness/useExhaustiveDependencies: getProjects would refresh infinitely
    useEffect(() => {
        const off = window.electron.subscribeProjects(setProjects);
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
                openProjectFolder,
                openProjectEditorFolder,
                removeProject,
                launchProject,
                refreshProjects,
                checkProjectValid,
                createProject,
                showProjectMenu,
            }}
        >
            {children}
        </projectsContext.Provider>
    );
};
