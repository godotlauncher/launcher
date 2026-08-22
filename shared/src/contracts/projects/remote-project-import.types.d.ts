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
};

export type RemoteProjectImportResult =
    | {
          ok: true;
          jobId: string;
          repositoryPath: string;
          projects: RemoteDiscoveredProject[];
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
    | 'complete'
    | 'cancelled'
    | 'error';

export type RemoteProjectImportProgress = {
    jobId: string;
    stage: RemoteProjectImportProgressStage;
    canCancel: boolean;
    percent?: number;
    result?: RemoteProjectImportResult;
};

export type CancelRemoteProjectImportResult = {
    jobId: string;
    status: 'cancelling' | 'not-found' | 'not-cancellable';
};
