export type AppIntegrationState =
    | 'not-connected'
    | 'connecting'
    | 'selection-required'
    | 'connected'
    | 'reauthorisation-required'
    | 'secure-storage-unavailable';

export type AppIntegrationConnectionStage =
    | 'authorising'
    | 'choosing'
    | 'installing'
    | null;

export type AppIntegrationActionFailureReason =
    | 'account-mismatch'
    | 'already-connecting'
    | 'cancelled'
    | 'denied'
    | 'installation-required'
    | 'invalid-response'
    | 'network-error'
    | 'provider-unavailable'
    | 'secure-storage-unavailable'
    | 'timed-out'
    | 'unknown';

export type AppIntegrationConnectionSummary = {
    id: string;
    accountLogin: string;
    accountDisplayName: string | null;
    state:
        | 'connected'
        | 'reauthorisation-required'
        | 'secure-storage-unavailable';
    accessTargets: AppIntegrationAccessTargetSummary[];
};

export type AppIntegrationAccessTargetSummary = {
    id: string;
    login: string;
    type: 'organization' | 'user';
    availability: 'available' | 'unavailable';
};

export type AppIntegrationConnectionOption = {
    id: string;
    login: string;
    type: 'organization' | 'user';
};

/**
 * Describes one app integration without exposing provider internals.
 */
export type AppIntegrationSummary = {
    id: string;
    displayName: string;
    state: AppIntegrationState;
    connectionStage: AppIntegrationConnectionStage;
    connections: AppIntegrationConnectionSummary[];
    connectionOptions: AppIntegrationConnectionOption[];
};

export type AppIntegrationActionResult =
    | {
          ok: true;
          integration: AppIntegrationSummary;
      }
    | {
          ok: false;
          reason: AppIntegrationActionFailureReason;
          integration: AppIntegrationSummary;
      };
