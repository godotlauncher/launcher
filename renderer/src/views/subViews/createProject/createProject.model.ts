import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    GitIdentity,
    InstalledRelease,
    RendererType,
    ToolIntegrationSummary,
} from '@shared/contracts';
import { sortReleases } from '../../../releaseStoring.utils';

export const OVERWRITE_PATH_CHECK_DEBOUNCE_MS = 200;

export type PathSeparator = '\\' | '/';

export type DownloadingCreateProjectRelease = {
    version: string;
    mono: boolean;
    prerelease: boolean;
    published_at: string | null;
};

const RESERVED_WINDOWS_NAME =
    /^(?:con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i;

const replaceInvalidDirectoryCharacters = (name: string) => {
    let result = '';
    let replacingInvalidRun = false;

    for (const character of name) {
        const invalid =
            character.charCodeAt(0) <= 0x1f || '<>:"/\\|?*'.includes(character);

        if (invalid) {
            if (!replacingInvalidRun) {
                result += '-';
            }
            replacingInvalidRun = true;
            continue;
        }

        result += character;
        replacingInvalidRun = false;
    }

    return result;
};

export const getCreateProjectDirectorySegment = (projectName: string) => {
    const displayName = projectName.trim().replace(/ /g, '-');
    const sanitised = replaceInvalidDirectoryCharacters(displayName).replace(
        /[. ]+$/g,
        '',
    );

    if (!sanitised || sanitised === '.' || sanitised === '..') {
        return 'project';
    }

    return RESERVED_WINDOWS_NAME.test(sanitised) ? `_${sanitised}` : sanitised;
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

/**
 * Reports whether one stable tool integration is currently available.
 *
 * @param tools - Renderer-safe tool integration summaries.
 * @param toolId - Stable tool integration ID to find.
 * @returns Whether the integration is available for use.
 */
export const isToolIntegrationAvailable = (
    tools: ToolIntegrationSummary[],
    toolId: string,
): boolean =>
    tools.some((tool) => tool.id === toolId && tool.status === 'available');

export const resolveCreateProjectCodeEditorId = (
    settings: CodeEditorIntegrationSettings[],
): CodeEditorId | null => {
    const defaultSettings = settings.find(
        (integrationSettings) => integrationSettings.isDefault,
    );

    if (defaultSettings) {
        return defaultSettings.enabled && defaultSettings.installation
            ? defaultSettings.integration.id
            : null;
    }

    const eligibleSettings = settings.filter(
        (integrationSettings) =>
            integrationSettings.enabled && integrationSettings.installation,
    );

    return eligibleSettings.length === 1
        ? eligibleSettings[0].integration.id
        : null;
};

/**
 * Checks whether both required Git identity values contain text.
 *
 * @param identity - Git identity values to validate.
 * @returns Whether name and email are both present.
 */
export const isGitIdentityComplete = (identity: GitIdentity): boolean =>
    identity.name.trim().length > 0 && identity.email.trim().length > 0;
