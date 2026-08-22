import { randomUUID } from 'node:crypto';
import type { OnModuleDestroy } from '@mariodebono/di';
import { Injectable } from '@mariodebono/di';
import type {
    AppIntegrationActionFailureReason,
    AppIntegrationActionResult,
    AppIntegrationConnectionOption,
    AppIntegrationConnectionSummary,
    AppIntegrationDisconnectOptions,
    AppIntegrationSummary,
} from '@shared/contracts';
import {
    type AppIntegrationConnectionIntent,
    type AppIntegrationConnectionRecord,
    type AppIntegrationProvider,
    type AppIntegrationProviderConnection,
    AppIntegrationProviderError,
    type AppIntegrationProviderInstallation,
} from './app-integration.types.js';
import type {
    AppIntegrationCredentialLeaseResult,
    AppIntegrationCredentialRoute,
} from './app-integration-capability.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AppIntegrationProviderRegistry } from './app-integration-provider.registry.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AppIntegrationSecretsStore } from './app-integration-secrets.store.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AppIntegrationSecureStorageAdapter } from './app-integration-secure-storage.adapter.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AppIntegrationsStore } from './app-integrations.store.js';

const CONNECTION_TIMEOUT_MS = 5 * 60 * 1_000;
const PROVIDER_ACTION_TIMEOUT_MS = 30_000;

type ConnectionSessionStage = 'authorising' | 'choosing' | 'installing';

type ActiveConnectionSession = {
    connectionId: string | null;
    controller: AbortController;
    timeout: ReturnType<typeof setTimeout> | null;
    stage: ConnectionSessionStage;
    busy: boolean;
    committing: boolean;
    connected: AppIntegrationProviderConnection | null;
    installation: AppIntegrationProviderInstallation | null;
    options: Array<{
        id: string;
        target: AppIntegrationProviderConnection['accessTargets'][number];
    }>;
};

@Injectable()
export class AppIntegrationsService implements OnModuleDestroy {
    private readonly connectionSessions = new Map<
        string,
        ActiveConnectionSession
    >();
    private readonly activeRefreshes = new Set<string>();
    private readonly activeDisconnects = new Set<string>();
    private readonly providerOperationTails = new Map<string, Promise<void>>();

    /**
     * Creates the renderer-safe app integration facade.
     *
     * @param registry - Registry of statically compiled providers.
     * @param store - Non-secret connection metadata store.
     * @param secrets - Encrypted credential store.
     * @param secureStorage - OS-backed encryption adapter.
     */
    constructor(
        private readonly registry: AppIntegrationProviderRegistry,
        private readonly store: AppIntegrationsStore,
        private readonly secrets: AppIntegrationSecretsStore,
        private readonly secureStorage: AppIntegrationSecureStorageAdapter,
    ) {}

    /** Cancels every active browser connection attempt during shutdown. */
    onModuleDestroy(): void {
        for (const session of this.connectionSessions.values()) {
            if (session.timeout) {
                clearTimeout(session.timeout);
            }
            session.controller.abort('cancelled');
            if (session.installation) {
                void session.installation.close().catch(() => undefined);
            }
        }
        this.connectionSessions.clear();
    }

    /** Returns renderer-safe summaries for all registered integrations. */
    async list(): Promise<AppIntegrationSummary[]> {
        return Promise.all(
            this.registry.list().map((provider) => this.summarize(provider)),
        );
    }

    /**
     * Authorises a provider identity and connects its available installations.
     *
     * @param providerId - Registered provider ID.
     * @returns The updated renderer-safe integration result.
     */
    async connect(providerId: string): Promise<AppIntegrationActionResult> {
        return this.beginConnection(providerId, 'connect', null);
    }

    /**
     * Persists existing verified installation choices.
     *
     * @param providerId - Registered provider ID.
     * @param optionIds - Opaque renderer-safe option IDs.
     * @returns The updated renderer-safe integration result.
     */
    async finishConnections(
        providerId: string,
        optionIds: string[],
    ): Promise<AppIntegrationActionResult> {
        const provider = this.registry.get(providerId);
        const session = this.connectionSessions.get(providerId);
        const uniqueOptionIds = new Set(optionIds);
        const options = session?.options.filter((item) =>
            uniqueOptionIds.has(item.id),
        );
        if (
            session?.stage !== 'choosing' ||
            session.busy ||
            !session.connected ||
            uniqueOptionIds.size === 0 ||
            uniqueOptionIds.size !== optionIds.length ||
            options?.length !== uniqueOptionIds.size
        ) {
            return this.failure(provider, 'unknown');
        }

        const connected = session.connected;
        session.busy = true;
        this.claimSessionCompletion(providerId, session);
        try {
            await this.runProviderOperation(providerId, () =>
                this.persist(
                    providerId,
                    {
                        ...connected,
                        accessTargets: options.map((option) => option.target),
                    },
                    null,
                    'connect',
                ),
            );
            await this.clearConnectionSession(providerId, session, 'completed');
            return { ok: true, integration: await this.summarize(provider) };
        } catch {
            await this.clearConnectionSession(providerId, session, 'failed');
            return this.failure(provider, 'unknown');
        }
    }

    /**
     * Opens the provider installation flow for an authorised connection session.
     *
     * @param providerId - Registered provider ID.
     * @returns The updated renderer-safe integration result.
     */
    async installConnection(
        providerId: string,
    ): Promise<AppIntegrationActionResult> {
        const provider = this.registry.get(providerId);
        const session = this.connectionSessions.get(providerId);
        if (
            session?.stage !== 'choosing' ||
            session.busy ||
            !session.installation
        ) {
            return this.failure(provider, 'unknown');
        }

        session.busy = true;
        session.stage = 'installing';
        try {
            const connected = await session.installation.install();
            if (!this.claimSessionCompletion(providerId, session)) {
                throw new AppIntegrationProviderError(
                    session.controller.signal.reason === 'timed-out'
                        ? 'timed-out'
                        : 'cancelled',
                );
            }
            const selectedTargetId = connected.selectedAccessTargetId;
            const selectedTargets = connected.accessTargets.filter(
                (target) => target.providerTargetId === selectedTargetId,
            );
            if (selectedTargetId === null || selectedTargets.length !== 1) {
                throw new AppIntegrationProviderError('installation-required');
            }
            await this.runProviderOperation(providerId, () =>
                this.persist(
                    providerId,
                    { ...connected, accessTargets: selectedTargets },
                    null,
                    'connect',
                ),
            );
            await this.clearConnectionSession(providerId, session, 'completed');
            return { ok: true, integration: await this.summarize(provider) };
        } catch (error) {
            await this.clearConnectionSession(providerId, session, 'failed');
            const reason =
                error instanceof AppIntegrationProviderError
                    ? error.reason
                    : 'unknown';
            return this.failure(provider, reason);
        }
    }

    /**
     * Cancels the current provider connection attempt.
     *
     * @param providerId - Registered provider ID.
     * @returns The updated renderer-safe integration result.
     */
    async cancel(providerId: string): Promise<AppIntegrationActionResult> {
        const session = this.connectionSessions.get(providerId);
        if (!session?.committing) {
            await this.clearConnectionSession(providerId, session, 'cancelled');
        }
        return {
            ok: true,
            integration: await this.summarize(this.registry.get(providerId)),
        };
    }

    /**
     * Reauthorises one existing account without replacing it on failure.
     *
     * @param providerId - Registered provider ID.
     * @param connectionId - Target local connection ID.
     * @returns The updated renderer-safe integration result.
     */
    async reconnect(
        providerId: string,
        connectionId: string,
    ): Promise<AppIntegrationActionResult> {
        return this.beginConnection(providerId, 'reconnect', connectionId);
    }

    /**
     * Refreshes credentials and installation availability for one provider.
     *
     * @param providerId - Registered provider ID.
     * @returns The updated renderer-safe integration result.
     */
    async refresh(providerId: string): Promise<AppIntegrationActionResult> {
        const provider = this.registry.get(providerId);
        if (
            this.connectionSessions.has(providerId) ||
            this.activeRefreshes.has(providerId) ||
            this.activeDisconnects.has(providerId)
        ) {
            return { ok: true, integration: await this.summarize(provider) };
        }
        return this.runProviderOperation(providerId, () =>
            this.refreshLocked(provider),
        );
    }

    /**
     * Refreshes one provider while its credential lock is held.
     *
     * @param provider - Registered provider implementation.
     * @returns The updated renderer-safe integration result.
     */
    private async refreshLocked(
        provider: AppIntegrationProvider,
    ): Promise<AppIntegrationActionResult> {
        const providerId = provider.metadata.id;
        if (
            this.connectionSessions.has(providerId) ||
            this.activeRefreshes.has(providerId) ||
            this.activeDisconnects.has(providerId)
        ) {
            return { ok: true, integration: await this.summarize(provider) };
        }
        if (!(await this.secureStorage.isAvailable())) {
            return this.failure(provider, 'secure-storage-unavailable');
        }
        this.activeRefreshes.add(providerId);
        try {
            for (const record of await this.store.listByProvider(providerId)) {
                await this.refreshConnection(provider, record);
            }
            return { ok: true, integration: await this.summarize(provider) };
        } catch {
            return this.failure(provider, 'unknown');
        } finally {
            this.activeRefreshes.delete(providerId);
        }
    }

    /**
     * Opens one provider-owned installation settings page.
     *
     * @param providerId - Registered provider ID.
     * @param connectionId - Target local connection ID.
     * @param accessTargetId - Renderer-safe installation target ID.
     * @returns The latest renderer-safe integration result.
     */
    async manageAccess(
        providerId: string,
        connectionId: string,
        accessTargetId: string,
    ): Promise<AppIntegrationActionResult> {
        const provider = this.registry.get(providerId);
        try {
            const record = await this.getProviderConnection(
                providerId,
                connectionId,
            );
            const target = record?.accessTargets.find(
                (accessTarget) => accessTarget.id === accessTargetId,
            );
            if (!record || !target) {
                return this.failure(provider, 'unknown');
            }
            await provider.openManageAccess(target);
            return { ok: true, integration: await this.summarize(provider) };
        } catch {
            return this.failure(provider, 'unknown');
        }
    }

    /**
     * Runs a main-process operation with current credentials for usable targets.
     * Credential references exist only for the duration of the callback.
     *
     * @param providerId - Registered provider ID.
     * @param operation - Main-process callback that consumes ephemeral routes.
     * @returns The callback value or a safe credential-boundary failure.
     */
    async withCredentialLease<T>(
        providerId: string,
        operation: (
            routes: readonly AppIntegrationCredentialRoute[],
        ) => Promise<T>,
    ): Promise<AppIntegrationCredentialLeaseResult<T>> {
        const provider = this.registry.get(providerId);
        return this.runProviderOperation(providerId, async () => {
            if (!(await this.secureStorage.isAvailable())) {
                return {
                    ok: false,
                    reason: 'secure-storage-unavailable',
                } as const;
            }

            const initialRecords = await this.store.listByProvider(providerId);
            if (initialRecords.length === 0) {
                return { ok: false, reason: 'no-usable-connection' } as const;
            }

            let leasedRoutes: AppIntegrationCredentialRoute[] = [];
            let providerUnavailable = false;
            try {
                for (const record of initialRecords) {
                    if (!record.requiresReauthorisation) {
                        try {
                            await this.refreshConnection(provider, record);
                        } catch {
                            providerUnavailable = true;
                        }
                    }
                }
                const records = await this.store.listByProvider(providerId);
                const routes: AppIntegrationCredentialRoute[] = [];
                let requiresReauthorisation = false;
                for (const record of records) {
                    if (record.requiresReauthorisation) {
                        requiresReauthorisation = true;
                        continue;
                    }
                    const encrypted = await this.secrets.get(record.id);
                    if (!encrypted) {
                        requiresReauthorisation = true;
                        await this.store.set({
                            ...record,
                            requiresReauthorisation: true,
                        });
                        continue;
                    }
                    let credential: string;
                    try {
                        credential =
                            await this.secureStorage.decrypt(encrypted);
                    } catch {
                        requiresReauthorisation = true;
                        await this.store.set({
                            ...record,
                            requiresReauthorisation: true,
                        });
                        continue;
                    }
                    for (const accessTarget of record.accessTargets) {
                        if (accessTarget.availability === 'available') {
                            routes.push({
                                connectionId: record.id,
                                accessTarget,
                                credential,
                            });
                        }
                    }
                }
                if (routes.length === 0) {
                    return {
                        ok: false,
                        reason: requiresReauthorisation
                            ? 'reauthorisation-required'
                            : providerUnavailable
                              ? 'provider-unavailable'
                              : 'no-usable-connection',
                    } as const;
                }
                leasedRoutes = routes;
            } catch {
                return { ok: false, reason: 'provider-unavailable' } as const;
            }
            return {
                ok: true,
                value: await operation(leasedRoutes),
            } as const;
        });
    }

    /**
     * Removes one local installation connection and its credential when unused.
     *
     * @param providerId - Registered provider ID.
     * @param connectionId - Target local connection ID.
     * @param accessTargetId - Renderer-safe installation target ID.
     * @param options - Explicit final-connection revocation choice.
     * @returns The updated renderer-safe integration result.
     */
    async disconnect(
        providerId: string,
        connectionId: string,
        accessTargetId: string,
        options: AppIntegrationDisconnectOptions,
    ): Promise<AppIntegrationActionResult> {
        const provider = this.registry.get(providerId);
        if (!isDisconnectOptions(options)) {
            return this.failure(provider, 'unknown');
        }
        if (
            this.activeRefreshes.has(providerId) ||
            this.activeDisconnects.has(providerId)
        ) {
            return this.failure(provider, 'already-connecting');
        }
        return this.runProviderOperation(providerId, () =>
            this.disconnectLocked(
                provider,
                connectionId,
                accessTargetId,
                options,
            ),
        );
    }

    /**
     * Disconnects one access target while its credential lock is held.
     *
     * @param provider - Registered provider implementation.
     * @param connectionId - Target local connection ID.
     * @param accessTargetId - Renderer-safe installation target ID.
     * @param options - Explicit final-connection revocation choice.
     * @returns The updated renderer-safe integration result.
     */
    private async disconnectLocked(
        provider: AppIntegrationProvider,
        connectionId: string,
        accessTargetId: string,
        options: AppIntegrationDisconnectOptions,
    ): Promise<AppIntegrationActionResult> {
        const providerId = provider.metadata.id;
        if (
            this.activeRefreshes.has(providerId) ||
            this.activeDisconnects.has(providerId)
        ) {
            return this.failure(provider, 'already-connecting');
        }
        this.activeDisconnects.add(providerId);
        try {
            const activeSession = this.connectionSessions.get(providerId);
            if (activeSession?.connectionId === connectionId) {
                await this.clearConnectionSession(
                    providerId,
                    activeSession,
                    'cancelled',
                );
            }
            const record = await this.getProviderConnection(
                providerId,
                connectionId,
            );
            const target = record?.accessTargets.find(
                (accessTarget) => accessTarget.id === accessTargetId,
            );
            if (!record || !target) {
                return this.failure(provider, 'unknown');
            }
            const remainingTargets = record.accessTargets.filter(
                (accessTarget) => accessTarget.id !== accessTargetId,
            );
            if (remainingTargets.length > 0) {
                await this.store.set({
                    ...record,
                    accessTargets: remainingTargets,
                });
            } else {
                if (options.revokeAuthorisation) {
                    if (!(await this.secureStorage.isAvailable())) {
                        return this.failure(
                            provider,
                            'secure-storage-unavailable',
                        );
                    }
                    const encrypted = await this.secrets.get(record.id);
                    if (!encrypted) {
                        return this.failure(provider, 'unknown');
                    }
                    const credential =
                        await this.secureStorage.decrypt(encrypted);
                    const signal = AbortSignal.timeout(
                        PROVIDER_ACTION_TIMEOUT_MS,
                    );
                    const prepared = await provider.prepareCredentialRevocation(
                        signal,
                        credential,
                    );
                    if (prepared.credential !== credential) {
                        const preparedCiphertext =
                            await this.secureStorage.encrypt(
                                prepared.credential,
                            );
                        await this.secrets.set(record.id, preparedCiphertext);
                        await this.store.set({
                            ...record,
                            accessTokenExpiresAt: prepared.accessTokenExpiresAt,
                            refreshTokenExpiresAt:
                                prepared.refreshTokenExpiresAt,
                        });
                    }
                    await provider.revokeCredential(
                        signal,
                        prepared.credential,
                    );
                }
                const previousCiphertext = await this.secrets.get(record.id);
                await this.secrets.remove(record.id);
                try {
                    await this.store.remove(record.id);
                } catch (error) {
                    if (previousCiphertext) {
                        await this.secrets.set(record.id, previousCiphertext);
                    }
                    throw error;
                }
            }
            return { ok: true, integration: await this.summarize(provider) };
        } catch (error) {
            return this.failure(
                provider,
                error instanceof AppIntegrationProviderError
                    ? error.reason
                    : 'unknown',
            );
        } finally {
            this.activeDisconnects.delete(providerId);
        }
    }

    /**
     * Runs one provider connection and persists its validated result.
     *
     * @param providerId - Registered provider ID.
     * @param intent - Requested connection operation.
     * @param connectionId - Optional target local connection ID.
     * @returns The updated renderer-safe integration result.
     */
    private async beginConnection(
        providerId: string,
        intent: AppIntegrationConnectionIntent,
        connectionId: string | null,
    ): Promise<AppIntegrationActionResult> {
        const provider = this.registry.get(providerId);
        if (
            this.connectionSessions.has(providerId) ||
            this.activeRefreshes.has(providerId) ||
            this.activeDisconnects.has(providerId)
        ) {
            return this.failure(provider, 'already-connecting');
        }
        if (!(await this.secureStorage.isAvailable())) {
            return this.failure(provider, 'secure-storage-unavailable');
        }

        const current = connectionId
            ? await this.getProviderConnection(providerId, connectionId)
            : null;
        if (connectionId && !current) {
            return this.failure(provider, 'unknown');
        }

        const controller = new AbortController();
        const session: ActiveConnectionSession = {
            connectionId,
            controller,
            timeout: null,
            stage: 'authorising',
            busy: true,
            committing: false,
            connected: null,
            installation: null,
            options: [],
        };
        session.timeout = setTimeout(
            () =>
                void this.clearConnectionSession(
                    providerId,
                    session,
                    'timed-out',
                ),
            CONNECTION_TIMEOUT_MS,
        );
        this.connectionSessions.set(providerId, session);

        try {
            const result = await provider.connect(controller.signal, {
                intent,
                expectedAccountId: current?.accountId ?? null,
            });
            if (this.connectionSessions.get(providerId) !== session) {
                await result.installation?.close();
                throw new AppIntegrationProviderError(
                    controller.signal.reason === 'timed-out'
                        ? 'timed-out'
                        : 'cancelled',
                );
            }
            if (intent === 'connect') {
                if (!result.installation) {
                    throw new AppIntegrationProviderError('invalid-response');
                }
                const records = await this.store.listByProvider(providerId);
                const connectedTargetIds = new Set(
                    records
                        .filter(
                            (record) =>
                                record.accountId ===
                                result.connection.accountId,
                        )
                        .flatMap((record) =>
                            record.accessTargets.map(
                                (target) => target.providerTargetId,
                            ),
                        ),
                );
                const eligibleTargets = result.connection.accessTargets.filter(
                    (target) =>
                        !connectedTargetIds.has(target.providerTargetId),
                );
                session.connected = result.connection;
                session.installation = result.installation;
                session.options = eligibleTargets.map((target) => ({
                    id: randomUUID(),
                    target,
                }));
                session.stage = 'choosing';
                session.busy = false;
            } else {
                if (result.installation) {
                    await result.installation.close();
                    throw new AppIntegrationProviderError('invalid-response');
                }
                await this.runProviderOperation(providerId, () =>
                    this.persist(
                        providerId,
                        result.connection,
                        current,
                        intent,
                    ),
                );
                await this.clearConnectionSession(
                    providerId,
                    session,
                    'completed',
                );
            }
            return { ok: true, integration: await this.summarize(provider) };
        } catch (error) {
            await this.clearConnectionSession(providerId, session, 'failed');
            const reason =
                error instanceof AppIntegrationProviderError
                    ? error.reason
                    : 'unknown';
            return this.failure(provider, reason);
        }
    }

    /**
     * Persists one hidden credential record and its selected targets.
     *
     * @param providerId - Registered provider ID.
     * @param connected - Validated provider connection result.
     * @param targetedRecord - Explicitly targeted existing connection.
     * @param intent - Requested connection operation.
     */
    private async persist(
        providerId: string,
        connected: AppIntegrationProviderConnection,
        targetedRecord: AppIntegrationConnectionRecord | null,
        intent: AppIntegrationConnectionIntent,
    ): Promise<void> {
        const matchingRecord = await this.store.findByAccount(
            providerId,
            connected.accountId,
        );
        if (
            targetedRecord &&
            targetedRecord.accountId !== connected.accountId
        ) {
            throw new AppIntegrationProviderError('account-mismatch');
        }
        const previous = targetedRecord ?? matchingRecord;
        if (
            targetedRecord &&
            matchingRecord &&
            targetedRecord.id !== matchingRecord.id
        ) {
            throw new Error('Provider account maps to multiple connections');
        }

        const id = previous?.id ?? randomUUID();
        const previousTargets = new Map(
            previous?.accessTargets.map((target) => [
                target.providerTargetId,
                target,
            ]) ?? [],
        );
        const providerTargets =
            intent === 'reconnect' && previous
                ? previous.accessTargets.map(
                      (target) =>
                          connected.accessTargets.find(
                              (candidate) =>
                                  candidate.providerTargetId ===
                                  target.providerTargetId,
                          ) ?? {
                              providerTargetId: target.providerTargetId,
                              login: target.login,
                              type: target.type,
                              manageUrl: target.manageUrl,
                          },
                  )
                : [
                      ...(previous?.accessTargets.map(
                          (target) =>
                              connected.accessTargets.find(
                                  (candidate) =>
                                      candidate.providerTargetId ===
                                      target.providerTargetId,
                              ) ?? {
                                  providerTargetId: target.providerTargetId,
                                  login: target.login,
                                  type: target.type,
                                  manageUrl: target.manageUrl,
                              },
                      ) ?? []),
                      ...connected.accessTargets.filter(
                          (target) =>
                              !previousTargets.has(target.providerTargetId),
                      ),
                  ];
        if (providerTargets.length === 0) {
            throw new AppIntegrationProviderError('installation-required');
        }
        const accessTargets = providerTargets
            .map((target) => ({
                ...target,
                id:
                    previousTargets.get(target.providerTargetId)?.id ??
                    randomUUID(),
                availability: connected.accessTargets.some(
                    (candidate) =>
                        candidate.providerTargetId === target.providerTargetId,
                )
                    ? ('available' as const)
                    : intent === 'reconnect'
                      ? ('unavailable' as const)
                      : (previousTargets.get(target.providerTargetId)
                            ?.availability ?? 'available'),
            }))
            .sort((left, right) => left.login.localeCompare(right.login));
        const record: AppIntegrationConnectionRecord = {
            id,
            providerId,
            accountId: connected.accountId,
            accountLogin: connected.accountLogin,
            accountDisplayName: connected.accountDisplayName,
            connectedAt: previous?.connectedAt ?? new Date().toISOString(),
            accessTokenExpiresAt: connected.accessTokenExpiresAt,
            refreshTokenExpiresAt: connected.refreshTokenExpiresAt,
            requiresReauthorisation: false,
            accessTargets,
        };
        const previousCiphertext = previous
            ? await this.secrets.get(previous.id)
            : null;
        const encrypted = await this.secureStorage.encrypt(
            connected.credential,
        );
        await this.secrets.set(id, encrypted);
        try {
            await this.store.set(record);
        } catch (error) {
            if (previousCiphertext) {
                await this.secrets.set(id, previousCiphertext);
            } else {
                await this.secrets.remove(id).catch(() => undefined);
            }
            throw error;
        }
    }

    /**
     * Returns one connection only when it belongs to the requested provider.
     *
     * @param providerId - Registered provider ID.
     * @param connectionId - Target local connection ID.
     * @returns The matching connection, or null.
     */
    private async getProviderConnection(
        providerId: string,
        connectionId: string,
    ): Promise<AppIntegrationConnectionRecord | null> {
        const record = await this.store.get(connectionId);
        return record?.providerId === providerId ? record : null;
    }

    /**
     * Ends one connection session and releases its provider resources once.
     *
     * @param providerId - Registered provider ID.
     * @param session - Exact session that should be cleared.
     * @param reason - Abort reason for any pending provider work.
     */
    private async clearConnectionSession(
        providerId: string,
        session: ActiveConnectionSession | undefined,
        reason: 'cancelled' | 'completed' | 'failed' | 'timed-out',
    ): Promise<void> {
        if (!session || this.connectionSessions.get(providerId) !== session) {
            return;
        }
        this.connectionSessions.delete(providerId);
        if (session.timeout) {
            clearTimeout(session.timeout);
            session.timeout = null;
        }
        if (!session.controller.signal.aborted) {
            session.controller.abort(reason);
        }
        const installation = session.installation;
        session.connected = null;
        session.installation = null;
        session.options = [];
        try {
            await installation?.close();
        } catch {
            // Broker attempts expire independently, so local cleanup still wins.
        }
    }

    /**
     * Claims one verified outcome before writing it to secure local storage.
     *
     * @param providerId - Registered provider ID.
     * @param session - Exact session claiming its terminal outcome.
     * @returns Whether the session was still active and could be claimed.
     */
    private claimSessionCompletion(
        providerId: string,
        session: ActiveConnectionSession,
    ): boolean {
        if (this.connectionSessions.get(providerId) !== session) {
            return false;
        }
        session.committing = true;
        if (session.timeout) {
            clearTimeout(session.timeout);
            session.timeout = null;
        }
        return true;
    }

    /**
     * Refreshes one credential group while preserving state on transient failure.
     *
     * @param provider - Registered provider implementation.
     * @param record - Persisted authorised-user group.
     */
    private async refreshConnection(
        provider: AppIntegrationProvider,
        record: AppIntegrationConnectionRecord,
    ): Promise<void> {
        const encrypted = await this.secrets.get(record.id);
        if (!encrypted) {
            await this.store.set({
                ...record,
                requiresReauthorisation: true,
            });
            return;
        }
        let credential: string;
        try {
            credential = await this.secureStorage.decrypt(encrypted);
        } catch {
            await this.store.set({
                ...record,
                requiresReauthorisation: true,
            });
            return;
        }

        const result = await provider.refresh(
            AbortSignal.timeout(30_000),
            credential,
            record.accountId,
        );
        if (result.status === 'refreshed') {
            await this.persist(
                provider.metadata.id,
                result.connection,
                record,
                'reconnect',
            );
        } else if (result.status === 'reauthorisation-required') {
            await this.store.set({
                ...record,
                requiresReauthorisation: true,
            });
        }
    }

    /**
     * Serialises credential and connection-store work for one provider.
     *
     * @param providerId - Registered provider ID.
     * @param operation - Operation that owns the provider lock.
     * @returns The operation result.
     */
    private async runProviderOperation<T>(
        providerId: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        const previous = this.providerOperationTails.get(providerId);
        let release = (): void => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const tail = (previous ?? Promise.resolve())
            .catch(() => undefined)
            .then(() => gate);
        this.providerOperationTails.set(providerId, tail);
        await previous?.catch(() => undefined);
        try {
            return await operation();
        } finally {
            release();
            if (this.providerOperationTails.get(providerId) === tail) {
                this.providerOperationTails.delete(providerId);
            }
        }
    }

    /**
     * Builds one renderer-safe provider summary from current local state.
     *
     * @param provider - Registered provider implementation.
     * @returns The renderer-safe provider summary.
     */
    private async summarize(
        provider: AppIntegrationProvider,
    ): Promise<AppIntegrationSummary> {
        const records = await this.store.listByProvider(provider.metadata.id);
        const secureStorageAvailable = await this.secureStorage.isAvailable();
        const connections = await Promise.all(
            records
                .filter((record) => record.accessTargets.length > 0)
                .map((record) =>
                    this.summarizeConnection(
                        provider,
                        record,
                        secureStorageAvailable,
                    ),
                ),
        );
        connections.sort((left, right) =>
            (left.accountDisplayName ?? left.accountLogin).localeCompare(
                right.accountDisplayName ?? right.accountLogin,
            ),
        );

        const session = this.connectionSessions.get(provider.metadata.id);
        const connectionOptions: AppIntegrationConnectionOption[] =
            session?.options.map(({ id, target }) => ({
                id,
                login: target.login,
                type: target.type,
            })) ?? [];

        let state: AppIntegrationSummary['state'];
        if (session?.stage === 'choosing') {
            state = 'selection-required';
        } else if (session) {
            state = 'connecting';
        } else if (!secureStorageAvailable) {
            state = 'secure-storage-unavailable';
        } else if (connections.length === 0) {
            state = 'not-connected';
        } else if (
            connections.some((connection) => connection.state === 'connected')
        ) {
            state = 'connected';
        } else {
            state = 'reauthorisation-required';
        }

        return {
            id: provider.metadata.id,
            displayName: provider.metadata.displayName,
            state,
            connectionStage: session?.stage ?? null,
            connections,
            connectionOptions,
        };
    }

    /**
     * Builds one renderer-safe target group and validates its credential.
     *
     * @param provider - Registered provider implementation.
     * @param record - Persisted non-secret account metadata.
     * @param secureStorageAvailable - Whether encrypted credentials are readable.
     * @returns The renderer-safe target-group summary.
     */
    private async summarizeConnection(
        provider: AppIntegrationProvider,
        record: AppIntegrationConnectionRecord,
        secureStorageAvailable: boolean,
    ): Promise<AppIntegrationConnectionSummary> {
        let state: AppIntegrationConnectionSummary['state'];
        if (!secureStorageAvailable) {
            state = 'secure-storage-unavailable';
        } else {
            const encrypted = await this.secrets.get(record.id);
            try {
                const credential = encrypted
                    ? await this.secureStorage.decrypt(encrypted)
                    : null;
                state =
                    credential &&
                    provider.isCredentialValid(credential) &&
                    !record.requiresReauthorisation &&
                    (!record.refreshTokenExpiresAt ||
                        new Date(record.refreshTokenExpiresAt).getTime() >
                            Date.now())
                        ? 'connected'
                        : 'reauthorisation-required';
            } catch {
                state = 'reauthorisation-required';
            }
        }

        return {
            id: record.id,
            accountLogin: record.accountLogin,
            accountDisplayName: record.accountDisplayName,
            state,
            accessTargets: record.accessTargets.map((target) => ({
                id: target.id,
                login: target.login,
                type: target.type,
                availability: target.availability,
            })),
        };
    }

    /**
     * Creates a typed action failure with the latest safe summary.
     *
     * @param provider - Registered provider implementation.
     * @param reason - Stable renderer-safe failure reason.
     * @returns The typed failure result.
     */
    private async failure(
        provider: AppIntegrationProvider,
        reason: AppIntegrationActionFailureReason,
    ): Promise<AppIntegrationActionResult> {
        return {
            ok: false,
            reason,
            integration: await this.summarize(provider),
        };
    }
}

/**
 * Validates untrusted renderer options before final connection removal.
 *
 * @param value - Renderer-supplied Disconnect options.
 * @returns Whether the exact supported option shape was supplied.
 */
function isDisconnectOptions(
    value: unknown,
): value is AppIntegrationDisconnectOptions {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value).length === 1 &&
        'revokeAuthorisation' in value &&
        typeof value.revokeAuthorisation === 'boolean'
    );
}
