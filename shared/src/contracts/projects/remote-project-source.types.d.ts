export type RemoteRepositorySummary = {
    repositoryRef: string;
    providerId: string;
    owner: string;
    name: string;
    visibility: 'public' | 'private' | 'internal';
    alreadyImported: boolean;
};

export type RemoteRepositoryPage = {
    repositories: RemoteRepositorySummary[];
    nextCursor: string | null;
};

export type ListConnectedRepositoriesResult =
    | { ok: true; page: RemoteRepositoryPage }
    | {
          ok: false;
          reason:
              | 'invalid-request'
              | 'no-usable-connection'
              | 'secure-storage-unavailable'
              | 'reauthorisation-required'
              | 'provider-unavailable'
              | 'network-unavailable'
              | 'rate-limited'
              | 'session-expired';
      };

export type PublicGitSourceInspectionResult =
    | {
          ok: true;
          canonicalUrl: string;
          suggestedDirectoryName: string;
      }
    | {
          ok: false;
          reason:
              | 'invalid-url'
              | 'unsupported-url'
              | 'invalid-host'
              | 'invalid-path'
              | 'dns-unavailable'
              | 'non-public-host';
      };
