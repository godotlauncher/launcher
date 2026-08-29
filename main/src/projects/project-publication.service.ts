import { randomUUID } from 'node:crypto';
import type { OnModuleDestroy } from '@mariodebono/di';
import { Injectable } from '@mariodebono/di';
import type {
    CheckCreateProjectRepositoryNameAvailabilityResult,
    CreateProjectPublicationOptions,
    CreateProjectPublicationOutcome,
    CreateProjectPublicationTargetFailureReason,
    ListCreateProjectPublicationTargetsResult,
    ProjectDetails,
    ProjectPublicationFailureReason,
    PublishedGitHubRepository,
} from '@shared/contracts';
import type {
    RepositoryCreationFailureReason,
    RepositoryCreationRepository,
} from '../app-integrations/app-integration-capability.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import {
    type RepositoryCreationTarget,
    RepositoryHostingService,
} from '../app-integrations/repository-hosting.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitPushService } from '../tool-integration/integrations/git/git-push.service.js';
import type {
    GitPushFailureReason,
    GitPushResult,
} from '../tool-integration/integrations/git/git-push.types.js';

const PUBLICATION_ATTEMPT_EXPIRY_MS = 10 * 60 * 1_000;
const GITHUB_REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/u;

type PublicationAttempt = {
    id: string;
    expiresAt: number;
    project: ProjectDetails;
    options: CreateProjectPublicationOptions;
    ownerLogin: string | null;
    repository: RepositoryCreationRepository | null;
    outcome: Extract<
        CreateProjectPublicationOutcome,
        { status: 'failed' }
    > | null;
};

export type ProjectPublicationRetryResult = {
    projectDetails: ProjectDetails;
    publication: CreateProjectPublicationOutcome;
};

@Injectable()
export class ProjectPublicationService implements OnModuleDestroy {
    private readonly attempts = new Map<string, PublicationAttempt>();

    /**
     * Creates the project publication service.
     *
     * @param repositories - Provider-neutral repository hosting boundary.
     * @param gitPush - Guarded exact-root Git push service.
     */
    constructor(
        private readonly repositories: RepositoryHostingService,
        private readonly gitPush: GitPushService,
    ) {}

    /** Clears process-local retry state during shutdown. */
    onModuleDestroy(): void {
        this.attempts.clear();
    }

    /**
     * Lists current safe owner routes for Create Project.
     *
     * @param providerId - Registered repository provider ID.
     * @returns Renderer-safe targets or one stable connection failure.
     */
    async listTargets(
        providerId: string,
    ): Promise<ListCreateProjectPublicationTargetsResult> {
        const result =
            await this.repositories.listRepositoryCreationTargets(providerId);
        if (!result.ok) {
            return {
                success: false,
                reason: mapTargetFailure(result.reason),
                targets: [],
            };
        }
        return { success: true, targets: result.targets };
    }

    /**
     * Checks whether one selected owner visibly contains a repository name.
     *
     * @param options - Renderer-safe owner route and repository name.
     * @returns A cautious availability result for the Create Project form.
     */
    async checkRepositoryNameAvailability(
        options: CreateProjectPublicationOptions,
    ): Promise<CheckCreateProjectRepositoryNameAvailabilityResult> {
        const repositoryName = options.repositoryName.trim();
        if (!GITHUB_REPOSITORY_NAME_PATTERN.test(repositoryName)) {
            return { status: 'unknown', reason: 'invalid-repository-name' };
        }
        const result = await this.repositories.checkRepositoryNameAvailability(
            options.providerId,
            { ...options, repositoryName },
        );
        if (result.ok) {
            return { status: result.availability };
        }
        return {
            status: 'unknown',
            reason: mapAvailabilityFailure(result.reason),
        };
    }

    /**
     * Publishes one freshly persisted project and creates its retry attempt.
     *
     * @param project - Exact project returned by local creation.
     * @param options - Renderer-safe owner route and repository name.
     * @returns Published or recoverable partial-success outcome.
     */
    async publish(
        project: ProjectDetails,
        options: CreateProjectPublicationOptions,
    ): Promise<CreateProjectPublicationOutcome> {
        this.pruneExpiredAttempts();
        const attempt: PublicationAttempt = {
            id: randomUUID(),
            expiresAt: Date.now() + PUBLICATION_ATTEMPT_EXPIRY_MS,
            project,
            options: {
                ...options,
                repositoryName: options.repositoryName.trim(),
            },
            ownerLogin: null,
            repository: null,
            outcome: null,
        };
        this.attempts.set(attempt.id, attempt);
        return this.runAttempt(attempt);
    }

    /**
     * Retries one exact process-local project publication attempt.
     *
     * @param attemptId - Opaque attempt returned by the failed publication.
     * @param options - Optional edited route before remote creation is confirmed.
     * @returns The bound project and latest publication outcome.
     */
    async retry(
        attemptId: string,
        options?: CreateProjectPublicationOptions,
    ): Promise<ProjectPublicationRetryResult | null> {
        this.pruneExpiredAttempts();
        const attempt = this.attempts.get(attemptId);
        if (!attempt) {
            return null;
        }
        if (attempt.repository) {
            if (options && !samePublicationOptions(attempt.options, options)) {
                return {
                    projectDetails: attempt.project,
                    publication: createFailure(
                        attempt,
                        'verification',
                        'local-repository-changed',
                    ),
                };
            }
        } else if (options) {
            attempt.options = {
                ...options,
                repositoryName: options.repositoryName.trim(),
            };
            attempt.ownerLogin = null;
        }
        attempt.expiresAt = Date.now() + PUBLICATION_ATTEMPT_EXPIRY_MS;
        return {
            projectDetails: attempt.project,
            publication: await this.runAttempt(attempt),
        };
    }

    /**
     * Discards retry state without changing the local or remote repository.
     *
     * @param attemptId - Opaque attempt to forget.
     */
    discard(attemptId: string): void {
        this.attempts.delete(attemptId);
    }

    /**
     * Runs the missing remote creation or push stages for one attempt.
     *
     * @param attempt - Process-local attempt bound to one project.
     * @returns Latest publication outcome.
     */
    private async runAttempt(
        attempt: PublicationAttempt,
    ): Promise<CreateProjectPublicationOutcome> {
        if (
            attempt.outcome?.reason === 'remote-creation-uncertain' &&
            !attempt.repository
        ) {
            return attempt.outcome;
        }
        if (attempt.repository) {
            return this.pushConfirmedRepository(attempt);
        }
        if (!isPublicationOptionsValid(attempt.options)) {
            return createFailure(
                attempt,
                'remote-create',
                'invalid-repository-name',
            );
        }

        const targets = await this.repositories.listRepositoryCreationTargets(
            attempt.options.providerId,
        );
        if (!targets.ok) {
            return createFailure(
                attempt,
                'remote-create',
                mapCreationFailure(targets.reason),
            );
        }
        const target = findTarget(targets.targets, attempt.options);
        if (!target) {
            return createFailure(
                attempt,
                'remote-create',
                'target-unavailable',
            );
        }
        attempt.ownerLogin = target.ownerLogin;

        const result = await this.repositories.withRepositoryCreationAccess(
            attempt.options.providerId,
            attempt.options,
            async (creation) => {
                attempt.repository = creation.repository;
                const push = await this.gitPush.pushMain({
                    projectPath: attempt.project.path,
                    canonicalUrl: creation.repository.cloneUrl,
                    credential: creation.gitCredential,
                    signal: AbortSignal.timeout(30 * 60 * 1_000),
                });
                return this.toPushOutcome(attempt, push);
            },
        );
        if (!result.ok) {
            return createFailure(
                attempt,
                'remote-create',
                mapCreationFailure(result.reason),
            );
        }
        if (result.value.status === 'published') {
            this.attempts.delete(attempt.id);
        }
        return result.value;
    }

    /**
     * Pushes to a previously confirmed repository without recreating it.
     *
     * @param attempt - Attempt containing an immutable confirmed repository.
     * @returns Latest push outcome.
     */
    private async pushConfirmedRepository(
        attempt: PublicationAttempt,
    ): Promise<CreateProjectPublicationOutcome> {
        const repository = attempt.repository;
        if (!repository) {
            return createFailure(
                attempt,
                'verification',
                'local-repository-changed',
            );
        }
        const result = await this.repositories.withRepositoryPushAccess(
            attempt.options.providerId,
            attempt.options,
            async ({ credential }) =>
                this.gitPush.pushMain({
                    projectPath: attempt.project.path,
                    canonicalUrl: repository.cloneUrl,
                    credential,
                    signal: AbortSignal.timeout(30 * 60 * 1_000),
                }),
        );
        if (!result.ok) {
            return createFailure(
                attempt,
                'push',
                mapCreationFailure(result.reason),
            );
        }
        const outcome = this.toPushOutcome(attempt, result.value);
        if (outcome.status === 'published') {
            this.attempts.delete(attempt.id);
        }
        return outcome;
    }

    /**
     * Converts a guarded Git push result to the shared publication contract.
     *
     * @param attempt - Attempt containing the confirmed repository.
     * @param push - Guarded push result.
     * @returns Published or recoverable failure outcome.
     */
    private toPushOutcome(
        attempt: PublicationAttempt,
        push: GitPushResult,
    ): CreateProjectPublicationOutcome {
        if (push.ok && attempt.repository) {
            return {
                status: 'published',
                repository: toPublishedRepository(attempt.repository),
            };
        }
        const reason = push.ok
            ? 'remote-created-verification-failed'
            : mapPushFailure(push.reason);
        return createFailure(attempt, failureStageForPush(push), reason);
    }

    /** Removes attempts that have exceeded the first-release retry window. */
    private pruneExpiredAttempts(): void {
        const now = Date.now();
        for (const [id, attempt] of this.attempts) {
            if (attempt.expiresAt <= now) {
                this.attempts.delete(id);
            }
        }
    }
}

/**
 * Maps target-list failures to Create Project connection copy.
 *
 * @param reason - Provider-neutral repository creation failure.
 * @returns Renderer-safe target loading reason.
 */
function mapTargetFailure(
    reason: RepositoryCreationFailureReason,
): CreateProjectPublicationTargetFailureReason {
    if (reason === 'no-usable-connection') {
        return 'connection-required';
    }
    if (reason === 'permission-update-required') {
        return reason;
    }
    if (reason === 'secure-storage-unavailable') {
        return reason;
    }
    return 'provider-unavailable';
}

/**
 * Maps provider failures to the availability check's renderer-safe contract.
 *
 * @param reason - Provider-neutral repository access failure.
 * @returns The renderer-safe reason for an inconclusive name check.
 */
function mapAvailabilityFailure(
    reason: RepositoryCreationFailureReason,
): Extract<
    CheckCreateProjectRepositoryNameAvailabilityResult,
    { status: 'unknown' }
>['reason'] {
    if (reason === 'no-usable-connection') {
        return 'connection-required';
    }
    if (
        reason === 'permission-update-required' ||
        reason === 'secure-storage-unavailable' ||
        reason === 'target-unavailable' ||
        reason === 'invalid-repository-name' ||
        reason === 'rate-limited' ||
        reason === 'network-unavailable'
    ) {
        return reason;
    }
    return 'provider-unavailable';
}

/** Maps repository creation failures to the shared publication contract. */
function mapCreationFailure(
    reason: RepositoryCreationFailureReason,
): ProjectPublicationFailureReason {
    if (reason === 'no-usable-connection') {
        return 'connection-required';
    }
    if (reason === 'invalid-request') {
        return 'provider-unavailable';
    }
    return reason;
}

/** Maps one guarded Git failure after remote creation. */
function mapPushFailure(
    reason: GitPushFailureReason,
): ProjectPublicationFailureReason {
    if (reason === 'local-repository-changed') {
        return reason;
    }
    if (reason === 'network-unavailable') {
        return reason;
    }
    if (reason === 'authentication-failed') {
        return 'permission-update-required';
    }
    if (reason === 'origin-failed') {
        return 'remote-created-origin-failed';
    }
    if (reason === 'verification-failed') {
        return 'remote-created-verification-failed';
    }
    return 'remote-created-push-failed';
}

/** Selects the visible stage for one guarded Git result. */
function failureStageForPush(
    push: GitPushResult,
): Extract<CreateProjectPublicationOutcome, { status: 'failed' }>['stage'] {
    if (!push.ok && push.reason === 'origin-failed') {
        return 'origin';
    }
    if (!push.ok && push.reason === 'verification-failed') {
        return 'verification';
    }
    return 'push';
}

/** Builds and records one stable failure outcome. */
function createFailure(
    attempt: PublicationAttempt,
    stage: Extract<
        CreateProjectPublicationOutcome,
        { status: 'failed' }
    >['stage'],
    reason: ProjectPublicationFailureReason,
): Extract<CreateProjectPublicationOutcome, { status: 'failed' }> {
    const repository = attempt.repository
        ? toPublishedRepository(attempt.repository)
        : undefined;
    const intendedRepository = createIntendedRepository(attempt);
    const outcome = {
        status: 'failed' as const,
        attemptId: attempt.id,
        stage,
        reason,
        ...(repository ? { repository } : {}),
        ...(intendedRepository ? { intendedRepository } : {}),
        canRetry: reason !== 'remote-creation-uncertain',
        canEdit: attempt.repository === null,
    };
    attempt.outcome = outcome;
    return outcome;
}

/** Returns a safe intended GitHub URL for pre-creation recovery. */
function createIntendedRepository(
    attempt: PublicationAttempt,
): { owner: string; name: string; webUrl: string } | undefined {
    if (
        !attempt.ownerLogin ||
        !GITHUB_REPOSITORY_NAME_PATTERN.test(attempt.options.repositoryName)
    ) {
        return undefined;
    }
    const owner = attempt.ownerLogin;
    const name = attempt.options.repositoryName;
    return {
        owner,
        name,
        webUrl: `https://github.com/${owner}/${name}`,
    };
}

/** Converts a trusted internal repository to renderer-safe success data. */
function toPublishedRepository(
    repository: RepositoryCreationRepository,
): PublishedGitHubRepository {
    return {
        owner: repository.owner,
        name: repository.name,
        webUrl: repository.webUrl,
    };
}

/** Returns one exact route from a freshly refreshed target list. */
function findTarget(
    targets: readonly RepositoryCreationTarget[],
    options: CreateProjectPublicationOptions,
): RepositoryCreationTarget | undefined {
    return targets.find(
        (target) =>
            target.providerId === options.providerId &&
            target.connectionId === options.connectionId &&
            target.accessTargetId === options.accessTargetId,
    );
}

/** Checks untrusted publication option basics before remote mutation. */
function isPublicationOptionsValid(
    options: CreateProjectPublicationOptions,
): boolean {
    return (
        options.providerId.trim().length > 0 &&
        options.connectionId.trim().length > 0 &&
        options.accessTargetId.trim().length > 0 &&
        GITHUB_REPOSITORY_NAME_PATTERN.test(options.repositoryName)
    );
}

/** Compares an edited retry request with an immutable confirmed selection. */
function samePublicationOptions(
    left: CreateProjectPublicationOptions,
    right: CreateProjectPublicationOptions,
): boolean {
    return (
        left.providerId === right.providerId &&
        left.connectionId === right.connectionId &&
        left.accessTargetId === right.accessTargetId &&
        left.repositoryName === right.repositoryName.trim()
    );
}
