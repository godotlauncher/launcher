import * as fs from 'node:fs';
import type { InstalledRelease, RemovedReleaseResult } from '@shared/contracts';
import logger from 'electron-log';
import { checkAndUpdateProjects } from '../checks.js';
import {
    removeProjectEditorUsingRelease,
    removeStoredInstalledRelease,
} from '../utils/releases.utils.js';

export async function removeRelease(
    release: InstalledRelease,
): Promise<RemovedReleaseResult> {
    try {
        logger.info(`Removing release '${release.version}'`);
        const releases = await removeStoredInstalledRelease(release);

        await removeProjectEditorUsingRelease(release);

        const shouldDeleteReleaseFiles =
            release.source !== 'custom' &&
            release.managed_by_launcher !== false;

        // delete release folder only for launcher-managed installs
        if (shouldDeleteReleaseFiles && fs.existsSync(release.install_path)) {
            await fs.promises.rm(release.install_path, {
                recursive: true,
                force: true,
            });
        }

        await checkAndUpdateProjects();

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
