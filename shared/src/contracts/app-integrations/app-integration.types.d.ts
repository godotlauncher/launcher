export type AppIntegrationState = 'not-connected';

/**
 * Describes one app integration without exposing provider internals.
 */
export type AppIntegrationSummary = {
    id: string;
    displayName: string;
    state: AppIntegrationState;
};
