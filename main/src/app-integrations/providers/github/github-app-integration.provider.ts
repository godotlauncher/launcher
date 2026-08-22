import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ConfigService } from '@mariodebono/di-config';
import { shell } from 'electron';
import { ZodError } from 'zod';
import type { AppConfig } from '../../../config/index.js';
import { revealMainWindow } from '../../../mainWindow.js';
import { APP_INTEGRATION_PROVIDER_TAG } from '../../app-integration.constants.js';
import {
    type AppIntegrationAccessTarget,
    type AppIntegrationConnectionRequest,
    type AppIntegrationPreparedCredential,
    type AppIntegrationProvider,
    type AppIntegrationProviderConnection,
    AppIntegrationProviderError,
    type AppIntegrationProviderRefreshResult,
} from '../../app-integration.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitHubApiClient, GitHubApiError } from './github-api.client.js';
import { GitHubStoredCredentialSchema } from './github-app-integration.schema.js';
import type {
    GitHubAuthAttempt,
    GitHubAuthIntent,
    GitHubLoopbackCompletion,
    GitHubStoredCredential,
    GitHubTokenBundle,
    GitHubUserIdentity,
} from './github-app-integration.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import {
    GitHubAuthBrokerClient,
    GitHubBrokerError,
} from './github-auth-broker.client.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitHubAuthLoopbackListenerService } from './github-auth-loopback-listener.service.js';

/** Describes GitHub as an app integration available to Launcher. */
@Injectable({ tags: [APP_INTEGRATION_PROVIDER_TAG] })
export class GitHubAppIntegrationProvider implements AppIntegrationProvider {
    readonly metadata = {
        id: 'github',
        displayName: 'GitHub',
        order: 10,
    } as const;

    /**
     * Creates the GitHub provider.
     *
     * @param configService - Runtime Launcher configuration.
     * @param broker - GitHub authentication broker client.
     * @param loopback - Ephemeral local callback listener.
     * @param github - GitHub API identity client.
     */
    constructor(
        private readonly configService: ConfigService<AppConfig>,
        private readonly broker: GitHubAuthBrokerClient,
        private readonly loopback: GitHubAuthLoopbackListenerService,
        private readonly github: GitHubApiClient,
    ) {}

    /**
     * Completes one GitHub connection or reauthorisation flow.
     *
     * @param signal - Connection-attempt cancellation signal.
     * @param request - Requested operation and optional expected account ID.
     */
    async connect(
        signal: AbortSignal,
        request: AppIntegrationConnectionRequest,
    ) {
        try {
            const result = await this.completeBrowserAttempt(
                request.intent === 'connect' ? 'connect' : 'reauthorise',
                signal,
                request.expectedAccountId,
            );
            revealMainWindow();
            return result;
        } catch (error) {
            throw mapProviderError(error, signal);
        }
    }

    /**
     * Completes one broker-backed GitHub browser attempt.
     *
     * @param intent - Whether to authorise a user or install the GitHub App.
     * @param signal - Connection-attempt cancellation signal.
     * @param expectedAccountId - Immutable GitHub user ID required on return.
     * @returns The verified user credential and optional installation action.
     */
    private async completeBrowserAttempt(
        intent: GitHubAuthIntent,
        signal: AbortSignal,
        expectedAccountId: string | null,
    ) {
        const verifier = randomBytes(32).toString('base64url');
        const challenge = createHash('sha256')
            .update(verifier)
            .digest('base64url');
        const nonce = randomBytes(32).toString('base64url');
        const listener = await this.loopback.start(
            nonce,
            this.configService.getOrThrow('useLocalGitHubBroker'),
            signal,
        );
        let attempt: GitHubAuthAttempt | undefined;
        let oauthCompletion: GitHubLoopbackCompletion | undefined;
        let setupCompletion: GitHubLoopbackCompletion | undefined;
        let closed = false;

        const close = async (): Promise<void> => {
            if (closed) {
                return;
            }
            closed = true;
            oauthCompletion?.respond(false);
            oauthCompletion = undefined;
            setupCompletion?.respond(false);
            setupCompletion = undefined;
            await listener.close();
            if (attempt) {
                await this.broker.cancel(attempt);
            }
        };

        try {
            attempt = await this.broker.createAttempt(
                challenge,
                listener.descriptor,
                intent,
                signal,
            );
            const activeAttempt = attempt;
            await shell.openExternal(activeAttempt.browserUrl);

            oauthCompletion = await listener.waitForCompletion();
            const redemption = await this.broker.redeemOAuth(
                activeAttempt,
                verifier,
                oauthCompletion.ticket,
                signal,
            );
            const { installationUrl, ...token } = redemption;
            const identity = await this.github.getUser(
                token.accessToken,
                signal,
            );
            const accountId = String(identity.id);
            if (expectedAccountId !== null && expectedAccountId !== accountId) {
                throw new AppIntegrationProviderError('account-mismatch');
            }

            const accessTargets = await this.github.getInstallations(
                token.accessToken,
                signal,
            );
            const connectedAt = Date.now();
            const connection = this.createConnection(
                identity,
                token,
                accessTargets,
                null,
                connectedAt,
            );

            if (intent === 'reauthorise') {
                if (installationUrl !== null) {
                    throw new AppIntegrationProviderError('invalid-response');
                }
                oauthCompletion.respond(true);
                oauthCompletion = undefined;
                await close();
                return { connection, installation: null };
            }
            if (installationUrl === null) {
                throw new AppIntegrationProviderError('invalid-response');
            }

            oauthCompletion.respond(true);
            oauthCompletion = undefined;
            let installationStarted = false;
            return {
                connection,
                installation: {
                    close,
                    install: async () => {
                        if (installationStarted || closed) {
                            throw new AppIntegrationProviderError(
                                'invalid-response',
                            );
                        }
                        installationStarted = true;
                        try {
                            await shell.openExternal(installationUrl);
                            setupCompletion =
                                await listener.waitForCompletion();
                            const installationId = (
                                await this.broker.redeemSetup(
                                    activeAttempt,
                                    verifier,
                                    setupCompletion.ticket,
                                    signal,
                                )
                            ).installationId;
                            const installedTargets =
                                await this.github.getInstallations(
                                    token.accessToken,
                                    signal,
                                );
                            if (
                                !installedTargets.some(
                                    (target) =>
                                        target.providerTargetId ===
                                        installationId,
                                )
                            ) {
                                throw new AppIntegrationProviderError(
                                    'installation-required',
                                );
                            }
                            setupCompletion.respond(true);
                            setupCompletion = undefined;
                            revealMainWindow();
                            return this.createConnection(
                                identity,
                                token,
                                installedTargets,
                                installationId,
                                connectedAt,
                            );
                        } catch (error) {
                            setupCompletion?.respond(false);
                            setupCompletion = undefined;
                            throw mapProviderError(error, signal);
                        }
                    },
                },
            };
        } catch (error) {
            await close();
            throw error;
        }
    }

    /**
     * Builds one verified connection result from a GitHub token and identity.
     *
     * @param identity - Verified GitHub user identity.
     * @param token - Broker-issued GitHub user token bundle.
     * @param accessTargets - Installations visible to the user.
     * @param selectedAccessTargetId - Exact setup installation, when present.
     * @param connectedAt - Token issue time used for expiry calculation.
     * @returns The provider connection result.
     */
    private createConnection(
        identity: GitHubUserIdentity,
        token: GitHubTokenBundle,
        accessTargets: AppIntegrationProviderConnection['accessTargets'],
        selectedAccessTargetId: string | null,
        connectedAt: number,
    ): AppIntegrationProviderConnection {
        return {
            accountId: String(identity.id),
            accountLogin: identity.login,
            accountDisplayName: identity.name,
            credential: JSON.stringify(
                GitHubStoredCredentialSchema.parse({
                    ...token,
                    version: 1,
                    createdAt: new Date(connectedAt).toISOString(),
                }),
            ),
            accessTokenExpiresAt: expiryFromSeconds(
                connectedAt,
                token.expiresIn,
            ),
            refreshTokenExpiresAt: expiryFromSeconds(
                connectedAt,
                token.refreshTokenExpiresIn,
            ),
            accessTargets,
            selectedAccessTargetId,
        };
    }

    /** Checks a decrypted GitHub token bundle before restoring it. */
    isCredentialValid(credential: string): boolean {
        try {
            return GitHubStoredCredentialSchema.safeParse(
                JSON.parse(credential),
            ).success;
        } catch {
            return false;
        }
    }

    /**
     * Refreshes an authorised GitHub user and their visible installations.
     *
     * @param signal - Refresh cancellation signal.
     * @param credential - Decrypted GitHub token bundle.
     * @param expectedAccountId - Immutable GitHub user ID.
     * @returns The refreshed provider state without opening a browser.
     */
    async refresh(
        signal: AbortSignal,
        credential: string,
        expectedAccountId: string,
    ): Promise<AppIntegrationProviderRefreshResult> {
        let stored: GitHubStoredCredential;
        try {
            stored = GitHubStoredCredentialSchema.parse(JSON.parse(credential));
        } catch {
            return { status: 'reauthorisation-required' };
        }

        try {
            const createdAt = new Date(stored.createdAt).getTime();
            if (
                stored.refreshTokenExpiresIn !== null &&
                createdAt + stored.refreshTokenExpiresIn * 1_000 <= Date.now()
            ) {
                return { status: 'reauthorisation-required' };
            }
            const accessTokenExpiry = stored.expiresIn
                ? createdAt + stored.expiresIn * 1_000
                : null;
            const shouldRotate =
                accessTokenExpiry !== null &&
                accessTokenExpiry <= Date.now() + 5 * 60 * 1_000;
            const token = shouldRotate
                ? await this.rotateCredential(stored.refreshToken, signal)
                : stored;
            const [identity, accessTargets] = await Promise.all([
                this.github.getUser(token.accessToken, signal),
                this.github.getInstallations(token.accessToken, signal),
            ]);
            if (String(identity.id) !== expectedAccountId) {
                return { status: 'reauthorisation-required' };
            }
            const refreshedAt = shouldRotate ? Date.now() : createdAt;
            return {
                status: 'refreshed',
                connection: {
                    accountId: expectedAccountId,
                    accountLogin: identity.login,
                    accountDisplayName: identity.name,
                    credential: JSON.stringify(
                        GitHubStoredCredentialSchema.parse({
                            ...token,
                            version: 1,
                            createdAt: new Date(refreshedAt).toISOString(),
                        }),
                    ),
                    accessTokenExpiresAt: expiryFromSeconds(
                        refreshedAt,
                        token.expiresIn,
                    ),
                    refreshTokenExpiresAt: expiryFromSeconds(
                        refreshedAt,
                        token.refreshTokenExpiresIn,
                    ),
                    accessTargets,
                    selectedAccessTargetId: null,
                },
            };
        } catch (error) {
            if (
                (error instanceof GitHubBrokerError &&
                    error.code === 'github_rejected_token') ||
                (error instanceof GitHubApiError &&
                    (error.status === 401 || error.status === 403))
            ) {
                return { status: 'reauthorisation-required' };
            }
            return { status: 'temporarily-unavailable' };
        }
    }

    /**
     * Produces a current GitHub credential that can identify the complete grant.
     *
     * @param signal - Revocation cancellation signal.
     * @param credential - Decrypted stored token bundle.
     * @returns The current credential and its provider expiry metadata.
     */
    async prepareCredentialRevocation(
        signal: AbortSignal,
        credential: string,
    ): Promise<AppIntegrationPreparedCredential> {
        try {
            const stored = GitHubStoredCredentialSchema.parse(
                JSON.parse(credential),
            );
            const createdAt = new Date(stored.createdAt).getTime();
            const accessTokenExpiry =
                stored.expiresIn === null
                    ? null
                    : createdAt + stored.expiresIn * 1_000;
            const shouldRotate =
                accessTokenExpiry !== null &&
                accessTokenExpiry <= Date.now() + 5 * 60 * 1_000;
            if (!shouldRotate) {
                return {
                    credential,
                    accessTokenExpiresAt: expiryFromSeconds(
                        createdAt,
                        stored.expiresIn,
                    ),
                    refreshTokenExpiresAt: expiryFromSeconds(
                        createdAt,
                        stored.refreshTokenExpiresIn,
                    ),
                };
            }
            if (
                stored.refreshTokenExpiresIn !== null &&
                createdAt + stored.refreshTokenExpiresIn * 1_000 <= Date.now()
            ) {
                throw new GitHubBrokerError('github_rejected_token', 401);
            }

            const token = await this.rotateCredential(
                stored.refreshToken,
                signal,
            );
            const rotatedAt = Date.now();
            return {
                credential: JSON.stringify(
                    GitHubStoredCredentialSchema.parse({
                        ...token,
                        version: 1,
                        createdAt: new Date(rotatedAt).toISOString(),
                    }),
                ),
                accessTokenExpiresAt: expiryFromSeconds(
                    rotatedAt,
                    token.expiresIn,
                ),
                refreshTokenExpiresAt: expiryFromSeconds(
                    rotatedAt,
                    token.refreshTokenExpiresIn,
                ),
            };
        } catch (error) {
            throw mapProviderError(error, signal);
        }
    }

    /**
     * Revokes the complete GitHub App user authorisation through the broker.
     *
     * @param signal - Revocation cancellation signal.
     * @param credential - Prepared decrypted token bundle.
     */
    async revokeCredential(
        signal: AbortSignal,
        credential: string,
    ): Promise<void> {
        try {
            const stored = GitHubStoredCredentialSchema.parse(
                JSON.parse(credential),
            );
            await this.broker.revoke(stored.accessToken, signal);
        } catch (error) {
            throw mapProviderError(error, signal);
        }
    }

    /**
     * Rotates an expiring GitHub credential.
     *
     * @param refreshToken - Current GitHub refresh token.
     * @param signal - Refresh cancellation signal.
     * @returns The rotated token bundle.
     */
    private async rotateCredential(
        refreshToken: string | null,
        signal: AbortSignal,
    ): Promise<GitHubTokenBundle> {
        if (!refreshToken) {
            throw new GitHubBrokerError('github_rejected_token', 401);
        }
        return this.broker.refresh(refreshToken, signal);
    }

    /**
     * Opens GitHub's exact installed-app access settings when known.
     *
     * @param accessTarget - Persisted verified GitHub installation target.
     */
    async openManageAccess(
        accessTarget: AppIntegrationAccessTarget,
    ): Promise<void> {
        await shell.openExternal(validatedManageAccessUrl(accessTarget));
    }
}

/**
 * Revalidates persisted GitHub settings metadata before browser navigation.
 *
 * @param accessTarget - Persisted non-secret installation metadata.
 * @returns The exact safe GitHub settings URL.
 */
function validatedManageAccessUrl(
    accessTarget: AppIntegrationAccessTarget,
): string {
    const expectedPath =
        accessTarget.type === 'organization'
            ? `/organizations/${accessTarget.login}/settings/installations/${accessTarget.providerTargetId}`
            : `/settings/installations/${accessTarget.providerTargetId}`;
    const url = new URL(accessTarget.manageUrl);
    if (
        url.origin !== 'https://github.com' ||
        url.pathname !== expectedPath ||
        url.search !== '' ||
        url.hash !== ''
    ) {
        throw new Error('The GitHub installation settings URL is invalid');
    }
    return url.toString();
}

/** Converts a relative provider lifetime into an ISO expiry. */
function expiryFromSeconds(
    createdAt: number,
    lifetimeSeconds: number | null,
): string | null {
    return lifetimeSeconds === null
        ? null
        : new Date(createdAt + lifetimeSeconds * 1_000).toISOString();
}

/** Maps implementation errors into renderer-safe provider classifications. */
function mapProviderError(
    error: unknown,
    signal: AbortSignal,
): AppIntegrationProviderError {
    if (signal.aborted) {
        return new AppIntegrationProviderError(
            signal.reason === 'timed-out' ? 'timed-out' : 'cancelled',
        );
    }
    if (error instanceof AppIntegrationProviderError) {
        return error;
    }
    if (error instanceof GitHubBrokerError) {
        if (error.code === 'attempt_denied') {
            return new AppIntegrationProviderError('denied');
        }
        if (error.code === 'attempt_expired') {
            return new AppIntegrationProviderError('timed-out');
        }
        if (
            error.code === 'github_unavailable' ||
            error.code === 'rate_limited'
        ) {
            return new AppIntegrationProviderError('provider-unavailable');
        }
        return new AppIntegrationProviderError('invalid-response');
    }
    if (error instanceof ZodError) {
        return new AppIntegrationProviderError('invalid-response');
    }
    return new AppIntegrationProviderError(
        error instanceof TypeError ||
            (error instanceof Error && error.name === 'TimeoutError')
            ? 'network-error'
            : 'invalid-response',
    );
}
