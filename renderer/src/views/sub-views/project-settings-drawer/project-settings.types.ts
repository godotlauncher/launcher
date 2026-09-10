import type {
    CodeEditorId,
    GitIdentity,
    InitializeProjectGitResult,
    InstalledRelease,
    ProjectDetails,
    ProjectEditorSelection,
    ProjectGitIdentityResult,
    RenameProjectOptions,
    RenameProjectResult,
} from '@shared/contracts';

/** Identifies one Project Settings tab. */
export type ProjectSettingsTab =
    | 'project'
    | 'sourceControl'
    | 'codeEditor'
    | 'launch';

/** Project state and update operations accepted by the drawer. */
export type ProjectSettingsDrawerProps = {
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
        release: ProjectEditorSelection,
    ) => Promise<ProjectDetails>;
    onSetProjectCodeEditor: (
        project: ProjectDetails,
        id: CodeEditorId | null,
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
