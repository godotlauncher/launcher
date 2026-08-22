import { randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OnModuleDestroy } from '@mariodebono/di';
import { Injectable } from '@mariodebono/di';
import type {
    CancelRemoteProjectImportResult,
    RemoteProjectImportFailureReason,
    RemoteProjectImportProgressStage,
    RemoteProjectImportRequest,
    RemoteProjectImportResult,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { RepositoryHostingService } from '../app-integrations/repository-hosting.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from '../tool-integration/integrations/git/git.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitCloneService } from '../tool-integration/integrations/git/git-clone.service.js';
import type { GitCloneResult } from '../tool-integration/integrations/git/git-clone.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { PublicGitSourceService } from '../tool-integration/integrations/git/public-git-source.service.js';
import { sanitiseProjectDirectoryName } from '../utils/projectDirectoryName.utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectRemoteImportProgressService } from './project-remote-import-progress.service.js';

type ActiveRemoteImport = {
    id: string;
    controller: AbortController;
    stage: RemoteProjectImportProgressStage;
};

type PreparedDestination = {
    finalPath: string;
    temporaryPath: string;
    supportPath: string;
};

class RemoteImportFailure extends Error {
    /**
     * Creates one safe clone transaction failure.
     *
     * @param reason - Renderer-safe failure classification.
     */
    constructor(readonly reason: RemoteProjectImportFailureReason) {
        super(`Remote project import failed: ${reason}`);
        this.name = 'RemoteImportFailure';
    }
}

@Injectable()
export class ProjectRemoteImportService implements OnModuleDestroy {
    private active: ActiveRemoteImport | null = null;

    /**
     * Creates the remote clone transaction service.
     *
     * @param git - Guarded short Git command service.
     * @param cloneService - Cancellable streaming Git clone service.
     * @param publicSources - Anonymous public source policy.
     * @param repositoryHosting - Connected repository selection boundary.
     * @param progress - Renderer progress publisher.
     */
    constructor(
        private readonly git: GitService,
        private readonly cloneService: GitCloneService,
        private readonly publicSources: PublicGitSourceService,
        private readonly repositoryHosting: RepositoryHostingService,
        private readonly progress: ProjectRemoteImportProgressService,
    ) {}

    /** Cancels an active clone during application shutdown. */
    onModuleDestroy(): void {
        this.active?.controller.abort('shutdown');
        this.active = null;
    }

    /**
     * Clones and validates one remote Godot project without registering it.
     *
     * @param request - Renderer-safe source and destination request.
     * @returns The completed clone path or a typed failure.
     */
    async importRemoteProject(
        request: RemoteProjectImportRequest,
    ): Promise<RemoteProjectImportResult> {
        if (this.active) {
            return { ok: false, jobId: null, reason: 'already-running' };
        }
        if (!isValidRequest(request)) {
            return { ok: false, jobId: null, reason: 'invalid-request' };
        }

        const job: ActiveRemoteImport = {
            id: randomUUID(),
            controller: new AbortController(),
            stage: 'preparing',
        };
        this.active = job;
        this.publish(job, 'preparing', false);
        let result: RemoteProjectImportResult;
        try {
            result = await this.run(job, request);
        } catch (error) {
            result = {
                ok: false,
                jobId: job.id,
                reason: job.controller.signal.aborted
                    ? 'cancelled'
                    : error instanceof RemoteImportFailure
                      ? error.reason
                      : 'clone-failed',
            };
        }
        this.publish(
            job,
            result.ok
                ? 'complete'
                : result.reason === 'cancelled'
                  ? 'cancelled'
                  : 'error',
            false,
            undefined,
            result,
        );
        if (this.active === job) {
            this.active = null;
        }
        return result;
    }

    /**
     * Cancels the active clone job when it is still cancellable.
     *
     * @param jobId - Exact process-local clone job ID.
     * @returns The cancellation state.
     */
    async cancelRemoteProjectImport(
        jobId: string,
    ): Promise<CancelRemoteProjectImportResult> {
        const job = this.active;
        if (!job || job.id !== jobId) {
            return { jobId, status: 'not-found' };
        }
        if (job.stage !== 'cloning' && job.stage !== 'cancelling') {
            return { jobId, status: 'not-cancellable' };
        }
        if (job.stage !== 'cancelling') {
            this.publish(job, 'cancelling', false);
            job.controller.abort('cancelled');
        }
        return { jobId, status: 'cancelling' };
    }

    /**
     * Runs one complete temporary-sibling clone transaction.
     *
     * @param job - Active clone job.
     * @param request - Validated renderer request.
     * @returns The clone transaction result.
     */
    private async run(
        job: ActiveRemoteImport,
        request: RemoteProjectImportRequest,
    ): Promise<RemoteProjectImportResult> {
        if (!(await this.git.exists())) {
            return { ok: false, jobId: job.id, reason: 'git-unavailable' };
        }
        this.publish(job, 'validating-destination', false);
        const destination = await this.prepareDestination(request);
        this.publish(job, 'validating-source', false);

        if (request.source === 'public-git-url') {
            const inspected = await this.publicSources.inspect(request.url);
            if (!inspected.ok) {
                return {
                    ok: false,
                    jobId: job.id,
                    reason: inspected.reason,
                };
            }
            return this.clonePreparedSource(job, destination, {
                source: 'public',
                canonicalUrl: inspected.source.canonicalUrl,
                approvedAddresses: inspected.source.approvedAddresses,
            });
        }

        const access = await this.repositoryHosting.withRepositoryCloneAccess(
            request.providerId,
            request.repositoryRef,
            (selection) =>
                this.clonePreparedSource(job, destination, {
                    source: 'connected',
                    canonicalUrl: selection.canonicalUrl,
                    credential: selection.credential,
                }),
        );
        return access.ok
            ? access.value
            : { ok: false, jobId: job.id, reason: access.reason };
    }

    /**
     * Validates and reserves attempt-owned sibling paths.
     *
     * @param request - Validated renderer source request.
     * @returns Canonical final, temporary and support paths.
     */
    private async prepareDestination(
        request: RemoteProjectImportRequest,
    ): Promise<PreparedDestination> {
        if (!isValidDirectoryName(request.directoryName)) {
            throw new RemoteImportFailure('destination-invalid');
        }
        let parentPath: string;
        try {
            parentPath = await fs.realpath(request.parentDirectory);
            if (!(await fs.stat(parentPath)).isDirectory()) {
                throw new Error('Parent is not a directory');
            }
        } catch {
            throw new RemoteImportFailure('destination-invalid');
        }
        const finalPath = path.resolve(parentPath, request.directoryName);
        if (
            path.dirname(finalPath) !== parentPath ||
            finalPath === path.parse(finalPath).root
        ) {
            throw new RemoteImportFailure('destination-invalid');
        }
        const entries = await fs.readdir(parentPath);
        if (
            entries.some(
                (entry) =>
                    entry.toLowerCase() === request.directoryName.toLowerCase(),
            )
        ) {
            throw new RemoteImportFailure('destination-conflict');
        }
        const inspection = await this.git.inspectRepository(finalPath);
        if (inspection.status === 'inside-work-tree') {
            throw new RemoteImportFailure('destination-invalid');
        }
        if (inspection.status === 'git-unavailable') {
            throw new RemoteImportFailure('git-unavailable');
        }
        if (inspection.status !== 'not-a-repository') {
            throw new RemoteImportFailure('destination-invalid');
        }

        const attemptId = randomUUID();
        const temporaryPath = path.join(
            parentPath,
            `.${request.directoryName}.clone-${attemptId}`,
        );
        const supportPath = path.join(
            parentPath,
            `.${request.directoryName}.support-${attemptId}`,
        );
        return { finalPath, temporaryPath, supportPath };
    }

    /**
     * Clones, validates and atomically finalises one prepared source.
     *
     * @param job - Active clone job.
     * @param destination - Attempt-owned destination paths.
     * @param source - Revalidated public or connected source.
     * @returns Final clone result.
     */
    private async clonePreparedSource(
        job: ActiveRemoteImport,
        destination: PreparedDestination,
        source:
            | {
                  source: 'public';
                  canonicalUrl: string;
                  approvedAddresses: string[];
              }
            | {
                  source: 'connected';
                  canonicalUrl: string;
                  credential: { username: string; password: string };
              },
    ): Promise<RemoteProjectImportResult> {
        try {
            await fs.mkdir(destination.supportPath, { mode: 0o700 });
            this.publish(job, 'cloning', true, 0);
            const cloneResult = await this.cloneService.clone({
                ...source,
                destinationPath: destination.temporaryPath,
                supportDirectory: destination.supportPath,
                signal: job.controller.signal,
                onProgress: (percent) =>
                    this.publish(job, 'cloning', true, percent),
            });
            if (!cloneResult.ok) {
                return this.cloneFailure(job.id, cloneResult);
            }
            if (job.controller.signal.aborted) {
                return { ok: false, jobId: job.id, reason: 'cancelled' };
            }
            this.publish(job, 'validating-project', false);
            const projectFilePath = path.join(
                destination.temporaryPath,
                'project.godot',
            );
            let projectFile: Stats;
            try {
                projectFile = await fs.lstat(projectFilePath);
            } catch {
                return {
                    ok: false,
                    jobId: job.id,
                    reason: 'not-godot-project',
                };
            }
            if (!projectFile.isFile() || projectFile.isSymbolicLink()) {
                return {
                    ok: false,
                    jobId: job.id,
                    reason: 'not-godot-project',
                };
            }
            this.publish(job, 'finalising', false);
            if (await pathExists(destination.finalPath)) {
                return {
                    ok: false,
                    jobId: job.id,
                    reason: 'destination-conflict',
                };
            }
            try {
                await fs.rename(
                    destination.temporaryPath,
                    destination.finalPath,
                );
            } catch {
                return {
                    ok: false,
                    jobId: job.id,
                    reason: 'finalise-failed',
                };
            }
            await fs
                .rm(destination.supportPath, { recursive: true, force: true })
                .catch(() => undefined);
            return {
                ok: true,
                jobId: job.id,
                projectPath: destination.finalPath,
                projectFilePath: path.join(
                    destination.finalPath,
                    'project.godot',
                ),
            };
        } finally {
            await this.cleanupIncomplete(destination);
        }
    }

    /** Converts a Git clone terminal state to a remote import failure. */
    private cloneFailure(
        jobId: string,
        result: Extract<GitCloneResult, { ok: false }>,
    ): RemoteProjectImportResult {
        return { ok: false, jobId, reason: result.reason };
    }

    /** Removes only attempt-owned incomplete clone and support paths. */
    private async cleanupIncomplete(
        destination: PreparedDestination,
    ): Promise<void> {
        await Promise.all([
            fs.rm(destination.temporaryPath, { recursive: true, force: true }),
            fs.rm(destination.supportPath, { recursive: true, force: true }),
        ]).catch(() => undefined);
    }

    /** Publishes and records one complete job progress snapshot. */
    private publish(
        job: ActiveRemoteImport,
        stage: RemoteProjectImportProgressStage,
        canCancel: boolean,
        percent?: number,
        result?: RemoteProjectImportResult,
    ): void {
        job.stage = stage;
        this.progress.publish({
            jobId: job.id,
            stage,
            canCancel,
            percent,
            result,
        });
    }
}

/**
 * Validates the renderer request discriminant and bounded fields.
 *
 * @param request - Untrusted renderer import request.
 * @returns Whether every request field is valid and bounded.
 */
function isValidRequest(request: RemoteProjectImportRequest): boolean {
    if (
        !request ||
        typeof request.parentDirectory !== 'string' ||
        typeof request.directoryName !== 'string'
    ) {
        return false;
    }
    return request.source === 'public-git-url'
        ? typeof request.url === 'string' && request.url.length <= 2_048
        : request.source === 'connected-repository' &&
              typeof request.providerId === 'string' &&
              request.providerId.length <= 128 &&
              typeof request.repositoryRef === 'string' &&
              request.repositoryRef.length <= 128;
}

/**
 * Validates a single sanitised child directory name.
 *
 * @param value - Requested destination directory name.
 * @returns Whether the value is one safe child name.
 */
function isValidDirectoryName(value: string): boolean {
    return (
        value.length > 0 &&
        value.length <= 255 &&
        value !== '.' &&
        value !== '..' &&
        path.basename(value) === value &&
        !value.includes('/') &&
        !value.includes('\\') &&
        sanitiseProjectDirectoryName(value) === value
    );
}

/**
 * Returns whether a path currently exists without following it.
 *
 * @param value - Exact path to inspect.
 * @returns Whether the path exists or cannot be safely classified as absent.
 */
async function pathExists(value: string): Promise<boolean> {
    try {
        await fs.lstat(value);
        return true;
    } catch (error) {
        return !(
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
        );
    }
}
