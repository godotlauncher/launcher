export type AppIntegrationProviderMetadata = {
    id: string;
    displayName: string;
    order: number;
};

/**
 * Describes an app integration compiled into Launcher.
 */
export interface AppIntegrationProvider {
    readonly metadata: AppIntegrationProviderMetadata;
}
