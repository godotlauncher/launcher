import type {
    AppIntegrationAccessTarget,
    AppIntegrationAccessTargetCapability,
} from './app-integration.types.js';

export type AppIntegrationCapabilityKind = AppIntegrationAccessTargetCapability;

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

export type RepositoryCreationRepository = {
    id: string;
    owner: string;
    name: string;
    cloneUrl: string;
    webUrl: string;
};

export type RepositoryCreationRequest = {
    credential: string;
    accessTarget: AppIntegrationAccessTarget;
    repositoryName: string;
    signal: AbortSignal;
};

export type RepositoryPushCredentialRequest = {
    credential: string;
    accessTarget: AppIntegrationAccessTarget;
};

export type RepositoryCreation = {
    repository: RepositoryCreationRepository;
    gitCredential: {
        username: string;
        password: string;
    };
};

export type RepositoryCreationFailureReason =
    | 'invalid-request'
    | 'no-usable-connection'
    | 'secure-storage-unavailable'
    | 'permission-update-required'
    | 'target-unavailable'
    | 'invalid-repository-name'
    | 'repository-name-unavailable-or-policy-rejected'
    | 'rate-limited'
    | 'network-unavailable'
    | 'remote-creation-uncertain'
    | 'provider-unavailable';

export class RepositoryCreationError extends Error {
    /**
     * Creates a safe repository-creation failure.
     *
     * @param reason - Stable main-process failure classification.
     */
    constructor(readonly reason: RepositoryCreationFailureReason) {
        super(`Repository creation failed: ${reason}`);
        this.name = 'RepositoryCreationError';
    }
}

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

export interface RepositoryCreationCapability {
    readonly metadata: AppIntegrationCapabilityMetadata & {
        kind: 'repository-creation';
    };

    /** Creates one empty private repository through an approved access target. */
    createRepository(
        request: RepositoryCreationRequest,
    ): Promise<RepositoryCreation>;

    /** Formats a fresh credential for a retry against a confirmed repository. */
    getGitCredential(request: RepositoryPushCredentialRequest): {
        username: string;
        password: string;
    };
}

export type AppIntegrationCapability =
    | RepositoryBrowsingCapability
    | RepositoryCreationCapability;

export type AppIntegrationCredentialRoute = {
    connectionId: string;
    accountLogin: string;
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
