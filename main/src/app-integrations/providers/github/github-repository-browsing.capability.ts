import { Injectable } from '@mariodebono/di';
import { APP_INTEGRATION_CAPABILITY_TAG } from '../../app-integration.constants.js';
import {
    type RepositoryBrowsingCapability,
    RepositoryBrowsingError,
    type RepositoryBrowsingRepository,
    type RepositoryBrowsingRequest,
    type RepositorySelectionRequest,
} from '../../app-integration-capability.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitHubApiClient, GitHubApiError } from './github-api.client.js';
import type { GitHubRepository } from './github-app-integration.types.js';

@Injectable({ tags: [APP_INTEGRATION_CAPABILITY_TAG] })
export class GitHubRepositoryBrowsingCapability
    implements RepositoryBrowsingCapability
{
    readonly metadata = {
        providerId: 'github',
        kind: 'repository-browsing',
    } as const;

    /**
     * Creates the GitHub repository browsing capability.
     *
     * @param github - Bounded GitHub REST API client.
     */
    constructor(private readonly github: GitHubApiClient) {}

    /** Lists one repository page for an installation route. */
    async listRepositories(request: RepositoryBrowsingRequest) {
        try {
            const page = await this.github.getInstallationRepositories(
                request.credential,
                request.accessTarget.providerTargetId,
                request.cursor,
                request.signal,
            );
            return {
                repositories: page.repositories
                    .filter(isUsableRepository)
                    .map(toBrowsingRepository),
                nextCursor: page.nextCursor,
            };
        } catch (error) {
            throw mapBrowsingError(error);
        }
    }

    /** Revalidates a repository before a later clone operation. */
    async resolveRepository(request: RepositorySelectionRequest) {
        try {
            const repository = await this.github.getRepository(
                request.credential,
                request.repository.owner,
                request.repository.name,
                request.repository.id,
                request.signal,
            );
            if (!isUsableRepository(repository)) {
                throw new RepositoryBrowsingError('repository-unavailable');
            }
            return {
                repository: toBrowsingRepository(repository),
                gitCredential: {
                    username: 'x-access-token',
                    password: request.credential,
                },
            };
        } catch (error) {
            throw mapBrowsingError(error);
        }
    }
}

/** Returns whether a GitHub repository can be cloned through the route. */
function isUsableRepository(repository: GitHubRepository): boolean {
    return (
        !repository.disabled &&
        !repository.archived &&
        repository.permissions.pull
    );
}

/** Converts a validated GitHub repository to the provider-neutral contract. */
function toBrowsingRepository(
    repository: GitHubRepository,
): RepositoryBrowsingRepository {
    return {
        id: String(repository.id),
        owner: repository.owner.login,
        name: repository.name,
        visibility: repository.visibility,
        cloneUrl: repository.clone_url,
    };
}

/** Maps GitHub failures to provider-neutral safe classifications. */
function mapBrowsingError(error: unknown): RepositoryBrowsingError {
    if (error instanceof RepositoryBrowsingError) {
        return error;
    }
    if (!(error instanceof GitHubApiError)) {
        return new RepositoryBrowsingError('provider-unavailable');
    }
    if (error.rateLimited) {
        return new RepositoryBrowsingError('rate-limited');
    }
    if (error.status === 401 || error.status === 403) {
        return new RepositoryBrowsingError('reauthorisation-required');
    }
    if (error.status === 404) {
        return new RepositoryBrowsingError('repository-unavailable');
    }
    return new RepositoryBrowsingError('provider-unavailable');
}
