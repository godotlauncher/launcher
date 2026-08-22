import { Injectable } from '@mariodebono/di';
import type { AppIntegrationProviderAccessTarget } from '../../app-integration.types.js';
import {
    GITHUB_INSTALLATION_PAGE_MAX_BYTES,
    GITHUB_INSTALLATIONS_PER_PAGE,
    GITHUB_INSTALLATIONS_URL,
    GITHUB_MAX_RENAME_REDIRECTS,
    GITHUB_REPOSITORIES_PER_PAGE,
    GITHUB_REPOSITORY_PAGE_MAX_BYTES,
    GITHUB_REPOSITORY_RESPONSE_MAX_BYTES,
    GITHUB_REQUEST_TIMEOUT_MS,
    GITHUB_USER_RESPONSE_MAX_BYTES,
    GITHUB_USER_URL,
    MAX_INSTALLATION_PAGES,
} from './github-app-integration.constants.js';
import {
    GitHubInstallationPageSchema,
    GitHubRepositoryPageSchema,
    GitHubRepositorySchema,
    GitHubUserIdentitySchema,
} from './github-app-integration.schema.js';
import type {
    GitHubInstallation,
    GitHubRepository,
    GitHubRepositoryPage,
    GitHubUserIdentity,
} from './github-app-integration.types.js';
import { readGitHubJsonResponse } from './github-json-response.util.js';

export class GitHubApiError extends Error {
    /**
     * Creates a checked GitHub API failure.
     *
     * @param status - GitHub response status, or null for a transport failure.
     * @param rateLimited - Whether GitHub reported an exhausted rate limit.
     */
    constructor(
        readonly status: number | null,
        readonly rateLimited = false,
    ) {
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
                        (installation) =>
                            installation.suspended_at === null &&
                            hasRepositoryContentsReadPermission(installation),
                    )
                    .map(toAccessTarget),
            );
            if (parsed.installations.length < GITHUB_INSTALLATIONS_PER_PAGE) {
                break;
            }
        }
        return installations;
    }

    /**
     * Lists one bounded repository page for a GitHub App installation.
     *
     * @param accessToken - GitHub App user access token.
     * @param installationId - Exact GitHub App installation ID.
     * @param cursor - Previously validated GitHub continuation URL.
     * @param signal - Caller cancellation signal.
     * @returns A validated provider repository page.
     */
    async getInstallationRepositories(
        accessToken: string,
        installationId: string,
        cursor: string | null,
        signal: AbortSignal,
    ): Promise<GitHubRepositoryPage> {
        const url = cursor
            ? validateRepositoryPageUrl(cursor, installationId)
            : createRepositoryPageUrl(installationId);
        const response = await githubRequest(url, accessToken, signal);
        if (!response.ok) {
            throwGitHubApiError(response);
        }
        const parsed = GitHubRepositoryPageSchema.parse(
            await readGitHubJsonResponse(
                response,
                GITHUB_REPOSITORY_PAGE_MAX_BYTES,
            ),
        );
        return {
            repositories: parsed.repositories,
            nextCursor: readNextRepositoryCursor(response, installationId),
        };
    }

    /**
     * Resolves a repository and follows only bounded GitHub API rename redirects.
     *
     * @param accessToken - GitHub App user access token.
     * @param owner - Expected repository owner.
     * @param name - Expected repository name.
     * @param expectedId - Immutable repository ID from the browse session.
     * @param signal - Caller cancellation signal.
     * @returns The revalidated repository.
     */
    async getRepository(
        accessToken: string,
        owner: string,
        name: string,
        expectedId: string,
        signal: AbortSignal,
    ): Promise<GitHubRepository> {
        let url = new URL(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
            'https://api.github.com',
        );
        for (let redirects = 0; ; redirects += 1) {
            const response = await githubRequest(
                url,
                accessToken,
                signal,
                'manual',
            );
            if ([301, 302, 307, 308].includes(response.status)) {
                if (redirects >= GITHUB_MAX_RENAME_REDIRECTS) {
                    throw new GitHubApiError(response.status);
                }
                url = validateRepositoryRedirect(
                    response.headers.get('location'),
                );
                continue;
            }
            if (!response.ok) {
                throwGitHubApiError(response);
            }
            const repository = GitHubRepositorySchema.parse(
                await readGitHubJsonResponse(
                    response,
                    GITHUB_REPOSITORY_RESPONSE_MAX_BYTES,
                ),
            );
            if (String(repository.id) !== expectedId) {
                throw new Error('GitHub repository identity changed');
            }
            return repository;
        }
    }
}

/** Returns whether one installation has approved repository clone access. */
function hasRepositoryContentsReadPermission(
    installation: GitHubInstallation,
): boolean {
    return (
        installation.permissions.contents === 'read' ||
        installation.permissions.contents === 'write'
    );
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
    redirect: RequestRedirect = 'follow',
): Promise<Response> {
    try {
        return await fetch(url, {
            headers: githubHeaders(accessToken),
            signal: AbortSignal.any([
                signal,
                AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
            ]),
            redirect,
        });
    } catch (error) {
        if (signal.aborted) {
            throw error;
        }
        throw new GitHubApiError(null);
    }
}

/** Creates the first installation repository page URL. */
function createRepositoryPageUrl(installationId: string): URL {
    if (!/^[1-9][0-9]{0,19}$/u.test(installationId)) {
        throw new Error('Invalid GitHub installation ID');
    }
    const url = new URL(
        `/user/installations/${installationId}/repositories`,
        'https://api.github.com',
    );
    url.searchParams.set('per_page', String(GITHUB_REPOSITORIES_PER_PAGE));
    return url;
}

/** Validates a GitHub installation repository continuation URL. */
function validateRepositoryPageUrl(value: string, installationId: string): URL {
    const url = new URL(value);
    const expectedPath = `/user/installations/${installationId}/repositories`;
    if (
        url.origin !== 'https://api.github.com' ||
        url.pathname !== expectedPath ||
        url.username ||
        url.password ||
        url.hash ||
        [...url.searchParams.keys()].some(
            (key) => key !== 'page' && key !== 'per_page',
        ) ||
        url.searchParams.get('per_page') !==
            String(GITHUB_REPOSITORIES_PER_PAGE) ||
        !/^[1-9][0-9]*$/u.test(url.searchParams.get('page') ?? '') ||
        url.searchParams.getAll('page').length !== 1 ||
        url.searchParams.getAll('per_page').length !== 1
    ) {
        throw new Error('Invalid GitHub repository page URL');
    }
    return url;
}

/** Reads the validated next relation from a GitHub Link header. */
function readNextRepositoryCursor(
    response: Response,
    installationId: string,
): string | null {
    const link = response.headers.get('link');
    if (!link) {
        return null;
    }
    let next: string | null = null;
    for (const part of link.split(',')) {
        const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/u);
        if (!match) {
            throw new Error('Invalid GitHub Link header');
        }
        const relations = match[2].split(/\s+/u);
        if (relations.includes('next')) {
            if (next !== null) {
                throw new Error('Duplicate GitHub next link');
            }
            next = validateRepositoryPageUrl(
                match[1],
                installationId,
            ).toString();
        }
    }
    return next;
}

/** Validates a repository rename redirect inside the GitHub API. */
function validateRepositoryRedirect(value: string | null): URL {
    if (!value) {
        throw new Error('Missing GitHub repository redirect');
    }
    const url = new URL(value, 'https://api.github.com');
    if (
        url.origin !== 'https://api.github.com' ||
        !/^\/(?:repos\/[^/]+\/[^/]+|repositories\/[1-9][0-9]*)$/u.test(
            url.pathname,
        ) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new Error('Invalid GitHub repository redirect');
    }
    return url;
}

/** Throws a checked GitHub API response failure. */
function throwGitHubApiError(response: Response): never {
    throw new GitHubApiError(
        response.status,
        response.status === 429 ||
            (response.status === 403 &&
                response.headers.get('x-ratelimit-remaining') === '0'),
    );
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
