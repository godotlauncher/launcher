import type { BackendResult } from '../app/index.js';
import type {
    CodeEditorId,
    CodeEditorIntegrationSummary,
} from '../codeEditorIntegration/index.js';
import type {
    EditorChannel,
    EditorFlavor,
    InstalledRelease,
} from '../releases/index.js';

export type LaunchPath = string;

export type ProjectInvalidReason = 'missing_project_file' | 'missing_editor';

export type GitIdentity = {
    name: string;
    email: string;
};

export type GitIdentityScope = 'repository' | 'global';

export type GitRepositoryKind = 'standard' | 'linked-worktree' | 'submodule';

export type GitRepositoryInfo = {
    root: string;
    isProjectRoot: boolean;
    kind: GitRepositoryKind;
};

export type GitRepositoryInspection =
    | ({ status: 'inside-work-tree' } & GitRepositoryInfo)
    | { status: 'not-a-repository' }
    | { status: 'git-unavailable' }
    | { status: 'inspection-failed' };

export type ProjectGitIdentityValue = {
    value: string;
    source: 'repository' | 'inherited' | 'missing';
};

export type ProjectGitIdentityResult =
    | {
          status: 'available';
          repository: GitRepositoryInfo;
          name: ProjectGitIdentityValue;
          email: ProjectGitIdentityValue;
          canUpdate: boolean;
      }
    | { status: 'not-a-repository' }
    | { status: 'git-unavailable' }
    | { status: 'inspection-failed' };

export type ProjectGitSetupOutcome =
    | { status: 'not-requested' }
    | { status: 'git-unavailable' }
    | ({ status: 'initialized' } & GitRepositoryInfo)
    | ({ status: 'existing-repository' } & GitRepositoryInfo);

export type CreateProjectGitOptions =
    | { initialCommit: 'skip' }
    | {
          initialCommit: 'create';
          identity?: GitIdentity & { scope: GitIdentityScope };
      };

export type LaunchProjectOptions = {
    allowMissingCodeEditor?: boolean;
};

export type LaunchProjectResult =
    | { launched: true }
    | {
          launched: false;
          reason: 'code_editor_unavailable';
          integration: CodeEditorIntegrationSummary;
      };

export type ProjectDetails = {
    name: string;
    version: string;
    version_number: number;
    renderer: string;
    path: string;
    icon_path?: string;
    editor_settings_path: string;
    editor_settings_file: string;
    added_at?: Date;
    last_opened: Date | null;
    pinned?: boolean;
    pinned_order?: number;
    open_windowed?: boolean;
    release: InstalledRelease;
    launch_path: string;
    config_version: 4 | 5;
    codeEditorId: CodeEditorId | null;
    withGit: boolean;
    valid: boolean;
    invalid_reason?: ProjectInvalidReason;
};

export type CreateProjectResult = BackendResult & {
    projectPath?: string;
    projectDetails?: ProjectDetails;
    gitSetup?: ProjectGitSetupOutcome;
};

export type InitializeProjectGitResult = {
    project: ProjectDetails;
    gitSetup:
        | ({ status: 'initialized' } & GitRepositoryInfo)
        | ({ status: 'existing-repository' } & GitRepositoryInfo);
};

export type ProjectLauncherEditorRequest = {
    channel: EditorChannel;
    flavor: EditorFlavor;
    base_version: string;
    version: string;
};

export type AddProjectOptions =
    | {
          resolution?: undefined;
      }
    | {
          resolution: 'add_missing';
      }
    | {
          resolution: 'use_fallback';
          release: InstalledRelease;
      };

export type AddProjectEditorResolution = {
    requested: ProjectLauncherEditorRequest;
    fallback?: InstalledRelease;
    downloadable?: {
        version: string;
        flavor: EditorFlavor;
        prerelease: boolean;
    };
};

export type AddProjectToListResult = BackendResult & {
    projects?: ProjectDetails[];
    newProject?: ProjectDetails;
    editorResolution?: AddProjectEditorResolution;
    recoveredCodeEditorConfigFiles?: string[];
};

export type ChangeProjectEditorResult = BackendResult & {
    projects?: ProjectDetails[];
    recoveredCodeEditorConfigFiles?: string[];
};

export type SetProjectCodeEditorResult = ProjectDetails & {
    recoveredCodeEditorConfigFiles?: string[];
};

export type RenameProjectOptions = {
    name: string;
    renameGodotProject: boolean;
};

export type RenameProjectResult = BackendResult & {
    project?: ProjectDetails;
    projects?: ProjectDetails[];
    errorField?: 'name' | 'godot';
};

export type RendererType = {
    5: 'FORWARD_PLUS' | 'MOBILE' | 'COMPATIBLE';
};

export type ProjectConfig = {
    configVersion: keyof RendererType;
    defaultRenderer: RendererType[keyof RendererType];
    resources: { src: string; dst: string }[];
    projectFilename: string;
    editorConfigFilename: (editor_version: number) => string;
    editorConfigFormat: number;
};

export type ProjectDefinition = Map<number, ProjectConfig>;
