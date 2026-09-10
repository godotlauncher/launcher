import type { BackendResult } from '../app/index.js';
import type {
    CodeEditorId,
    CodeEditorIntegrationSummary,
} from '../codeEditorIntegration/index.js';
import type { GitLfsTrackingPolicy } from '../git-lfs/index.js';
import type {
    EditorChannel,
    EditorFlavor,
    InstalledRelease,
    ReleaseSummary,
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

export type ProjectGitHubLink = {
    projectPath: string;
    url: string;
};

export type ProjectGitSetupOutcome =
    | { status: 'not-requested' }
    | { status: 'git-unavailable' }
    | ({ status: 'initialized' } & GitRepositoryInfo)
    | ({ status: 'existing-repository' } & GitRepositoryInfo);

export type CreateProjectGitLfsOptions = {
    trackingPolicy: GitLfsTrackingPolicy;
};

export type ProjectGitLfsRecovery = 'not-required' | 'completed' | 'failed';

export type ProjectGitLfsSetupOutcome =
    | { status: 'not-requested' }
    | {
          status: 'configured';
          trackingPolicy: GitLfsTrackingPolicy;
      }
    | {
          status: 'unavailable';
          recovery: ProjectGitLfsRecovery;
      }
    | {
          status: 'failed';
          stage: 'install' | 'track' | 'verify';
          recovery: ProjectGitLfsRecovery;
      };

export type CreateProjectGitOptions = {
    gitLfs?: CreateProjectGitLfsOptions;
} & (
    | { initialCommit: 'skip' }
    | {
          initialCommit: 'create';
          identity?: GitIdentity & { scope: GitIdentityScope };
      }
);

export type CreateProjectParentRepositoryConsent = {
    root: string;
};

export type CreateProjectDestinationInspection =
    | { status: 'available' }
    | { status: 'blocked'; error: string };

export type CreateProjectPublicationTarget = {
    providerId: string;
    connectionId: string;
    accessTargetId: string;
    ownerLogin: string;
    ownerType: 'organization' | 'user';
    accountLogin: string;
};

export type CreateProjectPublicationTargetFailureReason =
    | 'connection-required'
    | 'permission-update-required'
    | 'secure-storage-unavailable'
    | 'provider-unavailable';

export type ListCreateProjectPublicationTargetsResult =
    | { success: true; targets: CreateProjectPublicationTarget[] }
    | {
          success: false;
          reason: CreateProjectPublicationTargetFailureReason;
          targets: [];
      };

export type CreateProjectPublicationOptions = {
    providerId: string;
    connectionId: string;
    accessTargetId: string;
    repositoryName: string;
};

export type CreateProjectRepositoryNameAvailabilityFailureReason =
    | 'invalid-repository-name'
    | 'connection-required'
    | 'permission-update-required'
    | 'secure-storage-unavailable'
    | 'target-unavailable'
    | 'rate-limited'
    | 'network-unavailable'
    | 'provider-unavailable';

export type CheckCreateProjectRepositoryNameAvailabilityResult =
    | { status: 'available' }
    | { status: 'unavailable' }
    | {
          status: 'unknown';
          reason: CreateProjectRepositoryNameAvailabilityFailureReason;
      };

export type ProjectPublicationFailureReason =
    | 'connection-required'
    | 'permission-update-required'
    | 'secure-storage-unavailable'
    | 'target-unavailable'
    | 'invalid-repository-name'
    | 'repository-name-unavailable-or-policy-rejected'
    | 'rate-limited'
    | 'network-unavailable'
    | 'remote-creation-uncertain'
    | 'recovered-repository-not-empty'
    | 'remote-created-origin-failed'
    | 'remote-created-push-failed'
    | 'remote-created-verification-failed'
    | 'local-repository-not-standalone'
    | 'local-repository-changed'
    | 'provider-unavailable';

export type PublishedGitHubRepository = {
    owner: string;
    name: string;
    webUrl: string;
};

export type ProjectPublicationRecoveryAction =
    | 'check-and-retry'
    | 'confirm-recovered-repository';

export type CreateProjectPublicationOutcome =
    | { status: 'not-requested' }
    | {
          status: 'published';
          repository: PublishedGitHubRepository;
      }
    | {
          status: 'failed';
          attemptId: string;
          stage: 'remote-create' | 'origin' | 'push' | 'verification';
          reason: ProjectPublicationFailureReason;
          repository?: PublishedGitHubRepository;
          intendedRepository?: { owner: string; name: string; webUrl: string };
          recoveryAction?: ProjectPublicationRecoveryAction;
          canRetry: boolean;
          canEdit: boolean;
      };

export type LaunchProjectOptions = {
    allowMissingCodeEditor?: boolean;
};

export type LaunchProjectResult =
    | { launched: true }
    | {
          launched: false;
          reason: 'project_unavailable';
          project: ProjectDetails;
      }
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
    parentRepositoryConfirmation?: GitRepositoryInfo;
    gitSetup?: ProjectGitSetupOutcome;
    gitLfsSetup?: ProjectGitLfsSetupOutcome;
    publication?: CreateProjectPublicationOutcome;
};

export type InitializeProjectGitResult = {
    project: ProjectDetails;
    gitSetup:
        | ({ status: 'initialized' } & GitRepositoryInfo)
        | ({ status: 'existing-repository' } & GitRepositoryInfo);
};

export type ProjectLauncherEditorRequest = {
    kind: 'exact';
    channel: EditorChannel;
    flavor: EditorFlavor;
    base_version: string;
    version: string;
};

export type ProjectInferredEditorRequest = {
    kind: 'stable-base';
    channel: 'official';
    flavor: 'gdscript' | 'dotnet';
    base_version: string;
};

export type ProjectEditorRequest =
    | ProjectLauncherEditorRequest
    | ProjectInferredEditorRequest;

export type ProjectImportInspection = {
    editorResolution?: AddProjectEditorResolution;
    editorRequest?: ProjectEditorRequest;
    editor?: InstalledRelease;
    directory?: string;
    registered?: boolean;
    projectFilePath: string;
    name: string;
    godotName?: string;
    error?: string;
};

export type AddProjectOptions = {
    name?: string;
    codeEditorId?: CodeEditorId | null;
} & (
    | {
          resolution?: undefined;
      }
    | {
          resolution: 'add_missing';
          editorChoiceId?: string;
      }
    | {
          resolution: 'use_fallback';
          release: InstalledRelease;
      }
    | {
          resolution: 'use_selected';
          editorChoiceId: string;
      }
);

export type ProjectEditorChoice = {
    id: string;
    version: string;
    name?: string;
    source: 'official' | 'custom';
    flavor: EditorFlavor;
    prerelease: boolean;
    installed: boolean;
    recommended: boolean;
    release?: ReleaseSummary;
};

export type AddProjectEditorResolution = {
    requested: ProjectEditorRequest;
    choices?: ProjectEditorChoice[];
    fallback?: InstalledRelease;
    downloadable?:
        | {
              match: 'exact';
              version: string;
              flavor: EditorFlavor;
              prerelease: boolean;
          }
        | {
              match: 'stable-base';
              base_version: string;
              flavor: 'gdscript' | 'dotnet';
          };
};

export type AddProjectToListResult = BackendResult & {
    projects?: ProjectDetails[];
    newProject?: ProjectDetails;
    importConflict?: 'name' | 'folder';
    editorResolution?: AddProjectEditorResolution;
    recoveredCodeEditorConfigFiles?: string[];
};

export type ChangeProjectEditorResult = BackendResult & {
    projects?: ProjectDetails[];
    recoveredCodeEditorConfigFiles?: string[];
};

/** An installed editor or an official editor selected before installation. */
export type ProjectEditorSelection =
    | InstalledRelease
    | {
          release: ReleaseSummary;
          mono: boolean;
      };

/** Identifies the selection that an install completion is allowed to repair. */
export type ProjectEditorSelectionExpectation = Pick<
    InstalledRelease,
    'version' | 'mono'
>;

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

export type * from './projects.bridge.js';
export type * from './remote-project-import.types.js';
export type * from './remote-project-source.types.js';
