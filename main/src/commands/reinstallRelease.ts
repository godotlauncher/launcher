import * as path from 'node:path';
import type {
    InstalledRelease,
    InstallReleaseResult,
    ProjectDetails,
    ReleaseSummary,
} from '@shared/contracts';
import logger from 'electron-log';
import { checkAndUpdateProjects, checkAndUpdateReleases } from '../checks.js';
import { PROJECTS_FILENAME } from '../constants.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import { getStoredProjectsList } from '../utils/projects.utils.js';
import { hasSameInstalledReleaseIdentity } from '../utils/releases.utils.js';
import { installRelease } from './installRelease.js';
import { getAvailablePrereleases, getAvailableReleases } from './releases.js';
import { setProjectEditor } from './setProjectEditor.js';

async function getReleaseSummary(
    release: InstalledRelease,
): Promise<ReleaseSummary | undefined> {
    const [availableReleasesResult, availablePrereleasesResult] =
        await Promise.all([getAvailableReleases(), getAvailablePrereleases()]);

    return [
        ...availableReleasesResult.releases,
        ...availablePrereleasesResult.releases,
    ].find((candidate) => candidate.version === release.version);
}

function projectUsesRelease(
    project: ProjectDetails,
    release: InstalledRelease,
): boolean {
    return (
        project.release.editor_path === release.editor_path ||
        hasSameInstalledReleaseIdentity(project.release, release)
    );
}

async function repairProjectsUsingRelease(
    previousRelease: InstalledRelease,
    newRelease: InstalledRelease,
): Promise<void> {
    const { configDir } = getDefaultDirs();
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
    const projects = await getStoredProjectsList(projectListPath);
    const affectedProjects = projects.filter((project) =>
        projectUsesRelease(project, previousRelease),
    );

    for (const project of affectedProjects) {
        const result = await setProjectEditor(project, newRelease);
        if (!result.success) {
            logger.warn(
                `Failed to repair project '${project.name}' after reinstall: ${result.error}`,
            );
        }
    }

    await checkAndUpdateProjects();
}

export async function reinstallRelease(
    release: InstalledRelease,
): Promise<InstallReleaseResult> {
    try {
        logger.info(`Reinstalling release '${release.version}'`);

        if (release.source === 'custom') {
            const checkedReleases = await checkAndUpdateReleases();
            const refreshedRelease = checkedReleases.find((candidate) =>
                hasSameInstalledReleaseIdentity(candidate, release),
            );

            if (refreshedRelease?.valid) {
                await repairProjectsUsingRelease(release, refreshedRelease);
                return {
                    success: true,
                    version: refreshedRelease.version,
                    release: refreshedRelease,
                };
            }

            return {
                success: false,
                version: release.version,
                error: `Custom engine "${release.version}" is unavailable. Confirm the manifest and editor paths are accessible, then retry.`,
            };
        }

        const checkedReleases = await checkAndUpdateReleases();
        const validReplacement = checkedReleases.find(
            (candidate) =>
                hasSameInstalledReleaseIdentity(candidate, release) &&
                candidate.valid !== false,
        );

        if (validReplacement) {
            await repairProjectsUsingRelease(release, validReplacement);
            return {
                success: true,
                version: validReplacement.version,
                release: validReplacement,
            };
        }

        const releaseSummary = await getReleaseSummary(release);
        if (!releaseSummary) {
            return {
                success: false,
                version: release.version,
                error: `Release metadata not found for ${release.version}`,
            };
        }

        const result = await installRelease(releaseSummary, release.mono);
        if (!result.success || !result.release) {
            return result;
        }

        await repairProjectsUsingRelease(release, result.release);
        return result;
    } catch (error) {
        logger.error(`Failed to reinstall release '${release.version}'`, error);
        return {
            success: false,
            version: release.version,
            error: (error as Error).message,
        };
    }
}
