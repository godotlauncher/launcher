import { randomUUID } from 'node:crypto';
import type { OnModuleDestroy } from '@mariodebono/di';
import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AppIntegrationCapabilityRegistry } from './app-integration-capability.registry.js';
import type {
    AppIntegrationCredentialLeaseResult,
    AppIntegrationCredentialRoute,
    RepositoryBrowsingCapability,
    RepositoryBrowsingRepository,
    RepositoryCreation,
    RepositoryCreationCapability,
    RepositoryCreationFailureReason,
    RepositoryHostingFailureReason,
    RepositorySelection,
} from './app-integration-capability.types.js';
import {
    RepositoryBrowsingError,
    RepositoryCreationError,
} from './app-integration-capability.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AppIntegrationsService } from './app-integrations.service.js';

const BROWSE_SESSION_EXPIRY_MS = 10 * 60 * 1_000;
const MAX_REPOSITORIES_PER_PAGE = 50;
const MAX_PROVIDER_CALLS_PER_PAGE = 4;
const REPOSITORY_OPERATION_TIMEOUT_MS = 30_000;

type BrowseRoute = {
    connectionId: string;
    accessTargetId: string;
    providerCursor: string | null;
    pending: RepositoryBrowsingRepository[];
    exhausted: boolean;
};

type BrowsedRepository = RepositoryBrowsingRepository & {
    repositoryRef: string;
    routeKeys: Set<string>;
};

export type RepositoryHostingPage = {
    sessionId: string;
    repositories: BrowsedRepository[];
    nextCursor: string | null;
};

export type RepositoryHostingResult =
    | { ok: true; page: RepositoryHostingPage }
    | { ok: false; reason: RepositoryHostingFailureReason };

export type RepositoryCloneAccess = {
    canonicalUrl: string;
    credential: {
        username: string;
        password: string;
    };
};

export type RepositoryCloneAccessResult<T> =
    | { ok: true; value: T }
    | { ok: false; reason: RepositoryHostingFailureReason };

export type RepositoryCreationTarget = {
    providerId: string;
    connectionId: string;
    accessTargetId: string;
    ownerLogin: string;
    ownerType: 'organization' | 'user';
    accountLogin: string;
};

export type RepositoryCreationTargetsResult =
    | { ok: true; targets: RepositoryCreationTarget[] }
    | { ok: false; reason: RepositoryCreationFailureReason };

export type RepositoryCreationSelection = {
    connectionId: string;
    accessTargetId: string;
    repositoryName: string;
};

export type RepositoryCreationAccessResult<T> =
    | { ok: true; value: T }
    | { ok: false; reason: RepositoryCreationFailureReason };

export type RepositoryPushAccess = {
    credential: {
        username: string;
        password: string;
    };
};

type BrowseSession = {
    id: string;
    providerId: string;
    lastActivityAt: number;
    routes: BrowseRoute[];
    nextRouteIndex: number;
    repositories: Map<string, BrowsedRepository>;
    validCursors: Set<string>;
    cachedPages: Map<string, RepositoryHostingResult>;
};

@Injectable()
export class RepositoryHostingService implements OnModuleDestroy {
    private readonly sessions = new Map<string, BrowseSession>();

    /**
     * Creates the connected repository discovery service.
     *
     * @param capabilities - Validated provider capability registry.
     * @param integrations - Credential and connection lifecycle boundary.
     */
    constructor(
        private readonly capabilities: AppIntegrationCapabilityRegistry,
        private readonly integrations: AppIntegrationsService,
    ) {}

    /** Clears all in-memory browse sessions during shutdown. */
    onModuleDestroy(): void {
        this.sessions.clear();
    }

    /**
     * Lists current renderer-safe routes approved for repository creation.
     *
     * @param providerId - Registered hosting provider ID.
     * @returns Eligible owner routes or one stable failure.
     */
    async listRepositoryCreationTargets(
        providerId: string,
    ): Promise<RepositoryCreationTargetsResult> {
        if (!providerId.trim()) {
            return { ok: false, reason: 'invalid-request' };
        }
        try {
            this.capabilities.get(providerId, 'repository-creation');
        } catch {
            return { ok: false, reason: 'invalid-request' };
        }
        const lease = await this.integrations.withCredentialLease(
            providerId,
            async (routes) =>
                routes
                    .filter((route) =>
                        route.accessTarget.capabilities.includes(
                            'repository-creation',
                        ),
                    )
                    .map((route) => ({
                        providerId,
                        connectionId: route.connectionId,
                        accessTargetId: route.accessTarget.id,
                        ownerLogin: route.accessTarget.login,
                        ownerType: route.accessTarget.type,
                        accountLogin: route.accountLogin,
                    }))
                    .sort(
                        (left, right) =>
                            left.ownerLogin.localeCompare(right.ownerLogin) ||
                            left.accountLogin.localeCompare(right.accountLogin),
                    ),
        );
        if (!lease.ok) {
            return { ok: false, reason: mapLeaseFailure(lease.reason) };
        }
        if (lease.value.length === 0) {
            return { ok: false, reason: 'permission-update-required' };
        }
        return { ok: true, targets: lease.value };
    }

    /**
     * Creates a repository through one exact refreshed route and keeps its
     * credential available only for the trusted follow-on operation.
     *
     * @param providerId - Registered hosting provider ID.
     * @param selection - Exact renderer-safe target and repository name.
     * @param operation - Trusted main-process operation using the creation.
     * @returns The operation value or one stable creation failure.
     */
    async withRepositoryCreationAccess<T>(
        providerId: string,
        selection: RepositoryCreationSelection,
        operation: (creation: RepositoryCreation) => Promise<T>,
    ): Promise<RepositoryCreationAccessResult<T>> {
        if (
            !providerId.trim() ||
            !isOpaqueId(selection.connectionId) ||
            !isOpaqueId(selection.accessTargetId)
        ) {
            return { ok: false, reason: 'invalid-request' };
        }
        let capability: RepositoryCreationCapability;
        try {
            capability = this.capabilities.get(
                providerId,
                'repository-creation',
            );
        } catch {
            return { ok: false, reason: 'invalid-request' };
        }
        const lease = await this.integrations.withCredentialLease(
            providerId,
            async (routes): Promise<RepositoryCreationAccessResult<T>> => {
                const route = routes.find(
                    (candidate) =>
                        candidate.connectionId === selection.connectionId &&
                        candidate.accessTarget.id === selection.accessTargetId,
                );
                if (!route) {
                    return { ok: false, reason: 'target-unavailable' };
                }
                if (
                    !route.accessTarget.capabilities.includes(
                        'repository-creation',
                    )
                ) {
                    return {
                        ok: false,
                        reason: 'permission-update-required',
                    };
                }
                try {
                    const creation = await capability.createRepository({
                        credential: route.credential,
                        accessTarget: route.accessTarget,
                        repositoryName: selection.repositoryName,
                        signal: AbortSignal.timeout(
                            REPOSITORY_OPERATION_TIMEOUT_MS,
                        ),
                    });
                    return { ok: true, value: await operation(creation) };
                } catch (error) {
                    return {
                        ok: false,
                        reason:
                            error instanceof RepositoryCreationError
                                ? error.reason
                                : 'provider-unavailable',
                    };
                }
            },
        );
        return lease.ok
            ? lease.value
            : { ok: false, reason: mapLeaseFailure(lease.reason) };
    }

    /**
     * Provides a fresh Git credential for a confirmed repository retry.
     *
     * @param providerId - Registered hosting provider ID.
     * @param selection - Exact renderer-safe target IDs.
     * @param operation - Trusted main-process retry operation.
     * @returns The operation value or one stable credential failure.
     */
    async withRepositoryPushAccess<T>(
        providerId: string,
        selection: Pick<
            RepositoryCreationSelection,
            'accessTargetId' | 'connectionId'
        >,
        operation: (access: RepositoryPushAccess) => Promise<T>,
    ): Promise<RepositoryCreationAccessResult<T>> {
        if (
            !providerId.trim() ||
            !isOpaqueId(selection.connectionId) ||
            !isOpaqueId(selection.accessTargetId)
        ) {
            return { ok: false, reason: 'invalid-request' };
        }
        let capability: RepositoryCreationCapability;
        try {
            capability = this.capabilities.get(
                providerId,
                'repository-creation',
            );
        } catch {
            return { ok: false, reason: 'invalid-request' };
        }
        const lease = await this.integrations.withCredentialLease(
            providerId,
            async (routes): Promise<RepositoryCreationAccessResult<T>> => {
                const route = routes.find(
                    (candidate) =>
                        candidate.connectionId === selection.connectionId &&
                        candidate.accessTarget.id === selection.accessTargetId,
                );
                if (!route) {
                    return { ok: false, reason: 'target-unavailable' };
                }
                try {
                    const credential = capability.getGitCredential({
                        credential: route.credential,
                        accessTarget: route.accessTarget,
                    });
                    return {
                        ok: true,
                        value: await operation({ credential }),
                    };
                } catch (error) {
                    return {
                        ok: false,
                        reason:
                            error instanceof RepositoryCreationError
                                ? error.reason
                                : 'provider-unavailable',
                    };
                }
            },
        );
        return lease.ok
            ? lease.value
            : { ok: false, reason: mapLeaseFailure(lease.reason) };
    }

    /**
     * Lists one renderer-sized page from connected provider routes.
     *
     * @param providerId - Registered hosting provider ID.
     * @param cursor - Opaque cursor from the previous page.
     * @returns A safe page or stable failure reason.
     */
    async listRepositories(
        providerId: string,
        cursor?: string,
    ): Promise<RepositoryHostingResult> {
        if (
            !providerId.trim() ||
            (cursor !== undefined && !isOpaqueId(cursor))
        ) {
            return { ok: false, reason: 'invalid-request' };
        }
        let capability: RepositoryBrowsingCapability;
        try {
            capability = this.capabilities.get(
                providerId,
                'repository-browsing',
            );
        } catch {
            return { ok: false, reason: 'invalid-request' };
        }

        let session = this.sessions.get(providerId);
        if (cursor === undefined) {
            session = {
                id: randomUUID(),
                providerId,
                lastActivityAt: Date.now(),
                routes: [],
                nextRouteIndex: 0,
                repositories: new Map(),
                validCursors: new Set(),
                cachedPages: new Map(),
            };
            this.sessions.set(providerId, session);
        } else if (
            !session ||
            Date.now() - session.lastActivityAt >= BROWSE_SESSION_EXPIRY_MS ||
            !session.validCursors.has(cursor)
        ) {
            this.sessions.delete(providerId);
            return { ok: false, reason: 'session-expired' };
        } else {
            const cached = session.cachedPages.get(cursor);
            if (cached) {
                session.lastActivityAt = Date.now();
                return cached;
            }
        }

        const activeSession = session;
        let lease: AppIntegrationCredentialLeaseResult<RepositoryHostingResult>;
        try {
            lease = await this.integrations.withCredentialLease(
                providerId,
                async (credentialRoutes) => {
                    if (cursor !== undefined) {
                        const cached = activeSession.cachedPages.get(cursor);
                        if (cached) {
                            return cached;
                        }
                    }
                    if (activeSession.routes.length === 0) {
                        activeSession.routes = credentialRoutes.map(
                            (route) => ({
                                connectionId: route.connectionId,
                                accessTargetId: route.accessTarget.id,
                                providerCursor: null,
                                pending: [],
                                exhausted: false,
                            }),
                        );
                    } else if (
                        !routesRemainAvailable(activeSession, credentialRoutes)
                    ) {
                        throw new RepositoryBrowsingError('session-expired');
                    }
                    return this.fillPage(
                        activeSession,
                        credentialRoutes,
                        capability,
                    );
                },
            );
        } catch (error) {
            const reason =
                error instanceof RepositoryBrowsingError
                    ? error.reason
                    : 'provider-unavailable';
            if (reason === 'session-expired') {
                this.sessions.delete(providerId);
            }
            return { ok: false, reason };
        }
        if (!lease.ok) {
            return lease;
        }

        const result = lease.value;
        activeSession.lastActivityAt = Date.now();
        if (!result.ok && result.reason === 'session-expired') {
            this.sessions.delete(providerId);
            return result;
        }
        if (cursor !== undefined) {
            activeSession.cachedPages.set(cursor, result);
        }
        return result;
    }

    /**
     * Revalidates one opaque repository selection and runs a credential-scoped operation.
     *
     * @param providerId - Registered hosting provider ID.
     * @param repositoryRef - Opaque repository reference from the active session.
     * @param operation - Trusted main-process clone operation.
     * @returns The operation value or a safe repository access failure.
     */
    async withRepositoryCloneAccess<T>(
        providerId: string,
        repositoryRef: string,
        operation: (access: RepositoryCloneAccess) => Promise<T>,
    ): Promise<RepositoryCloneAccessResult<T>> {
        if (!providerId.trim() || !isOpaqueId(repositoryRef)) {
            return { ok: false, reason: 'invalid-request' };
        }
        const session = this.sessions.get(providerId);
        if (
            !session ||
            Date.now() - session.lastActivityAt >= BROWSE_SESSION_EXPIRY_MS
        ) {
            this.sessions.delete(providerId);
            return { ok: false, reason: 'session-expired' };
        }
        const repository = [...session.repositories.values()].find(
            (candidate) => candidate.repositoryRef === repositoryRef,
        );
        if (!repository) {
            return { ok: false, reason: 'session-expired' };
        }
        let capability: RepositoryBrowsingCapability;
        try {
            capability = this.capabilities.get(
                providerId,
                'repository-browsing',
            );
        } catch {
            return { ok: false, reason: 'invalid-request' };
        }

        const lease = await this.integrations.withCredentialLease(
            providerId,
            async (
                credentialRoutes,
            ): Promise<RepositoryCloneAccessResult<T>> => {
                const failures: RepositoryHostingFailureReason[] = [];
                for (const route of credentialRoutes) {
                    if (!repository.routeKeys.has(routeKey(route))) {
                        continue;
                    }
                    let selection: RepositorySelection;
                    try {
                        selection = await capability.resolveRepository({
                            credential: route.credential,
                            accessTarget: route.accessTarget,
                            repository,
                            signal: AbortSignal.timeout(
                                REPOSITORY_OPERATION_TIMEOUT_MS,
                            ),
                        });
                    } catch (error) {
                        failures.push(
                            error instanceof RepositoryBrowsingError
                                ? error.reason
                                : 'provider-unavailable',
                        );
                        continue;
                    }
                    if (selection.repository.id !== repository.id) {
                        failures.push('repository-unavailable');
                        continue;
                    }
                    return {
                        ok: true,
                        value: await operation({
                            canonicalUrl: selection.repository.cloneUrl,
                            credential: selection.gitCredential,
                        }),
                    };
                }
                return {
                    ok: false,
                    reason:
                        failures.length > 0
                            ? selectFailure(failures)
                            : 'session-expired',
                };
            },
        );
        if (!lease.ok) {
            return lease;
        }
        session.lastActivityAt = Date.now();
        return lease.value;
    }

    /**
     * Fills one page within provider-call and repository limits.
     *
     * @param session - Active provider browse session.
     * @param credentialRoutes - Current ephemeral credential routes.
     * @param capability - Provider repository-browsing capability.
     * @returns The next safe main-process page.
     */
    private async fillPage(
        session: BrowseSession,
        credentialRoutes: readonly AppIntegrationCredentialRoute[],
        capability: RepositoryBrowsingCapability,
    ): Promise<RepositoryHostingResult> {
        const repositories: BrowsedRepository[] = [];
        const failures: RepositoryHostingFailureReason[] = [];
        let calls = 0;
        let successfulRoute = false;

        while (
            repositories.length < MAX_REPOSITORIES_PER_PAGE &&
            calls < MAX_PROVIDER_CALLS_PER_PAGE &&
            session.routes.some(
                (route) => !route.exhausted || route.pending.length,
            )
        ) {
            const route = nextRoute(session);
            if (!route) {
                break;
            }
            this.consumeRepositories(
                session,
                route,
                route.pending,
                repositories,
            );
            if (
                repositories.length >= MAX_REPOSITORIES_PER_PAGE ||
                route.pending.length > 0 ||
                route.exhausted
            ) {
                continue;
            }

            const credentialRoute = credentialRoutes.find(
                (candidate) => routeKey(candidate) === browseRouteKey(route),
            );
            if (!credentialRoute) {
                throw new RepositoryBrowsingError('session-expired');
            }
            calls += 1;
            try {
                const page = await capability.listRepositories({
                    credential: credentialRoute.credential,
                    accessTarget: credentialRoute.accessTarget,
                    cursor: route.providerCursor,
                    signal: AbortSignal.timeout(
                        REPOSITORY_OPERATION_TIMEOUT_MS,
                    ),
                });
                successfulRoute = true;
                route.providerCursor = page.nextCursor;
                route.exhausted = page.nextCursor === null;
                route.pending.push(...page.repositories);
                this.consumeRepositories(
                    session,
                    route,
                    route.pending,
                    repositories,
                );
            } catch (error) {
                route.exhausted = true;
                failures.push(
                    error instanceof RepositoryBrowsingError
                        ? error.reason
                        : 'provider-unavailable',
                );
            }
        }

        if (!successfulRoute && repositories.length === 0 && failures.length) {
            return { ok: false, reason: selectFailure(failures) };
        }
        const hasMore = session.routes.some(
            (route) => !route.exhausted || route.pending.length > 0,
        );
        const nextCursor = hasMore ? randomUUID() : null;
        if (nextCursor) {
            session.validCursors.add(nextCursor);
        }
        return {
            ok: true,
            page: {
                sessionId: session.id,
                repositories,
                nextCursor,
            },
        };
    }

    /**
     * Adds unique repositories to a page and retains alternative routes.
     *
     * @param session - Active browse session.
     * @param route - Route that returned the repositories.
     * @param pending - Mutable route queue.
     * @param output - Current renderer-sized page.
     */
    private consumeRepositories(
        session: BrowseSession,
        route: BrowseRoute,
        pending: RepositoryBrowsingRepository[],
        output: BrowsedRepository[],
    ): void {
        while (pending.length && output.length < MAX_REPOSITORIES_PER_PAGE) {
            const repository = pending.shift();
            if (!repository) {
                break;
            }
            const identity = `${session.providerId}\u0000${repository.id}`;
            const routeIdentity = browseRouteKey(route);
            const existing = session.repositories.get(identity);
            if (existing) {
                existing.routeKeys.add(routeIdentity);
                continue;
            }
            const browsed = {
                ...repository,
                repositoryRef: randomUUID(),
                routeKeys: new Set([routeIdentity]),
            };
            session.repositories.set(identity, browsed);
            output.push(browsed);
        }
    }
}

/** Selects the next non-empty or non-exhausted route in round-robin order. */
function nextRoute(session: BrowseSession): BrowseRoute | null {
    for (let offset = 0; offset < session.routes.length; offset += 1) {
        const index = (session.nextRouteIndex + offset) % session.routes.length;
        const route = session.routes[index];
        if (!route.exhausted || route.pending.length) {
            session.nextRouteIndex = (index + 1) % session.routes.length;
            return route;
        }
    }
    return null;
}

/** Returns whether every session route still maps to a usable target. */
function routesRemainAvailable(
    session: BrowseSession,
    routes: readonly AppIntegrationCredentialRoute[],
): boolean {
    const available = new Set(routes.map(routeKey));
    return session.routes.every((route) =>
        available.has(browseRouteKey(route)),
    );
}

/** Builds a stable main-only route identity from an ephemeral lease route. */
function routeKey(route: AppIntegrationCredentialRoute): string {
    return `${route.connectionId}\u0000${route.accessTarget.id}`;
}

/** Builds a stable main-only route identity from session state. */
function browseRouteKey(route: BrowseRoute): string {
    return `${route.connectionId}\u0000${route.accessTargetId}`;
}

/** Returns whether a value has the opaque UUID shape generated by Launcher. */
function isOpaqueId(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        value,
    );
}

/** Maps a credential-boundary failure to repository creation copy. */
function mapLeaseFailure(
    reason: Exclude<
        AppIntegrationCredentialLeaseResult<unknown>,
        { ok: true }
    >['reason'],
): RepositoryCreationFailureReason {
    if (reason === 'secure-storage-unavailable') {
        return reason;
    }
    if (reason === 'reauthorisation-required') {
        return 'permission-update-required';
    }
    if (reason === 'no-usable-connection') {
        return reason;
    }
    return 'provider-unavailable';
}

/** Selects the most actionable safe failure when every route failed. */
function selectFailure(
    failures: readonly RepositoryHostingFailureReason[],
): RepositoryHostingFailureReason {
    for (const reason of [
        'rate-limited',
        'reauthorisation-required',
        'network-unavailable',
        'provider-unavailable',
    ] as const) {
        if (failures.includes(reason)) {
            return reason;
        }
    }
    return 'provider-unavailable';
}
