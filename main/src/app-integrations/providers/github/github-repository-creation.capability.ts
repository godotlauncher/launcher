import { Injectable } from '@mariodebono/di';
import { APP_INTEGRATION_CAPABILITY_TAG } from '../../app-integration.constants.js';
import {
    type RepositoryCreationCapability,
    RepositoryCreationError,
    type RepositoryCreationRequest,
} from '../../app-integration-capability.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import {
    GitHubApiClient,
    GitHubApiError,
    GitHubRepositoryCreationResponseError,
} from './github-api.client.js';
import { GitHubStoredCredentialSchema } from './github-app-integration.schema.js';

const GITHUB_REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/u;

@Injectable({ tags: [APP_INTEGRATION_CAPABILITY_TAG] })
export class GitHubRepositoryCreationCapability
    implements RepositoryCreationCapability
{
    readonly metadata = {
        providerId: 'github',
        kind: 'repository-creation',
    } as const;

    /**
     * Creates the GitHub repository creation capability.
     *
     * @param github - Bounded GitHub REST API client.
     */
    constructor(private readonly github: GitHubApiClient) {}

    /** Checks whether an exact repository name is visible for an approved owner. */
    async checkRepositoryNameAvailability(request: RepositoryCreationRequest) {
        validateRequest(request);
        try {
            return await this.github.checkRepositoryNameAvailability(
                readAccessToken(request.credential),
                request.accessTarget.login,
                request.repositoryName,
                request.signal,
            );
        } catch (error) {
            throw mapAvailabilityError(error);
        }
    }

    /** Resolves the exact private repository after an ambiguous create response. */
    async recoverRepositoryCreation(request: RepositoryCreationRequest) {
        validateRequest(request);
        try {
            const repository = await this.github.recoverPrivateRepository(
                readAccessToken(request.credential),
                request.accessTarget.login,
                request.repositoryName,
                request.signal,
            );
            return repository
                ? {
                      status: 'present' as const,
                      repository: {
                          id: String(repository.id),
                          owner: repository.owner.login,
                          name: repository.name,
                          cloneUrl: repository.clone_url,
                          webUrl: repository.html_url,
                      },
                  }
                : { status: 'absent' as const };
        } catch (error) {
            throw mapAvailabilityError(error);
        }
    }

    /** Creates one empty private repository for an approved owner route. */
    async createRepository(request: RepositoryCreationRequest) {
        validateRequest(request);
        try {
            const accessToken = readAccessToken(request.credential);
            const repository = await this.github.createPrivateRepository(
                accessToken,
                request.accessTarget.login,
                request.accessTarget.type,
                request.repositoryName,
                request.signal,
            );
            return {
                repository: {
                    id: String(repository.id),
                    owner: repository.owner.login,
                    name: repository.name,
                    cloneUrl: repository.clone_url,
                    webUrl: repository.html_url,
                },
                gitCredential: {
                    username: 'x-access-token',
                    password: accessToken,
                },
            };
        } catch (error) {
            throw mapCreationError(error);
        }
    }

    /** Returns a fresh Git credential without creating another repository. */
    getGitCredential(request: {
        credential: string;
        accessTarget: RepositoryCreationRequest['accessTarget'];
    }) {
        if (
            !request.accessTarget.capabilities.includes('repository-creation')
        ) {
            throw new RepositoryCreationError('permission-update-required');
        }
        return {
            username: 'x-access-token',
            password: readAccessToken(request.credential),
        };
    }
}

/**
 * Validates the shared GitHub repository-creation request boundary.
 *
 * @param request - Credential-scoped repository request to validate.
 */
function validateRequest(request: RepositoryCreationRequest): void {
    if (!request.accessTarget.capabilities.includes('repository-creation')) {
        throw new RepositoryCreationError('permission-update-required');
    }
    if (!GITHUB_REPOSITORY_NAME_PATTERN.test(request.repositoryName)) {
        throw new RepositoryCreationError('invalid-repository-name');
    }
}

/**
 * Maps a GitHub name-check failure without treating it as a remote mutation.
 *
 * @param error - Provider error raised by the availability request.
 * @returns A stable repository-creation failure classification.
 */
function mapAvailabilityError(error: unknown): RepositoryCreationError {
    if (error instanceof RepositoryCreationError) {
        return error;
    }
    if (!(error instanceof GitHubApiError)) {
        return new RepositoryCreationError('provider-unavailable');
    }
    if (error.rateLimited) {
        return new RepositoryCreationError('rate-limited');
    }
    if (error.status === null) {
        return new RepositoryCreationError('network-unavailable');
    }
    if (error.status === 401 || error.status === 403) {
        return new RepositoryCreationError('permission-update-required');
    }
    return new RepositoryCreationError('provider-unavailable');
}

/**
 * Extracts the access token from one decrypted GitHub credential bundle.
 *
 * @param credential - Decrypted provider-owned credential bundle.
 * @returns The current GitHub App user access token.
 */
function readAccessToken(credential: string): string {
    try {
        return GitHubStoredCredentialSchema.parse(JSON.parse(credential))
            .accessToken;
    } catch {
        throw new RepositoryCreationError('permission-update-required');
    }
}

/**
 * Maps a provider failure to a safe creation classification.
 *
 * @param error - Provider or validation failure.
 * @returns A renderer-safe repository creation error.
 */
function mapCreationError(error: unknown): RepositoryCreationError {
    if (error instanceof RepositoryCreationError) {
        return error;
    }
    if (error instanceof GitHubRepositoryCreationResponseError) {
        return new RepositoryCreationError('remote-creation-response-invalid');
    }
    if (!(error instanceof GitHubApiError)) {
        return new RepositoryCreationError('provider-unavailable');
    }
    if (error.rateLimited) {
        return new RepositoryCreationError('rate-limited');
    }
    if (error.status === null) {
        return new RepositoryCreationError('remote-creation-uncertain');
    }
    if (error.status === 401 || error.status === 403) {
        return new RepositoryCreationError('permission-update-required');
    }
    if (error.status === 404) {
        return new RepositoryCreationError('target-unavailable');
    }
    if (error.status === 422) {
        return new RepositoryCreationError(
            'repository-name-unavailable-or-policy-rejected',
        );
    }
    return new RepositoryCreationError('provider-unavailable');
}
