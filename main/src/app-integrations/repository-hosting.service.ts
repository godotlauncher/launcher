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
    RepositoryHostingFailureReason,
} from './app-integration-capability.types.js';
import { RepositoryBrowsingError } from './app-integration-capability.types.js';
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
        capability: ReturnType<AppIntegrationCapabilityRegistry['get']>,
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
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        value,
    );
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
