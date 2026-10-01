import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ConfigService } from '@mariodebono/di-config';
import type {
    EditorRemovalOutcome,
    EditorRemovalSelection,
    InstalledRelease,
    RegisterCustomEngineResult,
    RemovedReleaseResult,
    RemoveEditorsResult,
} from '@shared/contracts';
import logger from 'electron-log';
import type { AppConfig } from '../config/index.js';
import { t } from '../i18n/index.js';
import { parseCustomEngineManifest } from '../utils/customEngineManifest.utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorProjectRepairAdapter } from './editor-project-repair.adapter.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import {
    getInstalledEditorIdentity,
    hasSameInstalledEditorIdentity,
    InstalledEditorStore,
} from './installed-editor.store.js';

const VALIDATION_PATH_CHECK_TIMEOUT_MS = 1500;

/** Owns registered editor persistence and lifecycle operations. */
@Injectable()
export class InstalledEditorService {
    private readonly activeOfficialInstalls = new Set<string>();
    private readonly activeRemovals = new Set<string>();
    private readonly activeCustomRegistrations = new Set<string>();

    /**
     * Reserves an editor identity until an official install has finished.
     *
     * @param release - Version and flavour being installed.
     * @returns A callback that releases the reservation after cleanup.
     */
    reserveOfficialInstall(
        release: Pick<InstalledRelease, 'version' | 'mono'>,
    ): () => void {
        const identity = getInstalledEditorIdentity(release);
        if (
            this.activeRemovals.has(identity) ||
            this.activeCustomRegistrations.has(identity)
        ) {
            throw new Error(t('installs:selection.errors.busy'));
        }
        this.activeOfficialInstalls.add(identity);
        return () => this.activeOfficialInstalls.delete(identity);
    }

    /**
     * Creates the installed-editor service.
     *
     * @param store - Atomic installed-editor persistence.
     * @param configService - Runtime application configuration.
     * @param projectRepair - Temporary project repair boundary.
     */
    constructor(
        private readonly store: InstalledEditorStore,
        private readonly configService: ConfigService<AppConfig>,
        private readonly projectRepair: EditorProjectRepairAdapter,
    ) {}

    /** Gets every registered installed editor. */
    getInstalledEditors(): Promise<InstalledRelease[]> {
        return this.store.list();
    }

    /**
     * Persists one installed editor, replacing the same identity.
     *
     * @param release - Installed editor to persist.
     */
    addInstalledEditor(release: InstalledRelease): Promise<InstalledRelease[]> {
        return this.store.put(release);
    }

    /** Revalidates registered editor executable paths and persists the result. */
    async revalidateInstalledEditors(): Promise<InstalledRelease[]> {
        logger.info('Checking and updating releases');
        const releases = await this.store.list();
        return this.store.replace(await this.validateEditorPaths(releases));
    }

    /**
     * Quickly refreshes installed-editor paths for focus handling.
     *
     * @returns Updated releases when validity changed, otherwise null.
     */
    async refreshInstalledEditorHealth(): Promise<InstalledRelease[] | null> {
        const releases = await this.store.list();
        const validated = await this.validateEditorPaths(releases);
        const changed = validated.some(
            (release, index) => release.valid !== releases[index]?.valid,
        );
        if (!changed) {
            return null;
        }

        return this.store.replace(validated);
    }

    /**
     * Registers a custom editor manifest.
     *
     * @param manifestPath - Path to the custom editor manifest.
     * @param options - Optional duplicate replacement behaviour.
     */
    async registerCustomEditor(
        manifestPath: string,
        options: { replaceExisting?: boolean } = {},
    ): Promise<RegisterCustomEngineResult> {
        let registrationIdentity: string | undefined;
        try {
            logger.info(`Registering custom editor manifest '${manifestPath}'`);
            const release = await parseCustomEngineManifest(manifestPath);
            const identity = getInstalledEditorIdentity(release);
            if (
                this.activeOfficialInstalls.has(identity) ||
                this.activeRemovals.has(identity) ||
                this.activeCustomRegistrations.has(identity)
            ) {
                return {
                    success: false,
                    error: t('installs:selection.errors.busy'),
                };
            }
            this.activeCustomRegistrations.add(identity);
            registrationIdentity = identity;
            const installed = await this.store.list();
            const duplicate = installed.find((candidate) =>
                hasSameInstalledEditorIdentity(candidate, release),
            );

            if (duplicate && !options.replaceExisting) {
                return {
                    success: false,
                    duplicate,
                    error: `A release with version "${release.version}" is already registered.`,
                };
            }

            const releases = await this.store.put(release);
            await this.projectRepair.revalidateProjects();
            return { success: true, release, releases };
        } catch (error) {
            return {
                success: false,
                error: (error as Error).message,
            };
        } finally {
            if (registrationIdentity) {
                this.activeCustomRegistrations.delete(registrationIdentity);
            }
        }
    }

    /**
     * Removes one registered editor and its managed files when applicable.
     *
     * @param release - Registered editor to remove.
     */
    async removeEditor(
        release: InstalledRelease,
    ): Promise<RemovedReleaseResult> {
        const identity = getInstalledEditorIdentity(release);
        if (
            this.activeOfficialInstalls.has(identity) ||
            this.activeRemovals.has(identity) ||
            this.activeCustomRegistrations.has(identity)
        ) {
            return {
                success: false,
                error: t('installs:selection.errors.busy'),
                version: release.version,
                mono: release.mono,
                releases: await this.store.list(),
            };
        }
        this.activeRemovals.add(identity);
        try {
            return await this.removeReservedEditor(release);
        } finally {
            this.activeRemovals.delete(identity);
        }
    }

    /**
     * Deletes one editor while its identity is reserved by the caller.
     *
     * @param release - Validated editor record whose removal is reserved.
     * @returns The completed removal or failure and current registrations.
     */
    private async removeReservedEditor(
        release: InstalledRelease,
    ): Promise<RemovedReleaseResult> {
        try {
            logger.info(`Removing release '${release.version}'`);

            if (
                release.source !== 'custom' &&
                release.managed_by_launcher !== false &&
                fs.existsSync(release.install_path)
            ) {
                await fs.promises.rm(release.install_path, {
                    recursive: true,
                    force: true,
                });
            }

            const releases = await this.store.remove(release);
            try {
                await this.projectRepair.removeEditorFromProjects(release);
            } catch (error) {
                logger.warn(
                    'Could not remove project editor files after editor removal',
                    error,
                );
            }
            try {
                await this.projectRepair.revalidateProjects();
            } catch (error) {
                logger.warn(
                    'Could not revalidate projects after editor removal',
                    error,
                );
            }
            return {
                success: true,
                version: release.version,
                mono: release.mono,
                releases,
            };
        } catch (error) {
            return {
                success: false,
                error: (error as Error).message,
                version: release.version,
                mono: release.mono,
                releases: await this.store.list(),
            };
        }
    }

    /**
     * Removes each current registered editor independently and preserves failures.
     *
     * @param selections - Editor snapshots and their unused-only restrictions.
     * @param isInstallPending - Optional queued and active install check.
     * @returns Per-editor outcomes and the remaining registered editors.
     */
    async removeEditors(
        selections: EditorRemovalSelection[],
        isInstallPending?: (release: InstalledRelease) => boolean,
    ): Promise<RemoveEditorsResult> {
        const outcomes: EditorRemovalOutcome[] = [];
        const seen = new Set<string>();
        for (const selection of selections) {
            const identity = getInstalledEditorIdentity(selection.release);
            if (seen.has(identity)) continue;
            seen.add(identity);
            if (
                this.activeOfficialInstalls.has(identity) ||
                this.activeRemovals.has(identity) ||
                this.activeCustomRegistrations.has(identity) ||
                isInstallPending?.(selection.release)
            ) {
                outcomes.push({
                    release: selection.release,
                    status: 'skipped',
                    error: t('installs:selection.errors.busy'),
                });
                continue;
            }
            this.activeRemovals.add(identity);
            try {
                const registered = (await this.store.list()).find((candidate) =>
                    hasSameInstalledEditorIdentity(
                        candidate,
                        selection.release,
                    ),
                );
                if (
                    !registered ||
                    registered.editor_path !== selection.release.editor_path ||
                    registered.install_path !==
                        selection.release.install_path ||
                    registered.source !== selection.release.source ||
                    registered.managed_by_launcher !==
                        selection.release.managed_by_launcher
                ) {
                    outcomes.push({
                        release: selection.release,
                        status: 'skipped',
                        error: t('installs:selection.errors.changed'),
                    });
                    continue;
                }
                if (
                    selection.onlyUnused &&
                    (registered.source === 'custom' ||
                        registered.managed_by_launcher === false ||
                        (
                            await this.projectRepair.getProjectsUsingEditor(
                                registered,
                            )
                        ).length > 0)
                ) {
                    outcomes.push({
                        release: registered,
                        status: 'skipped',
                        error: t('installs:selection.errors.used'),
                    });
                    continue;
                }
                if (isInstallPending?.(registered)) {
                    outcomes.push({
                        release: registered,
                        status: 'skipped',
                        error: t('installs:selection.errors.busy'),
                    });
                    continue;
                }
                const result = await this.removeReservedEditor(registered);
                outcomes.push({
                    release: registered,
                    status: result.success ? 'removed' : 'failed',
                    ...(result.error ? { error: result.error } : {}),
                });
            } catch (error) {
                outcomes.push({
                    release: selection.release,
                    status: 'failed',
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            } finally {
                this.activeRemovals.delete(identity);
            }
        }
        return { outcomes, releases: await this.store.list() };
    }

    /**
     * Opens the Godot project manager for one registered editor.
     *
     * @param release - Registered editor to launch.
     */
    openProjectManager(release: InstalledRelease): void {
        const launchPath =
            os.platform() === 'darwin'
                ? path.resolve(
                      release.editor_path,
                      'Contents',
                      'MacOS',
                      'Godot',
                  )
                : release.editor_path;
        const editor = spawn(launchPath, ['-p'], {
            detached: true,
            stdio: 'ignore',
        });
        editor.unref();
    }

    /** Checks one path with the existing bounded validation time. */
    private async pathExistsForValidation(
        pathToCheck: string,
    ): Promise<boolean> {
        let timeout: NodeJS.Timeout | undefined;
        const exists = fs.promises
            .access(pathToCheck)
            .then(() => true)
            .catch(() => false);
        const timedOut = new Promise<boolean>((resolve) => {
            timeout = setTimeout(
                () => resolve(false),
                VALIDATION_PATH_CHECK_TIMEOUT_MS,
            );
        });

        try {
            return await Promise.race([exists, timedOut]);
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Validates editor paths in parallel without mutating stored snapshots.
     *
     * @param releases - Installed editors to validate.
     * @returns Copies containing current path validity.
     */
    private validateEditorPaths(
        releases: InstalledRelease[],
    ): Promise<InstalledRelease[]> {
        return Promise.all(
            releases.map(async (release) => {
                const valid = this.configService.get('e2eFixtures')
                    ? true
                    : await this.pathExistsForValidation(release.editor_path);
                if (!valid) {
                    logger.warn(
                        `Release '${release.version}' has an invalid path`,
                    );
                }
                return { ...release, valid };
            }),
        );
    }
}
