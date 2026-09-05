import type {
    CodeEditorId,
    CreateProjectPublicationOptions,
    CreateProjectPublicationOutcome,
    GitLfsTrackingPolicy,
    ProjectDetails,
    RendererType,
} from '@shared/contracts';
import type { ExistingRepositoryConsequences } from './components/create-project-existing-repository-dialog.component';
import type { CreateProjectEditorSelection } from './createProject.model';

export type FailedPublication = Extract<
    CreateProjectPublicationOutcome,
    { status: 'failed' }
>;

export type CreateProjectDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export type CreateProjectSubmission = {
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
