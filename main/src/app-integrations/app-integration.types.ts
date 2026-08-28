export type AppIntegrationProviderMetadata = {
    id: string;
    displayName: string;
    order: number;
};

export type AppIntegrationModuleOptions = {
    directory: string;
    metadataFileName: string;
    secretsFileName: string;
};

export type AppIntegrationAccessTarget = {
    id: string;
    providerTargetId: string;
    login: string;
    type: 'organization' | 'user';
    manageUrl: string;
    availability: 'available' | 'unavailable';
};

export type AppIntegrationProviderAccessTarget = Omit<
    AppIntegrationAccessTarget,
    'availability' | 'id'
>;

export type AppIntegrationProviderConnection = {
    accountId: string;
    accountLogin: string;
    accountDisplayName: string | null;
    credential: string;
    accessTokenExpiresAt: string | null;
    refreshTokenExpiresAt: string | null;
    accessTargets: AppIntegrationProviderAccessTarget[];
    selectedAccessTargetId: string | null;
};

export type AppIntegrationProviderInstallation = {
    install: () => Promise<AppIntegrationProviderConnection>;
    close: () => Promise<void>;
};

export type AppIntegrationProviderConnectionResult = {
    connection: AppIntegrationProviderConnection;
    installation: AppIntegrationProviderInstallation | null;
};

export type AppIntegrationConnectionIntent = 'connect' | 'reconnect';

export type AppIntegrationConnectionRequest = {
    intent: AppIntegrationConnectionIntent;
    expectedAccountId: string | null;
};

export type AppIntegrationConnectionRecord = {
    id: string;
    providerId: string;
    accountId: string;
    accountLogin: string;
    accountDisplayName: string | null;
    connectedAt: string;
    accessTokenExpiresAt: string | null;
    refreshTokenExpiresAt: string | null;
    requiresReauthorisation: boolean;
    accessTargets: AppIntegrationAccessTarget[];
};

export type AppIntegrationProviderRefreshResult =
    | {
          status: 'refreshed';
          connection: AppIntegrationProviderConnection;
      }
    | { status: 'reauthorisation-required' }
    | { status: 'temporarily-unavailable' };

export type AppIntegrationRefreshTrigger = 'connections' | 'credential-lease';

export type AppIntegrationRefreshContext = {
    operationId: string;
    trigger: AppIntegrationRefreshTrigger;
};

export type AppIntegrationPreparedCredential = {
    credential: string;
    accessTokenExpiresAt: string | null;
    refreshTokenExpiresAt: string | null;
};

export type AppIntegrationStoreFile = {
    schemaVersion: 2;
    connections: Record<string, AppIntegrationConnectionRecord>;
};

export type AppIntegrationSecretsStoreFile = {
    schemaVersion: 1;
    credentials: Record<string, string>;
};

export type AppIntegrationProviderFailureReason =
    | 'account-mismatch'
    | 'cancelled'
    | 'denied'
    | 'installation-required'
    | 'invalid-response'
    | 'network-error'
    | 'provider-unavailable'
    | 'timed-out';

export class AppIntegrationProviderError extends Error {
    /**
     * Creates a safe provider failure.
     *
     * @param reason - Stable failure classification.
     */
    constructor(readonly reason: AppIntegrationProviderFailureReason) {
        super(`App integration provider failed: ${reason}`);
        this.name = 'AppIntegrationProviderError';
    }
}

/**
 * Describes an app integration compiled into Launcher.
 */
export interface AppIntegrationProvider {
    readonly metadata: AppIntegrationProviderMetadata;

    /**
     * Connects one provider account through its native authentication flow.
     *
     * @param signal - Connection-attempt cancellation signal.
     * @param request - Requested connection operation and expected account.
     */
    connect(
        signal: AbortSignal,
        request: AppIntegrationConnectionRequest,
    ): Promise<AppIntegrationProviderConnectionResult>;

    /** Checks a decrypted provider credential before restoring a connection. */
    isCredentialValid(credential: string): boolean;

    /**
     * Refreshes one authorised user and their visible installations.
     *
     * @param signal - Refresh cancellation signal.
     * @param credential - Decrypted provider credential.
     * @param expectedAccountId - Immutable provider account ID.
     * @param context - Safe correlation metadata for this refresh operation.
     */
    refresh(
        signal: AbortSignal,
        credential: string,
        expectedAccountId: string,
        context: AppIntegrationRefreshContext,
    ): Promise<AppIntegrationProviderRefreshResult>;

    /**
     * Prepares a current credential for remote revocation.
     *
     * @param signal - Revocation cancellation signal.
     * @param credential - Decrypted provider credential.
     */
    prepareCredentialRevocation(
        signal: AbortSignal,
        credential: string,
    ): Promise<AppIntegrationPreparedCredential>;

    /**
     * Revokes the complete provider authorisation represented by a credential.
     *
     * @param signal - Revocation cancellation signal.
     * @param credential - Prepared decrypted provider credential.
     */
    revokeCredential(signal: AbortSignal, credential: string): Promise<void>;

    /**
     * Opens the provider-owned repository access settings.
     *
     * @param accessTarget - Persisted verified provider target.
     */
    openManageAccess(accessTarget: AppIntegrationAccessTarget): Promise<void>;
}
