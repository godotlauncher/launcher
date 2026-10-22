import type {
    CodeEditorId,
    CreateProjectPublicationOptions,
    CreateProjectPublicationOutcome,
    CreateProjectSource,
    GitLfsTrackingPolicy,
    ProjectDetails,
    RendererType,
} from '@shared/contracts';
import type { CreateProjectEditorSelection } from './create-project.model';

export type FailedPublication = Extract<
    CreateProjectPublicationOutcome,
    { status: 'failed' }
>;

export type CreateProjectDrawerProps = {
    sourceProject?: ProjectDetails | null;
    onDuplicateRegistered?: (project: ProjectDetails) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export type CreateProjectSubmission = {
    source?: CreateProjectSource;
    projectName: string;
    editorSelection: CreateProjectEditorSelection;
    renderer: RendererType[5];
    codeEditorId: CodeEditorId | null;
    withGit: boolean;
    withGitLfs: boolean;
    gitLfsTrackingPolicy?: GitLfsTrackingPolicy;
    overwriteProjectPath?: string;
    publication?: CreateProjectPublicationOptions;
    editNow: boolean;
};

export type ExistingRepositoryDialogState =
    | {
          mode: 'confirmation';
          root: string;
          consequences: ExistingRepositoryConsequences;
          submission: CreateProjectSubmission;
      }
    | {
          mode: 'completion';
          root: string;
          consequences: ExistingRepositoryConsequences;
          project: ProjectDetails;
          submission: CreateProjectSubmission;
      };

export type ExistingRepositoryConsequences = {
    git: boolean;
    gitLfs: boolean;
    github: boolean;
};

export type GitIdentityDialogPage = 'warning' | 'preset' | 'identity';

export type CreateProjectProgressPhase =
    | 'installing'
    | 'creating'
    | 'git'
    | 'configuring'
    | 'publishing'
    | 'launching'
    | 'complete';
