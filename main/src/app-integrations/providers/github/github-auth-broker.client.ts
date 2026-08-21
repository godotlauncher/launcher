import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ConfigService } from '@mariodebono/di-config';
import type { AppConfig } from '../../../config/index.js';
import {
    GitHubAuthAttemptSchema,
    GitHubBrokerErrorSchema,
    GitHubOAuthRedemptionSchema,
    GitHubSetupRedemptionSchema,
    GitHubTokenBundleSchema,
} from './github-app-integration.schema.js';
import type {
    GitHubAuthAttempt,
    GitHubAuthIntent,
    GitHubLoopbackDescriptor,
    GitHubOAuthRedemption,
    GitHubSetupRedemption,
    GitHubTokenBundle,
} from './github-app-integration.types.js';
import { readGitHubJsonResponse } from './github-json-response.util.js';

const DEVELOPMENT_BROKER_ORIGIN = 'http://127.0.0.1:8787';
const PRODUCTION_BROKER_ORIGIN = 'https://auth.godotlauncher.org';
const BROKER_REQUEST_TIMEOUT_MS = 10_000;
const BROKER_RESPONSE_MAX_BYTES = 64 * 1024;

export class GitHubBrokerError extends Error {
    /**
     * Creates a checked broker failure.
     *
     * @param code - Stable broker error code.
     * @param status - HTTP response status.
     */
    constructor(
        readonly code: string,
        readonly status: number,
    ) {
        super(`GitHub authentication broker failed: ${code}`);
        this.name = 'GitHubBrokerError';
    }
}

@Injectable()
export class GitHubAuthBrokerClient {
    private readonly origin: string;

    /**
     * Creates the broker client for the current runtime mode.
     *
     * @param configService - Runtime Launcher configuration.
     */
    constructor(configService: ConfigService<AppConfig>) {
        this.origin = configService.getOrThrow('isDev')
            ? DEVELOPMENT_BROKER_ORIGIN
            : PRODUCTION_BROKER_ORIGIN;
    }

    /** Creates one bounded GitHub OAuth attempt. */
    async createAttempt(
        codeChallenge: string,
        loopback: GitHubLoopbackDescriptor,
        intent: GitHubAuthIntent,
        signal: AbortSignal,
    ): Promise<GitHubAuthAttempt> {
        const response = await this.request('/v1/oauth/github/attempts', {
            method: 'POST',
            body: JSON.stringify({ codeChallenge, intent, loopback }),
            headers: { 'Content-Type': 'application/json' },
            signal,
        });
        const attempt = GitHubAuthAttemptSchema.parse(
            await readGitHubJsonResponse(response, BROKER_RESPONSE_MAX_BYTES),
        );
        validateGitHubBrowserUrl(
            attempt.browserUrl,
            `${this.origin}/v1/oauth/github/callback`,
        );
        return attempt;
    }

    /**
     * Redeems the OAuth completion and validates its browser continuation.
     *
     * @param attempt - Active broker attempt.
     * @param codeVerifier - PKCE verifier created for the attempt.
     * @param completionTicket - Encrypted OAuth completion ticket.
     * @param signal - Caller cancellation signal.
     * @returns The temporary GitHub credential and optional installation URL.
     */
    async redeemOAuth(
        attempt: GitHubAuthAttempt,
        codeVerifier: string,
        completionTicket: string,
        signal: AbortSignal,
    ): Promise<GitHubOAuthRedemption> {
        const response = await this.redeem(
            attempt,
            codeVerifier,
            completionTicket,
            signal,
        );
        const redemption = GitHubOAuthRedemptionSchema.parse(
            await readGitHubJsonResponse(response, BROKER_RESPONSE_MAX_BYTES),
        );
        if (redemption.installationUrl !== null) {
            validateGitHubInstallationUrl(redemption.installationUrl);
        }
        return redemption;
    }

    /**
     * Redeems the post-install setup completion for its candidate ID.
     *
     * @param attempt - Active broker attempt.
     * @param codeVerifier - PKCE verifier created for the attempt.
     * @param completionTicket - Encrypted setup completion ticket.
     * @param signal - Caller cancellation signal.
     * @returns The installation candidate reported by GitHub.
     */
    async redeemSetup(
        attempt: GitHubAuthAttempt,
        codeVerifier: string,
        completionTicket: string,
        signal: AbortSignal,
    ): Promise<GitHubSetupRedemption> {
        const response = await this.redeem(
            attempt,
            codeVerifier,
            completionTicket,
            signal,
        );
        return GitHubSetupRedemptionSchema.parse(
            await readGitHubJsonResponse(response, BROKER_RESPONSE_MAX_BYTES),
        );
    }

    /**
     * Rotates one GitHub App user access token through the broker.
     *
     * @param refreshToken - Current GitHub refresh token.
     * @param signal - Caller cancellation signal.
     * @returns The rotated token bundle.
     */
    async refresh(
        refreshToken: string,
        signal: AbortSignal,
    ): Promise<GitHubTokenBundle> {
        const response = await this.request('/v1/oauth/github/tokens/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
            headers: { 'Content-Type': 'application/json' },
            signal,
        });
        return GitHubTokenBundleSchema.parse(
            await readGitHubJsonResponse(response, BROKER_RESPONSE_MAX_BYTES),
        );
    }

    /**
     * Revokes every GitHub OAuth token in one App user authorisation.
     *
     * @param accessToken - Current GitHub user access token.
     * @param signal - Caller cancellation signal.
     */
    async revoke(accessToken: string, signal: AbortSignal): Promise<void> {
        await this.request('/v1/oauth/github/authorisation', {
            method: 'DELETE',
            body: JSON.stringify({ accessToken }),
            headers: { 'Content-Type': 'application/json' },
            signal,
        });
    }

    /** Cancels an unused broker attempt without exposing cancellation errors. */
    async cancel(
        attempt: GitHubAuthAttempt,
        signal?: AbortSignal,
    ): Promise<void> {
        try {
            await this.request(
                `/v1/oauth/github/attempts/${attempt.attemptId}`,
                {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${attempt.attemptToken}`,
                    },
                    signal:
                        signal ??
                        AbortSignal.timeout(BROKER_REQUEST_TIMEOUT_MS),
                },
            );
        } catch {
            // The attempt expires independently, so cancellation is best effort.
        }
    }

    /**
     * Sends one no-store broker request and maps its safe public error.
     *
     * @param pathname - Broker API pathname.
     * @param init - Fetch request options.
     * @returns The successful broker response.
     */
    private async request(
        pathname: string,
        init: RequestInit,
    ): Promise<Response> {
        const signal = init.signal
            ? AbortSignal.any([
                  init.signal,
                  AbortSignal.timeout(BROKER_REQUEST_TIMEOUT_MS),
              ])
            : AbortSignal.timeout(BROKER_REQUEST_TIMEOUT_MS);
        const response = await fetch(new URL(pathname, this.origin), {
            ...init,
            headers: {
                Accept: 'application/json',
                'Cache-Control': 'no-store',
                ...init.headers,
            },
            signal,
        });
        if (response.ok) {
            return response;
        }

        const parsed = GitHubBrokerErrorSchema.safeParse(
            await readGitHubJsonResponse(
                response,
                BROKER_RESPONSE_MAX_BYTES,
            ).catch(() => null),
        );
        throw new GitHubBrokerError(
            parsed.success ? parsed.data.error.code : 'invalid_response',
            response.status,
        );
    }

    /**
     * Sends one attempt-token and PKCE authenticated redemption request.
     *
     * @param attempt - Active broker attempt.
     * @param codeVerifier - PKCE verifier created for the attempt.
     * @param completionTicket - Encrypted completion ticket.
     * @param signal - Caller cancellation signal.
     * @returns The successful redemption response.
     */
    private async redeem(
        attempt: GitHubAuthAttempt,
        codeVerifier: string,
        completionTicket: string,
        signal: AbortSignal,
    ): Promise<Response> {
        return this.request(
            `/v1/oauth/github/attempts/${attempt.attemptId}/redeem`,
            {
                method: 'POST',
                body: JSON.stringify({ codeVerifier, completionTicket }),
                headers: {
                    Authorization: `Bearer ${attempt.attemptToken}`,
                    'Content-Type': 'application/json',
                },
                signal,
            },
        );
    }
}

/**
 * Restricts broker-provided browser navigation to the expected GitHub flow.
 *
 * @param value - Broker-provided GitHub URL.
 * @param expectedCallback - Exact broker callback for the runtime mode.
 */
function validateGitHubBrowserUrl(
    value: string,
    expectedCallback: string,
): void {
    const url = new URL(value);
    const expectedParameters = [
        'client_id',
        'code_challenge',
        'code_challenge_method',
        'prompt',
        'redirect_uri',
        'state',
    ];
    const parameters = [...url.searchParams.keys()].sort();
    if (
        url.pathname !== '/login/oauth/authorize' ||
        JSON.stringify(parameters) !== JSON.stringify(expectedParameters) ||
        url.searchParams.get('code_challenge_method') !== 'S256' ||
        url.searchParams.get('prompt') !== 'select_account' ||
        url.searchParams.get('redirect_uri') !== expectedCallback
    ) {
        throw new Error('The broker returned an invalid authorisation URL');
    }
}

/** Restricts a broker continuation to the GitHub App installation entry. */
function validateGitHubInstallationUrl(value: string): void {
    const url = new URL(value);
    if (
        url.origin !== 'https://github.com' ||
        !/^\/apps\/[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?\/installations\/new$/u.test(
            url.pathname,
        ) ||
        url.username !== '' ||
        url.password !== '' ||
        url.hash !== '' ||
        url.searchParams.size !== 1 ||
        !url.searchParams.has('state')
    ) {
        throw new Error('The broker returned an invalid installation URL');
    }
}
