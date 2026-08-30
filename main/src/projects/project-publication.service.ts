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
    ProjectPublicationRecoveryAction,
    PublishedGitHubRepository,
} from '@shared/contracts';
import logger from 'electron-log';
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

const GITHUB_REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/u;

type PublicationAttempt = {
    id: string;
    project: ProjectDetails;
    requiresGitLfsUpload: boolean;
    options: CreateProjectPublicationOptions;
    ownerLogin: string | null;
    repository: RepositoryCreationRepository | null;
    recoveredRepository: RepositoryCreationRepository | null;
    requiresEmptyRemote: boolean;
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
     * @param requiresGitLfsUpload - Whether creation configured Git LFS successfully.
     * @returns Published or recoverable partial-success outcome.
     */
    async publish(
        project: ProjectDetails,
        options: CreateProjectPublicationOptions,
        requiresGitLfsUpload: boolean,
    ): Promise<CreateProjectPublicationOutcome> {
        const attempt: PublicationAttempt = {
            id: randomUUID(),
            project,
            requiresGitLfsUpload,
            options: {
                ...options,
                repositoryName: options.repositoryName.trim(),
            },
            ownerLogin: null,
            repository: null,
            recoveredRepository: null,
            requiresEmptyRemote: false,
            outcome: null,
        };
        this.attempts.set(attempt.id, attempt);
        logPublicationEvent(attempt, 'attempt-started');
        return this.runAttempt(attempt);
    }

    /**
     * Retries one exact process-local project publication attempt.
     *
     * @param attemptId - Opaque attempt returned by the failed publication.
     * @param options - Optional edited route before remote creation is confirmed.
     * @param recoveryAction - Exact uncertain-recovery action shown by main.
     * @returns The bound project and latest publication outcome.
     */
    async retry(
        attemptId: string,
        options?: CreateProjectPublicationOptions,
        recoveryAction?: ProjectPublicationRecoveryAction,
    ): Promise<ProjectPublicationRetryResult | null> {
        const attempt = this.attempts.get(attemptId);
        if (!attempt) {
            return null;
        }
        const expectedRecoveryAction = attempt.outcome?.recoveryAction;
        if (expectedRecoveryAction && attempt.outcome) {
            if (options || recoveryAction !== expectedRecoveryAction) {
                return {
                    projectDetails: attempt.project,
                    publication: attempt.outcome,
                };
            }
            const publication =
                recoveryAction === 'confirm-recovered-repository'
                    ? await this.confirmRecoveredRepository(attempt)
                    : await this.recoverUncertainCreation(attempt);
            return { projectDetails: attempt.project, publication };
        }
        if (attempt.outcome && !attempt.outcome.canRetry) {
            return {
                projectDetails: attempt.project,
                publication: attempt.outcome,
            };
        }
        if (recoveryAction) {
            return {
                projectDetails: attempt.project,
                publication: createFailure(
                    attempt,
                    'verification',
                    'local-repository-changed',
                ),
            };
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
                    requiresGitLfsUpload: attempt.requiresGitLfsUpload,
                    requiresEmptyRemote: attempt.requiresEmptyRemote,
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
     * Reconciles one ambiguous creation before making another mutation.
     *
     * @param attempt - Exact process-local attempt with an uncertain outcome.
     * @returns A retry, confirmation prompt, or unchanged safe failure.
     */
    private async recoverUncertainCreation(
        attempt: PublicationAttempt,
    ): Promise<CreateProjectPublicationOutcome> {
        logPublicationEvent(attempt, 'recovery-check-started');
        const result = await this.repositories.recoverRepositoryCreation(
            attempt.options.providerId,
            attempt.options,
        );
        if (!result.ok) {
            logPublicationEvent(attempt, 'recovery-check-failed', {
                reason: mapCreationFailure(result.reason),
            });
            return createFailure(
                attempt,
                'remote-create',
                'remote-creation-uncertain',
            );
        }
        if (result.recovery.status === 'absent') {
            logPublicationEvent(attempt, 'recovery-repository-absent');
            attempt.recoveredRepository = null;
            attempt.outcome = null;
            return this.runAttempt(attempt);
        }

        const recoveredRepository = result.recovery.repository;
        attempt.recoveredRepository = recoveredRepository;
        const remoteCheck = await this.repositories.withRepositoryPushAccess(
            attempt.options.providerId,
            attempt.options,
            ({ credential }) =>
                this.gitPush.checkRemoteEmpty({
                    canonicalUrl: recoveredRepository.cloneUrl,
                    credential,
                    signal: AbortSignal.timeout(30 * 60 * 1_000),
                }),
        );
        if (!remoteCheck.ok) {
            logPublicationEvent(attempt, 'recovery-empty-check-failed', {
                reason: mapCreationFailure(remoteCheck.reason),
            });
            return createFailure(
                attempt,
                'remote-create',
                'remote-creation-uncertain',
            );
        }
        if (!remoteCheck.value.ok) {
            logPublicationEvent(attempt, 'recovery-empty-check-failed', {
                reason: mapPushFailure(remoteCheck.value.reason),
            });
            return createFailure(
                attempt,
                'remote-create',
                'remote-creation-uncertain',
            );
        }
        if (!remoteCheck.value.empty) {
            logPublicationEvent(attempt, 'recovery-repository-not-empty');
            return createFailure(
                attempt,
                'remote-create',
                'recovered-repository-not-empty',
            );
        }
        logPublicationEvent(attempt, 'recovery-confirmation-required');
        return createFailure(
            attempt,
            'remote-create',
            'remote-creation-uncertain',
            'confirm-recovered-repository',
        );
    }

    /**
     * Revalidates and accepts one exact empty recovered repository.
     *
     * @param attempt - Exact process-local attempt awaiting confirmation.
     * @returns The guarded publication outcome.
     */
    private async confirmRecoveredRepository(
        attempt: PublicationAttempt,
    ): Promise<CreateProjectPublicationOutcome> {
        const expected = attempt.recoveredRepository;
        if (!expected) {
            return createFailure(
                attempt,
                'remote-create',
                'remote-creation-uncertain',
            );
        }
        logPublicationEvent(attempt, 'recovery-confirmation-started');
        const result = await this.repositories.recoverRepositoryCreation(
            attempt.options.providerId,
            attempt.options,
        );
        if (
            !result.ok ||
            result.recovery.status !== 'present' ||
            !sameRepository(expected, result.recovery.repository)
        ) {
            if (result.ok && result.recovery.status === 'absent') {
                attempt.recoveredRepository = null;
            }
            logPublicationEvent(attempt, 'recovery-confirmation-rejected');
            return createFailure(
                attempt,
                'remote-create',
                'remote-creation-uncertain',
            );
        }
        attempt.repository = result.recovery.repository;
        attempt.recoveredRepository = null;
        attempt.requiresEmptyRemote = true;
        logPublicationEvent(attempt, 'recovery-repository-confirmed');
        return this.pushConfirmedRepository(attempt);
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
                    requiresGitLfsUpload: attempt.requiresGitLfsUpload,
                    requiresEmptyRemote: attempt.requiresEmptyRemote,
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
            logPublicationEvent(attempt, 'published');
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
    if (reason === 'remote-not-empty') {
        return 'recovered-repository-not-empty';
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
    recoveryAction?: ProjectPublicationRecoveryAction,
): Extract<CreateProjectPublicationOutcome, { status: 'failed' }> {
    const visibleRepository = attempt.repository ?? attempt.recoveredRepository;
    const repository = visibleRepository
        ? toPublishedRepository(visibleRepository)
        : undefined;
    const intendedRepository = createIntendedRepository(attempt);
    const resolvedRecoveryAction =
        recoveryAction ??
        (reason === 'remote-creation-uncertain'
            ? 'check-and-retry'
            : undefined);
    const outcome = {
        status: 'failed' as const,
        attemptId: attempt.id,
        stage,
        reason,
        ...(repository ? { repository } : {}),
        ...(intendedRepository ? { intendedRepository } : {}),
        ...(resolvedRecoveryAction
            ? { recoveryAction: resolvedRecoveryAction }
            : {}),
        canRetry:
            resolvedRecoveryAction !== undefined ||
            reason !== 'recovered-repository-not-empty',
        canEdit:
            attempt.repository === null &&
            attempt.recoveredRepository === null &&
            reason !== 'remote-creation-uncertain',
    };
    attempt.outcome = outcome;
    logPublicationEvent(attempt, 'failed', {
        stage,
        reason,
        hasRepository: repository !== undefined,
    });
    return outcome;
}

/** Returns whether two trusted repository identities describe the same remote. */
function sameRepository(
    left: RepositoryCreationRepository,
    right: RepositoryCreationRepository,
): boolean {
    return (
        left.id === right.id &&
        left.owner.toLowerCase() === right.owner.toLowerCase() &&
        left.name === right.name &&
        left.cloneUrl === right.cloneUrl &&
        left.webUrl === right.webUrl
    );
}

/**
 * Writes one credential-safe publication diagnostic event.
 *
 * @param attempt - Process-local attempt used only for safe correlation data.
 * @param event - Stable diagnostic event name.
 * @param details - Optional stable categories without user or provider content.
 */
function logPublicationEvent(
    attempt: PublicationAttempt,
    event: string,
    details: Readonly<Record<string, boolean | string>> = {},
): void {
    logger.info('Project publication', {
        attemptId: attempt.id,
        event,
        requiresGitLfsUpload: attempt.requiresGitLfsUpload,
        ...details,
    });
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
