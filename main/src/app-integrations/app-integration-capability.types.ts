import type { AppIntegrationAccessTarget } from './app-integration.types.js';

export type AppIntegrationCapabilityKind = 'repository-browsing';

export type AppIntegrationCapabilityMetadata = {
    providerId: string;
    kind: AppIntegrationCapabilityKind;
};

export type RepositoryHostingFailureReason =
    | 'invalid-request'
    | 'no-usable-connection'
    | 'secure-storage-unavailable'
    | 'reauthorisation-required'
    | 'repository-unavailable'
    | 'provider-unavailable'
    | 'network-unavailable'
    | 'rate-limited'
    | 'session-expired';

export type RepositoryBrowsingRepository = {
    id: string;
    owner: string;
    name: string;
    visibility: 'public' | 'private' | 'internal';
    cloneUrl: string;
};

export type RepositoryBrowsingPage = {
    repositories: RepositoryBrowsingRepository[];
    nextCursor: string | null;
};

export type RepositoryBrowsingRequest = {
    credential: string;
    accessTarget: AppIntegrationAccessTarget;
    cursor: string | null;
    signal: AbortSignal;
};

export type RepositorySelectionRequest = {
    credential: string;
    accessTarget: AppIntegrationAccessTarget;
    repository: RepositoryBrowsingRepository;
    signal: AbortSignal;
};

export type RepositorySelection = {
    repository: RepositoryBrowsingRepository;
    gitCredential: {
        username: string;
        password: string;
    };
};

export class RepositoryBrowsingError extends Error {
    /**
     * Creates a safe repository-browsing failure.
     *
     * @param reason - Stable main-process failure classification.
     */
    constructor(readonly reason: RepositoryHostingFailureReason) {
        super(`Repository browsing failed: ${reason}`);
        this.name = 'RepositoryBrowsingError';
    }
}

export interface RepositoryBrowsingCapability {
    readonly metadata: AppIntegrationCapabilityMetadata & {
        kind: 'repository-browsing';
    };

    /** Lists one provider page for an authorised access target. */
    listRepositories(
        request: RepositoryBrowsingRequest,
    ): Promise<RepositoryBrowsingPage>;

    /** Revalidates a repository immediately before a later clone operation. */
    resolveRepository(
        request: RepositorySelectionRequest,
    ): Promise<RepositorySelection>;
}

export type AppIntegrationCapability = RepositoryBrowsingCapability;

export type AppIntegrationCredentialRoute = {
    connectionId: string;
    accessTarget: AppIntegrationAccessTarget;
    credential: string;
};

export type AppIntegrationCredentialLeaseResult<T> =
    | { ok: true; value: T }
    | {
          ok: false;
          reason:
              | 'no-usable-connection'
              | 'secure-storage-unavailable'
              | 'reauthorisation-required'
              | 'provider-unavailable';
      };
