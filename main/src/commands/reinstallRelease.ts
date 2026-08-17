import * as path from 'node:path';
import type {
    EditorCatalogRelease,
    InstalledRelease,
    InstallReleaseResult,
    ProjectDetails,
    ReleaseSummary,
} from '@shared/contracts';
import logger from 'electron-log';
import { checkAndUpdateProjects, checkAndUpdateReleases } from '../checks.js';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { PROJECTS_FILENAME } from '../constants.js';
import type { EditorCatalogService } from '../editor-catalog/editor-catalog.service.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import { getStoredProjectsList } from '../utils/projects.utils.js';
import { hasSameInstalledReleaseIdentity } from '../utils/releases.utils.js';
import { installRelease } from './installRelease.js';
import { setProjectEditor } from './setProjectEditor.js';

async function getReleaseSummary(
    release: InstalledRelease,
    editorCatalogService: EditorCatalogService,
): Promise<ReleaseSummary | undefined> {
    const catalog = await editorCatalogService.getCatalog();
    const catalogRelease = catalog.releases.find(
        (candidate) =>
            candidate.version === release.version &&
            candidate.prerelease === release.prerelease,
    );

    return catalogRelease
        ? mapEditorCatalogReleaseToSummary(catalogRelease)
        : undefined;
}

/**
 * Converts one editor catalogue release into the installer's release shape.
 *
 * @param release - The catalogue release to convert.
 * @returns A release summary accepted by the existing installer.
 */
function mapEditorCatalogReleaseToSummary(
    release: EditorCatalogRelease,
): ReleaseSummary {
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
    codeEditorIntegrationService: CodeEditorIntegrationService,
): Promise<void> {
    const { configDir } = getDefaultDirs();
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
    const projects = await getStoredProjectsList(projectListPath);
    const affectedProjects = projects.filter((project) =>
        projectUsesRelease(project, previousRelease),
    );

    for (const project of affectedProjects) {
        const result = await setProjectEditor(
            project,
            newRelease,
            codeEditorIntegrationService,
        );
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
    codeEditorIntegrationService: CodeEditorIntegrationService,
    editorCatalogService: EditorCatalogService,
): Promise<InstallReleaseResult> {
    try {
        logger.info(`Reinstalling release '${release.version}'`);

        if (release.source === 'custom') {
            const checkedReleases = await checkAndUpdateReleases();
            const refreshedRelease = checkedReleases.find((candidate) =>
                hasSameInstalledReleaseIdentity(candidate, release),
            );

            if (refreshedRelease?.valid) {
                await repairProjectsUsingRelease(
                    release,
                    refreshedRelease,
                    codeEditorIntegrationService,
                );
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
            await repairProjectsUsingRelease(
                release,
                validReplacement,
                codeEditorIntegrationService,
            );
            return {
                success: true,
                version: validReplacement.version,
                release: validReplacement,
            };
        }

        const releaseSummary = await getReleaseSummary(
            release,
            editorCatalogService,
        );
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

        await repairProjectsUsingRelease(
            release,
            result.release,
            codeEditorIntegrationService,
        );
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
