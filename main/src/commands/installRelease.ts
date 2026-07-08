import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
    InstalledRelease,
    InstallReleaseResult,
    ReleaseInstallProgress,
    ReleaseInstallProgressStage,
    ReleaseSummary,
} from '@shared';
import logger from 'electron-log';
import { checkAndUpdateProjects } from '../checks.js';
import { t } from '../i18n/index.js';
import { extractZipArchive } from '../utils/extractZip.utils.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
} from '../utils/godot.utils.js';
import { getReleaseBaseVersion } from '../utils/projectLauncherConfig.utils.js';
import {
    addStoredInstalledRelease,
    downloadReleaseAsset,
    getInstalledReleaseIdentity,
    getPlatformAsset,
} from '../utils/releases.utils.js';
import { ipcSendToMainWindowSync } from '../utils.js';
import { getUserPreferences } from './userPreferences.js';

const DOWNLOAD_IDLE_TIMEOUT_MS = 120_000;

type InstallJob = {
    id: string;
    identity: string;
    release: ReleaseSummary;
    mono: boolean;
    promise: Promise<InstallReleaseResult>;
    resolve: (result: InstallReleaseResult) => void;
};

let nextInstallJobId = 0;
let activeInstallJob: InstallJob | null = null;
const installQueue: InstallJob[] = [];
const installJobs = new Map<string, InstallJob>();

export async function installRelease(
    release: ReleaseSummary,
    mono: boolean,
): Promise<InstallReleaseResult> {
    const identity = getInstalledReleaseIdentity({
        version: release.version,
        mono,
    });
    const existingJob = installJobs.get(identity);
    if (existingJob) {
        return existingJob.promise;
    }

    let resolveJob: (result: InstallReleaseResult) => void = () => undefined;
    const promise = new Promise<InstallReleaseResult>((resolve) => {
        resolveJob = resolve;
    });
    const job: InstallJob = {
        id: `${identity}:${++nextInstallJobId}`,
        identity,
        release,
        mono,
        promise,
        resolve: resolveJob,
    };

    installJobs.set(identity, job);
    installQueue.push(job);
    publishQueuedInstallProgress();
    startNextInstallJob();

    return promise;
}

function startNextInstallJob(): void {
    if (activeInstallJob) {
        return;
    }

    const nextJob = installQueue.shift();
    if (!nextJob) {
        return;
    }

    activeInstallJob = nextJob;
    publishQueuedInstallProgress();

    void runInstallJob(nextJob).finally(() => {
        installJobs.delete(nextJob.identity);
        activeInstallJob = null;
        startNextInstallJob();
    });
}

async function runInstallJob(job: InstallJob): Promise<void> {
    let result: InstallReleaseResult;

    try {
        result = await installReleaseInternal(job);
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

    if (result.success) {
        publishInstallProgress(job, 'complete', {
            percent: 100,
            release: result.release,
        });
    } else {
        publishInstallProgress(job, 'error', {
            error: result.error,
        });
    }

    job.resolve(result);
}

function publishQueuedInstallProgress(): void {
    installQueue.forEach((job, index) => {
        publishInstallProgress(job, 'queued', {
            percent: 0,
            queuePosition: index + 1,
        });
    });
}

function publishInstallProgress(
    job: InstallJob,
    stage: ReleaseInstallProgressStage,
    progress: Partial<
        Omit<
            ReleaseInstallProgress,
            'id' | 'version' | 'mono' | 'prerelease' | 'published_at' | 'stage'
        >
    > = {},
): void {
    try {
        ipcSendToMainWindowSync('release-install-progress', {
            id: job.id,
            version: job.release.version,
            mono: job.mono,
            prerelease: job.release.prerelease,
            published_at: job.release.published_at,
            stage,
            ...progress,
        });
    } catch (error) {
        logger.debug('Failed to publish release install progress', error);
    }
}

async function extractReleaseArchive(
    job: InstallJob,
    archivePath: string,
    releasePath: string,
): Promise<void> {
    let processedEntries = 0;
    publishInstallProgress(job, 'extracting', { percent: 0 });

    await extractZipArchive(archivePath, {
        dir: releasePath,
        onEntry: (_entry, zipFile) => {
            processedEntries += 1;
            const percent =
                zipFile.entryCount > 0
                    ? Math.min(
                          99,
                          Math.round(
                              (processedEntries / zipFile.entryCount) * 100,
                          ),
                      )
                    : undefined;
            publishInstallProgress(job, 'extracting', { percent });
        },
    });

    publishInstallProgress(job, 'extracting', { percent: 100 });
}

async function installReleaseInternal(
    job: InstallJob,
): Promise<InstallReleaseResult> {
    const { release, mono } = job;
    logger.info(`Installing release '${release.version}'`);

    let rootReleasePath: string | undefined;
    let releasePath: string | undefined;
    let downloadPath: string | undefined;

    try {
        publishInstallProgress(job, 'preparing', { percent: 0 });

        // get install locations
        const { install_location: installLocation } =
            await getUserPreferences();
        rootReleasePath = path.resolve(
            installLocation,
            `${release.version}${mono ? '-mono' : ''}`,
        );
        releasePath = rootReleasePath;
        downloadPath = path.resolve(
            installLocation,
            'tmp',
            `${release.version}${mono ? '-mono' : ''}`,
        );

        // check the platform asset
        // pick the right asset for platform
        const asset = getPlatformAsset(
            os.platform(),
            os.arch(),
            release.assets,
        )?.find((a) => a.mono === mono);

        if (!asset) {
            return {
                success: false,
                error: t('installEditor:errors.noPlatformAsset'),
                version: release.version,
            };
        }

        // check if release already installed (folder name exists)

        if (fs.existsSync(releasePath)) {
            // if installed delete folder
            await fs.promises.rm(releasePath, { recursive: true, force: true });
        }

        if (fs.existsSync(downloadPath)) {
            await fs.promises.rm(downloadPath, {
                recursive: true,
                force: true,
            });
        }

        await fs.promises.mkdir(downloadPath, { recursive: true });

        // create folder
        await fs.promises.mkdir(releasePath, { recursive: true });

        // download release
        const archivePath = path.resolve(downloadPath, asset.name);
        publishInstallProgress(job, 'downloading', {
            percent: 0,
            receivedBytes: 0,
        });
        await downloadReleaseAsset(asset, archivePath, {
            idleTimeoutMs: DOWNLOAD_IDLE_TIMEOUT_MS,
            onProgress: ({ receivedBytes, totalBytes }) => {
                publishInstallProgress(job, 'downloading', {
                    percent: totalBytes
                        ? Math.min(
                              99,
                              Math.round((receivedBytes / totalBytes) * 100),
                          )
                        : undefined,
                    receivedBytes,
                    totalBytes,
                });
            },
        });
        publishInstallProgress(job, 'downloading', { percent: 100 });

        // extract release
        let editor_path: string;

        switch (path.extname(asset.name)) {
            case '.zip': {
                await extractReleaseArchive(job, archivePath, releasePath);

                switch (os.platform()) {
                    case 'win32':
                        // the mono version has an extra folder
                        if (mono) {
                            editor_path = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                                asset.name.replace('.zip', '.exe'),
                            );
                            releasePath = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                            );
                        } else {
                            editor_path = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                            );
                        }
                        break;
                    case 'darwin':
                        if (mono) {
                            editor_path = path.resolve(
                                releasePath,
                                'Godot_mono.app',
                            );
                        } else {
                            editor_path = path.resolve(
                                releasePath,
                                'Godot.app',
                            );
                        }
                        break;
                    case 'linux':
                        if (mono) {
                            let ext: string;

                            switch (os.arch()) {
                                case 'x64':
                                    ext = 'x86_64';
                                    break;
                                case 'arm':
                                    ext = 'arm32';
                                    break;
                                case 'arm64':
                                    ext = 'arm64';
                                    break;
                                default:
                                    ext = 'x86_32';
                                    break;
                            }

                            editor_path = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                                asset.name.replace(`_${ext}.zip`, `.${ext}`),
                            );
                            releasePath = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                            );
                        } else {
                            editor_path = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                            );
                        }
                        break;
                    default:
                        throw new Error(
                            t('installEditor:errors.unsupportedPlatform'),
                        );
                }

                break;
            }

            default:
                throw new Error(
                    t('installEditor:errors.unsupportedFileExtension'),
                );
        }

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
            install_path: releasePath,
            editor_path,
            platform: os.platform(),
            arch: os.arch(),
            mono,
            config_version: config?.configVersion,
            prerelease: release.prerelease,
            published_at: release.published_at,
            valid: true,
        };
        // update installed releases
        publishInstallProgress(job, 'registering', { percent: 95 });
        await addStoredInstalledRelease(installedRelease);

        // remove temp folder
        await fs.promises.rm(downloadPath, {
            recursive: true,
            force: true,
        });

        publishInstallProgress(job, 'validating', { percent: 98 });
        await checkAndUpdateProjects();

        return {
            success: true,
            release: installedRelease,
            version: release.version,
        };
    } catch (error) {
        logger.error('ERROR:', error);
        try {
            // if error delete folder and file
            if (rootReleasePath && fs.existsSync(rootReleasePath)) {
                // if installed return delete folder
                await fs.promises.rm(rootReleasePath, {
                    recursive: true,
                    force: true,
                });
            }
            if (downloadPath && fs.existsSync(downloadPath)) {
                await fs.promises.rm(downloadPath, {
                    recursive: true,
                    force: true,
                });
            }
        } catch (e) {
            // in case it is locked or runnning
            logger.log('Error cleaning up failed install', e);
        }

        return {
            success: false,
            error: (error as Error).message,
            version: release.version,
        };
    }
}
