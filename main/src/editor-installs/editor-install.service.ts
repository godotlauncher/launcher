import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    AssetSummary,
    CancelEditorInstallResult,
    EditorCatalogRelease,
    EditorInstallOrigin,
    InstalledRelease,
    InstallReleaseResult,
    ReleaseInstallProgress,
    ReleaseInstallProgressStage,
    ReleaseSummary,
} from '@shared/contracts';
import logger from 'electron-log';
import { getUserPreferences } from '../commands/userPreferences.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorCatalogService } from '../editor-catalog/editor-catalog.service.js';
import { t } from '../i18n/index.js';
import {
    isSafePathSegment,
    resolveArchiveIntegrity,
} from '../utils/archive-integrity.util.js';
import { extractEditorArchive } from '../utils/editor-archive-extraction.adapter.js';
import {
    EditorInstallValidationError,
    validateExtractedEditor,
} from '../utils/editor-install-containment.util.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
} from '../utils/godot.utils.js';
import { getReleaseBaseVersion } from '../utils/projectLauncherConfig.utils.js';
import {
    downloadReleaseAsset,
    getPlatformAsset,
} from '../utils/releases.utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorInstallProgressService } from './editor-install-progress.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorProjectRepairAdapter } from './editor-project-repair.adapter.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { InstalledEditorService } from './installed-editor.service.js';
import {
    getInstalledEditorIdentity,
    hasSameInstalledEditorIdentity,
} from './installed-editor.store.js';

const DOWNLOAD_IDLE_TIMEOUT_MS = 120_000;
const DOWNLOAD_PROGRESS_INTERVAL_MS = 200;

type InstallJob = {
    id: string;
    identity: string;
    release: ReleaseSummary;
    mono: boolean;
    origins: Set<EditorInstallOrigin>;
    controller: AbortController;
    promise: Promise<InstallReleaseResult>;
    resolve: (result: InstallReleaseResult) => void;
    progress: ReleaseInstallProgress;
};

class EditorInstallCancelledError extends Error {
    constructor() {
        super('Editor installation cancelled');
        this.name = 'EditorInstallCancelledError';
    }
}

/** Owns official editor install, reinstall, queue, and cancellation workflows. */
@Injectable()
export class EditorInstallService {
    private nextJobId = 0;
    private activeJob: InstallJob | null = null;
    private readonly queue: InstallJob[] = [];
    private readonly jobsByIdentity = new Map<string, InstallJob>();
    private readonly jobsById = new Map<string, InstallJob>();

    /**
     * Creates the editor install service.
     *
     * @param installedEditors - Installed-editor persistence and validation.
     * @param editorCatalog - Official editor catalogue source.
     * @param projectRepair - Temporary project repair boundary.
     * @param progressService - Non-fatal progress publisher.
     */
    constructor(
        private readonly installedEditors: InstalledEditorService,
        private readonly editorCatalog: EditorCatalogService,
        private readonly projectRepair: EditorProjectRepairAdapter,
        private readonly progressService: EditorInstallProgressService,
    ) {}

    /**
     * Queues an official editor installation.
     *
     * @param release - Official release metadata.
     * @param mono - Whether to install the .NET flavour.
     * @param origin - Workflow requesting the install.
     * @returns The shared result for this editor identity.
     */
    async installEditor(
        release: ReleaseSummary,
        mono: boolean,
        origin: EditorInstallOrigin,
    ): Promise<InstallReleaseResult> {
        const identity = getInstalledEditorIdentity({
            version: release.version,
            mono,
        });
        const existing = this.jobsByIdentity.get(identity);
        if (existing) {
            if (existing.progress.stage === 'cancelling') {
                await existing.promise;
                return this.installEditor(release, mono, origin);
            }

            const hadProjectOrigin = existing.origins.has('project');
            existing.origins.add(origin);
            if (!hadProjectOrigin && origin === 'project') {
                this.republish(existing);
            }
            return existing.promise;
        }

        let resolveJob: (result: InstallReleaseResult) => void = () =>
            undefined;
        const promise = new Promise<InstallReleaseResult>((resolve) => {
            resolveJob = resolve;
        });
        const id = `editor-install-${++this.nextJobId}`;
        const job: InstallJob = {
            id,
            identity,
            release,
            mono,
            origins: new Set([origin]),
            controller: new AbortController(),
            promise,
            resolve: resolveJob,
            progress: this.createProgress(
                id,
                release,
                mono,
                'queued',
                origin === 'installs',
                { percent: 0 },
            ),
        };

        this.jobsByIdentity.set(identity, job);
        this.jobsById.set(id, job);
        this.queue.push(job);
        this.publishQueuedProgress();
        this.startNextJob();
        return promise;
    }

    /**
     * Cancels one queued or active user-origin install.
     *
     * @param jobId - Exact process-local install job ID.
     * @returns The cancellation state.
     */
    async cancelInstall(jobId: string): Promise<CancelEditorInstallResult> {
        const job = this.jobsById.get(jobId);
        if (!job) {
            return { jobId, status: 'not-found' };
        }
        if (job.progress.stage === 'cancelling') {
            return { jobId, status: 'cancelling' };
        }
        if (!this.canCancel(job, job.progress.stage)) {
            return { jobId, status: 'not-cancellable' };
        }

        const queuedIndex = this.queue.indexOf(job);
        if (queuedIndex >= 0) {
            this.queue.splice(queuedIndex, 1);
            this.removeJob(job);
            this.publish(job, 'cancelled');
            job.resolve(this.cancelledResult(job));
            this.publishQueuedProgress();
            return { jobId, status: 'cancelled' };
        }

        this.publish(job, 'cancelling');
        job.controller.abort(new EditorInstallCancelledError());
        return { jobId, status: 'cancelling' };
    }

    /**
     * Reinstalls one official or custom editor.
     *
     * @param release - Registered editor to recover.
     * @returns The recovered editor or a typed failure.
     */
    async reinstallEditor(
        release: InstalledRelease,
    ): Promise<InstallReleaseResult> {
        try {
            logger.info(`Reinstalling release '${release.version}'`);
            const checked =
                await this.installedEditors.revalidateInstalledEditors();

            if (release.source === 'custom') {
                const refreshed = checked.find((candidate) =>
                    hasSameInstalledEditorIdentity(candidate, release),
                );
                if (!refreshed?.valid) {
                    return {
                        success: false,
                        version: release.version,
                        error: `Custom engine "${release.version}" is unavailable. Confirm the manifest and editor paths are accessible, then retry.`,
                    };
                }
                await this.projectRepair.repairAfterReinstall(
                    release,
                    refreshed,
                );
                return {
                    success: true,
                    version: refreshed.version,
                    release: refreshed,
                };
            }

            const validReplacement = checked.find(
                (candidate) =>
                    hasSameInstalledEditorIdentity(candidate, release) &&
                    candidate.valid !== false,
            );
            if (validReplacement) {
                await this.projectRepair.repairAfterReinstall(
                    release,
                    validReplacement,
                );
                return {
                    success: true,
                    version: validReplacement.version,
                    release: validReplacement,
                };
            }

            const summary = await this.getReleaseSummary(release);
            if (!summary) {
                return {
                    success: false,
                    version: release.version,
                    error: `Release metadata not found for ${release.version}`,
                };
            }

            const result = await this.installEditor(
                summary,
                release.mono,
                'installs',
            );
            if (!result.success || !result.release) {
                return result;
            }
            await this.projectRepair.repairAfterReinstall(
                release,
                result.release,
            );
            return result;
        } catch (error) {
            logger.error(
                `Failed to reinstall release '${release.version}'`,
                error,
            );
            return {
                success: false,
                version: release.version,
                error: (error as Error).message,
            };
        }
    }

    /** Starts the next queued job when the worker is idle. */
    private startNextJob(): void {
        if (this.activeJob) {
            return;
        }
        const job = this.queue.shift();
        if (!job) {
            return;
        }

        this.activeJob = job;
        this.publishQueuedProgress();
        void this.runJob(job).then((result) => {
            this.removeJob(job);
            this.activeJob = null;
            job.resolve(result);
            this.startNextJob();
        });
    }

    /** Runs one job and publishes its terminal state. */
    private async runJob(job: InstallJob): Promise<InstallReleaseResult> {
        let result: InstallReleaseResult;
        try {
            result = await this.installEditorInternal(job);
        } catch (error) {
            logger.error(
                `Unhandled install failure for '${job.release.version}'`,
                error,
            );
            result = {
                success: false,
                error: (error as Error).message,
                version: job.release.version,
            };
        }

        if (result.cancelled) {
            this.publish(job, 'cancelled');
        } else if (result.success) {
            this.publish(job, 'complete', {
                percent: 100,
                release: result.release,
            });
        } else {
            this.publish(job, 'error', { error: result.error });
        }
        return result;
    }

    /** Performs one official install while preserving current path behavior. */
    private async installEditorInternal(
        job: InstallJob,
    ): Promise<InstallReleaseResult> {
        const { release, mono } = job;
        let rootReleasePath: string | undefined;
        let downloadPath: string | undefined;
        let rootTouched = false;

        try {
            this.publish(job, 'preparing', { percent: 0 });
            if (!isSafePathSegment(release.version)) {
                throw new Error(t('installEditor:errors.unsafeArchive'));
            }

            const { install_location: installLocation } =
                await getUserPreferences();
            rootReleasePath = path.resolve(
                installLocation,
                `${release.version}${mono ? '-mono' : ''}`,
            );
            downloadPath = path.resolve(
                installLocation,
                'tmp',
                `${release.version}${mono ? '-mono' : ''}`,
            );
            const asset = getPlatformAsset(
                os.platform(),
                os.arch(),
                release.assets,
            )?.find((candidate) => candidate.mono === mono);
            if (!asset) {
                return {
                    success: false,
                    error: t('installEditor:errors.noPlatformAsset'),
                    version: release.version,
                };
            }

            const integrity = await resolveArchiveIntegrity(asset, {
                expectedReleaseTag: release.tag ?? release.version,
                timeoutMs: DOWNLOAD_IDLE_TIMEOUT_MS,
                signal: job.controller.signal,
            });
            this.throwIfCancelled(job);

            await fs.promises.rm(downloadPath, {
                recursive: true,
                force: true,
            });
            await fs.promises.mkdir(downloadPath, { recursive: true });
            this.throwIfCancelled(job);

            const archivePath = path.resolve(downloadPath, asset.name);
            this.publish(job, 'downloading', {
                percent: 0,
                receivedBytes: 0,
            });
            let lastDownloadProgressAt = Date.now();
            await downloadReleaseAsset(asset, archivePath, {
                integrity,
                idleTimeoutMs: DOWNLOAD_IDLE_TIMEOUT_MS,
                signal: job.controller.signal,
                onProgress: ({ receivedBytes, totalBytes }) => {
                    if (job.progress.stage === 'cancelling') {
                        return;
                    }
                    const now = Date.now();
                    if (
                        now - lastDownloadProgressAt <
                        DOWNLOAD_PROGRESS_INTERVAL_MS
                    ) {
                        return;
                    }
                    lastDownloadProgressAt = now;
                    this.publish(job, 'downloading', {
                        percent: totalBytes
                            ? Math.min(
                                  99,
                                  Math.round(
                                      (receivedBytes / totalBytes) * 100,
                                  ),
                              )
                            : undefined,
                        receivedBytes,
                        totalBytes,
                    });
                },
            });
            this.throwIfCancelled(job);

            this.publish(job, 'extracting');
            rootTouched = true;
            await fs.promises.rm(rootReleasePath, {
                recursive: true,
                force: true,
            });
            await fs.promises.mkdir(rootReleasePath, { recursive: true });

            const extracted = await this.extractAndValidate(
                job,
                asset,
                path.resolve(downloadPath, asset.name),
                rootReleasePath,
            );
            this.publish(job, 'extracting', { percent: 100 });

            const config = getProjectDefinition(
                release.version_number,
                DEFAULT_PROJECT_DEFINITION,
            );
            if (!config) {
                throw new Error(t('installEditor:errors.invalidEditorVersion'));
            }

            const installedRelease: InstalledRelease = {
                version: release.version,
                base_version: getReleaseBaseVersion({
                    version: release.version,
                    version_number: release.version_number,
                }),
                flavor: mono ? 'dotnet' : 'gdscript',
                version_number: release.version_number,
                install_path: extracted.releasePath,
                editor_path: extracted.editorPath,
                platform: os.platform(),
                arch: os.arch(),
                mono,
                config_version: config.configVersion,
                prerelease: release.prerelease,
                published_at: release.published_at,
                valid: true,
            };

            this.publish(job, 'registering', { percent: 95 });
            await this.installedEditors.addInstalledEditor(installedRelease);
            await fs.promises.rm(downloadPath, {
                recursive: true,
                force: true,
            });
            this.publish(job, 'validating', { percent: 98 });
            await this.projectRepair.revalidateProjects();
            return {
                success: true,
                release: installedRelease,
                version: release.version,
            };
        } catch (error) {
            const cancelled = job.controller.signal.aborted;
            if (!cancelled) {
                logger.error('ERROR:', error);
            }
            try {
                if (rootTouched && rootReleasePath) {
                    await fs.promises.rm(rootReleasePath, {
                        recursive: true,
                        force: true,
                    });
                }
                if (downloadPath) {
                    await fs.promises.rm(downloadPath, {
                        recursive: true,
                        force: true,
                    });
                }
            } catch (cleanupError) {
                logger.log('Error cleaning up failed install', cleanupError);
            }

            return cancelled
                ? this.cancelledResult(job)
                : {
                      success: false,
                      error: (error as Error).message,
                      version: release.version,
                  };
        }
    }

    /** Extracts one archive and resolves its platform-specific editor paths. */
    private async extractAndValidate(
        job: InstallJob,
        asset: AssetSummary,
        archivePath: string,
        rootReleasePath: string,
    ): Promise<{ editorPath: string; releasePath: string }> {
        if (path.extname(asset.name) !== '.zip') {
            throw new Error(t('installEditor:errors.unsupportedFileExtension'));
        }
        await extractEditorArchive(archivePath, rootReleasePath);

        let releasePath = rootReleasePath;
        let editorPath: string;
        if (os.platform() === 'win32') {
            if (job.mono) {
                releasePath = path.resolve(
                    rootReleasePath,
                    asset.name.replace('.zip', ''),
                );
                editorPath = path.resolve(
                    releasePath,
                    asset.name.replace('.zip', '.exe'),
                );
            } else {
                editorPath = path.resolve(
                    rootReleasePath,
                    asset.name.replace('.zip', ''),
                );
            }
        } else if (os.platform() === 'darwin') {
            editorPath = path.resolve(
                rootReleasePath,
                job.mono ? 'Godot_mono.app' : 'Godot.app',
            );
        } else if (os.platform() === 'linux') {
            if (job.mono) {
                const extension =
                    os.arch() === 'x64'
                        ? 'x86_64'
                        : os.arch() === 'arm'
                          ? 'arm32'
                          : os.arch() === 'arm64'
                            ? 'arm64'
                            : 'x86_32';
                releasePath = path.resolve(
                    rootReleasePath,
                    asset.name.replace('.zip', ''),
                );
                editorPath = path.resolve(
                    releasePath,
                    asset.name.replace(`_${extension}.zip`, `.${extension}`),
                );
            } else {
                editorPath = path.resolve(
                    rootReleasePath,
                    asset.name.replace('.zip', ''),
                );
            }
        } else {
            throw new Error(t('installEditor:errors.unsupportedPlatform'));
        }

        try {
            await validateExtractedEditor(
                rootReleasePath,
                editorPath,
                os.platform(),
            );
        } catch (error) {
            if (
                error instanceof EditorInstallValidationError &&
                error.reason === 'outside-install-root'
            ) {
                throw new Error(t('installEditor:errors.unsafeArchive'), {
                    cause: error,
                });
            }
            throw new Error(t('installEditor:errors.invalidExtractedEditor'), {
                cause: error,
            });
        }
        return { editorPath, releasePath };
    }

    /** Resolves one registered official editor through the current catalogue. */
    private async getReleaseSummary(
        release: InstalledRelease,
    ): Promise<ReleaseSummary | undefined> {
        const catalogue = await this.editorCatalog.getCatalog();
        const match = catalogue.releases.find(
            (candidate) =>
                candidate.version === release.version &&
                candidate.prerelease === release.prerelease,
        );
        return match ? this.mapCatalogueRelease(match) : undefined;
    }

    /** Converts catalogue metadata to the existing install request shape. */
    private mapCatalogueRelease(release: EditorCatalogRelease): ReleaseSummary {
        return {
            tag: release.tag,
            version: release.version,
            version_number: Number.parseFloat(release.baseVersion),
            name: release.name,
            published_at: release.publishedAt,
            draft: false,
            prerelease: release.prerelease,
            assets: release.variants.flatMap((variant) =>
                variant.assets.map((asset) => ({
                    name: asset.name,
                    download_url: asset.downloadUrl,
                    digest: asset.digest,
                    checksum_manifest_url: asset.checksumManifestUrl,
                    platform_tags: [asset.platform, asset.architecture],
                    mono: variant.flavor === 'dotnet',
                })),
            ),
        };
    }

    /** Publishes updated queue positions. */
    private publishQueuedProgress(): void {
        this.queue.forEach((job, index) => {
            this.publish(job, 'queued', {
                percent: 0,
                queuePosition: index + 1,
            });
        });
    }

    /** Publishes one job progress state and stores it for deduplicated callers. */
    private publish(
        job: InstallJob,
        stage: ReleaseInstallProgressStage,
        progress: Partial<
            Omit<
                ReleaseInstallProgress,
                | 'id'
                | 'version'
                | 'mono'
                | 'prerelease'
                | 'published_at'
                | 'stage'
                | 'canCancel'
            >
        > = {},
    ): void {
        job.progress = this.createProgress(
            job.id,
            job.release,
            job.mono,
            stage,
            this.canCancel(job, stage),
            progress,
        );
        this.progressService.publish(job.progress);
    }

    /** Republishes a job when its origin changes cancellability. */
    private republish(job: InstallJob): void {
        job.progress = {
            ...job.progress,
            canCancel: this.canCancel(job, job.progress.stage),
        };
        this.progressService.publish(job.progress);
    }

    /** Creates one complete progress event. */
    private createProgress(
        id: string,
        release: ReleaseSummary,
        mono: boolean,
        stage: ReleaseInstallProgressStage,
        canCancel: boolean,
        progress: Partial<ReleaseInstallProgress>,
    ): ReleaseInstallProgress {
        return {
            id,
            version: release.version,
            mono,
            prerelease: release.prerelease,
            published_at: release.published_at,
            ...progress,
            stage,
            canCancel,
        };
    }

    /** Checks whether one job can still be cancelled. */
    private canCancel(
        job: InstallJob,
        stage: ReleaseInstallProgressStage,
    ): boolean {
        return (
            !job.origins.has('project') &&
            !job.controller.signal.aborted &&
            (stage === 'queued' ||
                stage === 'preparing' ||
                stage === 'downloading')
        );
    }

    /** Throws the job cancellation reason at cancellable checkpoints. */
    private throwIfCancelled(job: InstallJob): void {
        if (job.controller.signal.aborted) {
            throw (
                job.controller.signal.reason ??
                new EditorInstallCancelledError()
            );
        }
    }

    /** Creates the non-error result returned to cancelled callers. */
    private cancelledResult(job: InstallJob): InstallReleaseResult {
        return {
            success: false,
            cancelled: true,
            version: job.release.version,
        };
    }

    /** Removes one job from both lookup indexes. */
    private removeJob(job: InstallJob): void {
        if (this.jobsByIdentity.get(job.identity) === job) {
            this.jobsByIdentity.delete(job.identity);
        }
        this.jobsById.delete(job.id);
    }
}
