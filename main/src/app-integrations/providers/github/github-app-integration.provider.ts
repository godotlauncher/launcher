import { Injectable } from '@mariodebono/di';
import { APP_INTEGRATION_PROVIDER_TAG } from '../../app-integration.constants.js';
import type { AppIntegrationProvider } from '../../app-integration.types.js';

/** Describes GitHub as an app integration available to Launcher. */
@Injectable({ tags: [APP_INTEGRATION_PROVIDER_TAG] })
export class GitHubAppIntegrationProvider implements AppIntegrationProvider {
    readonly metadata = {
        id: 'github',
        displayName: 'GitHub',
        order: 10,
    } as const;
}
