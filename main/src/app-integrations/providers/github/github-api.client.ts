import { Injectable } from '@mariodebono/di';
import type { AppIntegrationProviderAccessTarget } from '../../app-integration.types.js';
import {
    GITHUB_INSTALLATION_PAGE_MAX_BYTES,
    GITHUB_INSTALLATIONS_PER_PAGE,
    GITHUB_INSTALLATIONS_URL,
    GITHUB_REQUEST_TIMEOUT_MS,
    GITHUB_USER_RESPONSE_MAX_BYTES,
    GITHUB_USER_URL,
    MAX_INSTALLATION_PAGES,
} from './github-app-integration.constants.js';
import {
    GitHubInstallationPageSchema,
    GitHubUserIdentitySchema,
} from './github-app-integration.schema.js';
import type {
    GitHubInstallation,
    GitHubUserIdentity,
} from './github-app-integration.types.js';
import { readGitHubJsonResponse } from './github-json-response.util.js';

export class GitHubApiError extends Error {
    /**
     * Creates a checked GitHub API failure.
     *
     * @param status - GitHub response status, or null for a transport failure.
     */
    constructor(readonly status: number | null) {
        super('GitHub API request failed');
        this.name = 'GitHubApiError';
    }
}

@Injectable()
export class GitHubApiClient {
    /**
     * Fetches and validates the account represented by a user access token.
     *
     * @param accessToken - GitHub App user access token.
     * @param signal - Caller cancellation signal.
     * @returns The validated GitHub user.
     */
    async getUser(
        accessToken: string,
        signal: AbortSignal,
    ): Promise<GitHubUserIdentity> {
        const response = await githubRequest(
            GITHUB_USER_URL,
            accessToken,
            signal,
        );
        if (!response.ok) {
            throw new GitHubApiError(response.status);
        }
        return GitHubUserIdentitySchema.parse(
            await readGitHubJsonResponse(
                response,
                GITHUB_USER_RESPONSE_MAX_BYTES,
            ),
        );
    }

    /**
     * Lists every active installation available to one user access token.
     *
     * @param accessToken - Redeemed GitHub App user access token.
     * @param signal - Connection-attempt cancellation signal.
     * @returns Validated active installation targets.
     */
    async getInstallations(
        accessToken: string,
        signal: AbortSignal,
    ): Promise<AppIntegrationProviderAccessTarget[]> {
        const installations: AppIntegrationProviderAccessTarget[] = [];
        for (let page = 1; page <= MAX_INSTALLATION_PAGES; page += 1) {
            const url = new URL(GITHUB_INSTALLATIONS_URL);
            url.searchParams.set(
                'per_page',
                String(GITHUB_INSTALLATIONS_PER_PAGE),
            );
            url.searchParams.set('page', String(page));
            const response = await githubRequest(url, accessToken, signal);
            if (!response.ok) {
                throw new GitHubApiError(response.status);
            }

            const parsed = GitHubInstallationPageSchema.parse(
                await readGitHubJsonResponse(
                    response,
                    GITHUB_INSTALLATION_PAGE_MAX_BYTES,
                ),
            );
            installations.push(
                ...parsed.installations
                    .filter(
                        (installation) => installation.suspended_at === null,
                    )
                    .map(toAccessTarget),
            );
            if (parsed.installations.length < GITHUB_INSTALLATIONS_PER_PAGE) {
                break;
            }
        }
        return installations;
    }
}

/**
 * Sends one bounded GitHub API request.
 *
 * @param url - Fixed or constructed GitHub API URL.
 * @param accessToken - GitHub App user access token.
 * @param signal - Caller cancellation signal.
 * @returns The GitHub response.
 */
async function githubRequest(
    url: string | URL,
    accessToken: string,
    signal: AbortSignal,
): Promise<Response> {
    try {
        return await fetch(url, {
            headers: githubHeaders(accessToken),
            signal: AbortSignal.any([
                signal,
                AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
            ]),
        });
    } catch (error) {
        if (signal.aborted) {
            throw error;
        }
        throw new GitHubApiError(null);
    }
}

/**
 * Converts one validated GitHub installation into persistent non-secret metadata.
 *
 * @param installation - Active installation returned by GitHub.
 * @returns The exact installation target used by Launcher.
 */
function toAccessTarget(
    installation: GitHubInstallation,
): AppIntegrationProviderAccessTarget {
    const installationId = String(installation.id);
    const expectedPath =
        installation.account.type === 'Organization'
            ? `/organizations/${installation.account.login}/settings/installations/${installationId}`
            : `/settings/installations/${installationId}`;
    const manageUrl = new URL(installation.html_url);
    if (manageUrl.pathname !== expectedPath) {
        throw new Error('GitHub returned an invalid installation settings URL');
    }

    return {
        providerTargetId: installationId,
        login: installation.account.login,
        type:
            installation.account.type === 'Organization'
                ? 'organization'
                : 'user',
        manageUrl: manageUrl.toString(),
    };
}

/**
 * Builds the fixed headers used for GitHub App user-token requests.
 *
 * @param accessToken - GitHub App user access token.
 * @returns The GitHub API request headers.
 */
function githubHeaders(accessToken: string): Record<string, string> {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Godot-Launcher',
        'X-GitHub-Api-Version': '2022-11-28',
    };
}
