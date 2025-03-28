import * as fs from 'node:fs';
import logger from 'electron-log';

import { getDefaultDirs } from '../utils/platform.utils.js';
import { removeStoredInstalledRelease, removeProjectEditorUsingRelease } from '../utils/releases.utils.js';
import { checkAndUpdateProjects } from '../checks.js';


export async function removeRelease(release: InstalledRelease): Promise<RemovedReleaseResult> {
    const installedReleasesCachePath = getDefaultDirs().installedReleasesCachePath;
    try {
        logger.info(`Removing release '${release.version}'`);
        const releases = await removeStoredInstalledRelease(installedReleasesCachePath, release);

        await removeProjectEditorUsingRelease(release);

        // delete release folder
        if (fs.existsSync(release.install_path)) {
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