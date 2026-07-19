import type { RegisterCustomEngineResult } from '@shared/contracts';
import logger from 'electron-log';
import { checkAndUpdateProjects } from '../checks.js';
import { parseCustomEngineManifest } from '../utils/customEngineManifest.utils.js';
import {
    addStoredInstalledRelease,
    getStoredInstalledReleases,
    hasSameInstalledReleaseIdentity,
} from '../utils/releases.utils.js';

type RegisterCustomEngineOptions = {
    replaceExisting?: boolean;
};

export async function registerCustomEngine(
    manifestPath: string,
    options: RegisterCustomEngineOptions = {},
): Promise<RegisterCustomEngineResult> {
    try {
        logger.info(`Registering custom editor manifest '${manifestPath}'`);
        const release = await parseCustomEngineManifest(manifestPath);
        const installedReleases = await getStoredInstalledReleases();
        const duplicate = installedReleases.find((candidate) =>
            hasSameInstalledReleaseIdentity(candidate, release),
        );

        if (duplicate && !options.replaceExisting) {
            return {
                success: false,
                duplicate,
                error: `A release with version "${release.version}" is already registered.`,
            };
        }

        const releases = await addStoredInstalledRelease(release);
        await checkAndUpdateProjects();

        return {
            success: true,
            release,
            releases,
        };
    } catch (error) {
        return {
            success: false,
            error: (error as Error).message,
        };
    }
}
