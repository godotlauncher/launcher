import type { CachedTool, InstalledRelease, RendererType } from '@shared';
import { sortReleases } from '../../../releaseStoring.utils';

export const OVERWRITE_PATH_CHECK_DEBOUNCE_MS = 200;

export type PathSeparator = '\\' | '/';

export type DownloadingCreateProjectRelease = {
    version: string;
    mono: boolean;
    prerelease: boolean;
    published_at: string | null;
};

export const isWindowsDriveRootPath = (pathToCheck: string) =>
    /^[a-zA-Z]:[\\/]*$/.test(pathToCheck);

export const normalizeBasePathForJoin = (
    rawBasePath: string,
    separator: PathSeparator,
) => {
    const trimmedPath = rawBasePath.trim();

    if (trimmedPath.length === 0) {
        return '';
    }

    if (/^[\\/]+$/.test(trimmedPath)) {
        return separator;
    }

    if (separator === '\\' && isWindowsDriveRootPath(trimmedPath)) {
        return `${trimmedPath.slice(0, 2)}\\`;
    }

    return trimmedPath.replace(/[\\/]+$/g, '');
};

export const joinBasePathWithProjectSegment = (
    rawBasePath: string,
    segment: string,
    separator: PathSeparator,
) => {
    const normalizedBasePath = normalizeBasePathForJoin(rawBasePath, separator);

    if (normalizedBasePath.length === 0) {
        return segment;
    }

    if (normalizedBasePath === separator) {
        return `${separator}${segment}`;
    }

    if (separator === '\\' && isWindowsDriveRootPath(normalizedBasePath)) {
        return `${normalizedBasePath}${segment}`;
    }

    return `${normalizedBasePath}${separator}${segment}`;
};

export const getProjectPathSuffixDisplay = (
    rawBasePath: string,
    segment: string,
    separator: PathSeparator,
) => {
    const trimmedBasePath = rawBasePath.trim();

    if (
        trimmedBasePath.length === 0 ||
        /^[\\/]+$/.test(trimmedBasePath) ||
        /[\\/]+$/.test(trimmedBasePath) ||
        (separator === '\\' && isWindowsDriveRootPath(trimmedBasePath))
    ) {
        return segment;
    }

    return `${separator}${segment}`;
};

export const buildCreateProjectReleaseRows = (
    installedReleases: InstalledRelease[],
    downloadingReleases: DownloadingCreateProjectRelease[],
): InstalledRelease[] =>
    installedReleases
        .concat(
            downloadingReleases.map((release) => ({
                version: release.version,
                version_number: -1,
                install_path: '',
                mono: release.mono,
                platform: '',
                arch: '',
                editor_path: '',
                prerelease: release.prerelease,
                config_version: 5,
                published_at: release.published_at,
                valid: true,
            })),
        )
        .sort(sortReleases);

export const getDefaultRendererForReleaseVersion = (
    releaseVersion: string,
): RendererType[5] | undefined => {
    const versionInt = parseInt(releaseVersion, 10);

    if (versionInt >= 4) {
        return 'FORWARD_PLUS';
    }

    return undefined;
};

export const isVerifiedToolAvailable = (
    tools: CachedTool[],
    name: string,
): boolean => {
    const tool = tools.find((tool) => tool.name === name);
    return tool?.verified === true && (tool.path?.length || 0) > 0;
};
