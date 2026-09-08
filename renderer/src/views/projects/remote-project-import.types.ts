import type {
    ListConnectedRepositoriesResult,
    PublicGitSourceInspectionResult,
    RemoteDiscoveredProject,
    RemoteProjectSubmoduleActivity,
} from '@shared/contracts';

export type RemoteProjectSource = 'public-git-url' | 'github';

export type RemoteProjectImportStep =
    | 'source'
    | 'connection'
    | 'destination'
    | 'importing'
    | 'import-failed'
    | 'submodules'
    | 'git-identity'
    | 'initialising-submodules'
    | 'review'
    | 'cancel-review'
    | 'checking-projects'
    | 'editors-required'
    | 'registering-projects'
    | 'registration-complete';

export type RemoteProjectPostGitIdentityStep = 'submodules' | 'review';

export type RemoteProjectGitIdentityWarning = 'identity' | 'preset';

type RemoteProjectRegistrationOutcomeBase = {
    project: RemoteDiscoveredProject;
    originalName: string;
    launcherName: string;
};

export type RemoteProjectRegistrationOutcome =
    | (RemoteProjectRegistrationOutcomeBase & {
          status: 'added';
          error?: never;
      })
    | (RemoteProjectRegistrationOutcomeBase & {
          status: 'skipped' | 'failed';
          error: string;
      });

export type RemoteProjectSubmoduleActivityEntry = {
    id: number;
    activity: RemoteProjectSubmoduleActivity;
};

export type RemoteProjectRepositoryFailure = Extract<
    ListConnectedRepositoriesResult,
    { ok: false }
>['reason'];

export type RemoteProjectPublicSourceFailure = Extract<
    PublicGitSourceInspectionResult,
    { ok: false }
>['reason'];
