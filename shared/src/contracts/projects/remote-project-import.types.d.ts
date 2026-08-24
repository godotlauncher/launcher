import type { EditorChannel, EditorFlavor } from '../releases/index.js';

export type RemoteProjectImportRequest = {
    parentDirectory: string;
    directoryName: string;
} & (
    | { source: 'public-git-url'; url: string }
    | {
          source: 'connected-repository';
          providerId: string;
          repositoryRef: string;
      }
);

export type RemoteProjectImportFailureReason =
    | 'invalid-request'
    | 'already-running'
    | 'git-unavailable'
    | 'invalid-url'
    | 'unsupported-url'
    | 'invalid-host'
    | 'invalid-path'
    | 'dns-unavailable'
    | 'non-public-host'
    | 'public-clone-incompatible'
    | 'no-usable-connection'
    | 'secure-storage-unavailable'
    | 'reauthorisation-required'
    | 'repository-unavailable'
    | 'provider-unavailable'
    | 'network-unavailable'
    | 'rate-limited'
    | 'session-expired'
    | 'destination-invalid'
    | 'destination-conflict'
    | 'clone-failed'
    | 'not-godot-project'
    | 'discovery-failed'
    | 'discovery-limit-exceeded'
    | 'finalise-failed'
    | 'cancelled';

export type RemoteDiscoveredProject = {
    name: string;
    relativePath: string;
    projectFilePath: string;
    detectedEditor: RemoteDetectedProjectEditor | null;
};

export type RemoteDetectedProjectEditor =
    | {
          kind: 'exact';
          channel: EditorChannel;
          flavor: EditorFlavor;
          baseVersion: string;
          version: string;
      }
    | {
          kind: 'stable-base';
          channel: 'official';
          flavor: 'gdscript' | 'dotnet';
          baseVersion: string;
      };

export type RemoteProjectImportResult =
    | {
          ok: true;
          jobId: string;
          repositoryPath: string;
          projects: RemoteDiscoveredProject[];
          hasSubmodules: boolean;
      }
    | {
          ok: false;
          jobId: string | null;
          reason: RemoteProjectImportFailureReason;
          repositoryPath?: string;
      };

export type RemoteProjectImportProgressStage =
    | 'preparing'
    | 'validating-source'
    | 'validating-destination'
    | 'cloning'
    | 'cancelling'
    | 'finalising'
    | 'discovering-projects'
    | 'validating-submodules'
    | 'initialising-submodules'
    | 'complete'
    | 'cancelled'
    | 'error';

export type RemoteProjectImportProgress = {
    jobId: string;
    stage: RemoteProjectImportProgressStage;
    canCancel: boolean;
    percent?: number;
    activity?: RemoteProjectSubmoduleActivity;
    result?: RemoteProjectImportResult;
};

export type RemoteProjectSubmoduleActivity =
    | { type: 'found'; count: number }
    | { type: 'validating'; path: string }
    | { type: 'initialising'; path: string }
    | { type: 'initialised'; path: string }
    | { type: 'scanning-projects' }
    | { type: 'complete'; projectCount: number }
    | { type: 'stopped'; path?: string };

export type InitialiseRemoteProjectSubmodulesResult =
    | {
          ok: true;
          jobId: string;
          projects: RemoteDiscoveredProject[];
      }
    | {
          ok: false;
          jobId: string;
          reason:
              | 'not-found'
              | 'already-running'
              | 'git-unavailable'
              | 'unsupported-submodule'
              | 'submodule-unavailable'
              | 'submodule-limit-exceeded'
              | 'discovery-failed'
              | 'discovery-limit-exceeded'
              | 'cancelled';
      };

export type CancelRemoteProjectImportResult = {
    jobId: string;
    status: 'cancelling' | 'not-found' | 'not-cancellable';
};

export type ResolveRemoteProjectCloneAction = 'keep' | 'delete';

export type ResolveRemoteProjectCloneResult = {
    jobId: string;
    status:
        | 'kept'
        | 'deleted'
        | 'not-found'
        | 'changed'
        | 'busy'
        | 'delete-failed';
};
