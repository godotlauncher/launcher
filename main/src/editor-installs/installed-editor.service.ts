import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ConfigService } from '@mariodebono/di-config';
import type {
    InstalledRelease,
    RegisterCustomEngineResult,
    RemovedReleaseResult,
} from '@shared/contracts';
import logger from 'electron-log';
import type { AppConfig } from '../config/index.js';
import { parseCustomEngineManifest } from '../utils/customEngineManifest.utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorProjectRepairAdapter } from './editor-project-repair.adapter.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import {
    hasSameInstalledEditorIdentity,
    InstalledEditorStore,
} from './installed-editor.store.js';

const VALIDATION_PATH_CHECK_TIMEOUT_MS = 1500;

/** Owns registered editor persistence and lifecycle operations. */
@Injectable()
export class InstalledEditorService {
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

        for (const release of releases) {
            release.valid = this.configService.get('docsScreenshots')
                ? true
                : await this.pathExistsForValidation(release.editor_path);
            if (!release.valid) {
                logger.warn(`Release '${release.version}' has an invalid path`);
            }
        }

        return this.store.replace(releases);
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
        try {
            logger.info(`Registering custom editor manifest '${manifestPath}'`);
            const release = await parseCustomEngineManifest(manifestPath);
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
        try {
            logger.info(`Removing release '${release.version}'`);
            const releases = await this.store.remove(release);
            await this.projectRepair.removeEditorFromProjects(release);

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

            await this.projectRepair.revalidateProjects();
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
                releases: [],
            };
        }
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
}
