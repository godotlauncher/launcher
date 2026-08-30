import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    CreateProjectGitOptions,
    CreateProjectPublicationOptions,
    CreateProjectPublicationTarget,
    GitIdentity,
    GitIdentityScope,
    GitLfsTrackingPolicy,
    InstalledRelease,
    ProjectDetails,
    ProjectGitIdentityPreset,
    ReleaseInstallProgressStage,
    RendererType,
    ToolIntegrationSummary,
} from '@shared/contracts';
import {
    isGitIdentityComplete as isSharedGitIdentityComplete,
    resolveGitIdentityDecision,
    resolveGitIdentitySave,
} from '../../../git-identity.model';
import { sortReleases } from '../../../releaseStoring.utils';

export const OVERWRITE_PATH_CHECK_DEBOUNCE_MS = 200;
export const PROJECT_NAME_CHECK_DEBOUNCE_MS = 500;
export const REPOSITORY_NAME_CHECK_DEBOUNCE_MS = 900;

export const GITHUB_REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Checks whether the entered project name is unused in the Launcher library.
 *
 * @param projects - Projects currently registered with Launcher.
 * @param projectName - Project name entered in the Create Project drawer.
 * @returns Whether the trimmed name is non-empty and unused.
 */
export function isCreateProjectNameAvailable(
    projects: Pick<ProjectDetails, 'name'>[],
    projectName: string,
): boolean {
    const trimmedName = projectName.trim();
    return (
        trimmedName.length > 0 &&
        !projects.some((project) => project.name === trimmedName)
    );
}

/**
 * Suggests a GitHub-safe repository name from the project name.
 *
 * @param projectName - Current display name for the project.
 * @returns A trimmed repository name using GitHub's conservative safe subset.
 */
export function getSuggestedGitHubRepositoryName(projectName: string): string {
    return projectName
        .trim()
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
}

/**
 * Checks the conservative repository-name syntax used by the publishing flow.
 *
 * @param repositoryName - Repository name entered by the user.
 * @returns Whether the name can be sent to the provider.
 */
export function isGitHubRepositoryNameValid(repositoryName: string): boolean {
    return GITHUB_REPOSITORY_NAME_PATTERN.test(repositoryName);
}

/**
 * Builds a stable renderer value for one exact publication target.
 *
 * @param target - Provider target selected by the user.
 * @returns A value safe for the owner selector.
 */
export function getPublicationTargetValue(
    target: CreateProjectPublicationTarget,
): string {
    return JSON.stringify([target.connectionId, target.accessTargetId]);
}

/**
 * Converts one selected target and repository name to a publication request.
 *
 * @param target - Exact connected owner target.
 * @param repositoryName - Validated repository name.
 * @returns Provider-neutral publication options.
 */
export function toCreateProjectPublicationOptions(
    target: CreateProjectPublicationTarget,
    repositoryName: string,
): CreateProjectPublicationOptions {
    return {
        providerId: target.providerId,
        connectionId: target.connectionId,
        accessTargetId: target.accessTargetId,
        repositoryName,
    };
}

/**
 * Decides whether publishing success needs an in-app acknowledgement.
 *
 * @param editNow - Whether the new project launches immediately.
 * @returns Whether the publication success alert should be shown.
 */
export function shouldShowCreateProjectPublishedAlert(
    editNow: boolean,
): boolean {
    return !editNow;
}

export type PathSeparator = '\\' | '/';

export type DownloadingCreateProjectRelease = {
    version: string;
    mono: boolean;
    prerelease: boolean;
    published_at: string | null;
    stage: ReleaseInstallProgressStage;
    queuePosition?: number;
};

export type CreateProjectReleaseRow = InstalledRelease & {
    installStage?: ReleaseInstallProgressStage;
    queuePosition?: number;
};

/**
 * Builds the stable identity used by the Create Project editor selection.
 *
 * @param release - Editor release to identify.
 * @returns The release version and variant identity.
 */
export function getCreateProjectReleaseKey(
    release: Pick<InstalledRelease, 'version' | 'mono'>,
): string {
    return `${release.version}:${release.mono ? 'mono' : 'std'}`;
}

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

/**
 * Builds installed editors and unavailable in-progress install rows.
 *
 * @param installedReleases - Persisted installed editor records.
 * @param downloadingReleases - Active editor install jobs.
 * @returns Deduplicated rows for the Create Project editor selector.
 */
export const buildCreateProjectReleaseRows = (
    installedReleases: InstalledRelease[],
    downloadingReleases: DownloadingCreateProjectRelease[],
): CreateProjectReleaseRow[] => {
    const rowsByIdentity = new Map<string, CreateProjectReleaseRow>(
        installedReleases.map((release) => [
            getCreateProjectReleaseKey(release),
            release,
        ]),
    );

    for (const release of downloadingReleases) {
        const identity = getCreateProjectReleaseKey(release);
        const installed = rowsByIdentity.get(identity);
        if (installed && installed.valid !== false) {
            continue;
        }

        rowsByIdentity.set(identity, {
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
            installStage: release.stage,
            queuePosition: release.queuePosition,
        });
    }

    return [...rowsByIdentity.values()].sort(sortReleases);
};

/**
 * Resolves a usable editor selection without selecting disabled rows.
 *
 * @param releases - Create Project editor rows.
 * @param preferredReleaseKey - Current release identity to preserve when usable.
 * @returns A usable row index, or -1 when no installed editor is available.
 */
export function resolveCreateProjectReleaseIndex(
    releases: CreateProjectReleaseRow[],
    preferredReleaseKey: string | null,
): number {
    const preferredIndex = releases.findIndex(
        (release) =>
            getCreateProjectReleaseKey(release) === preferredReleaseKey,
    );
    const preferred = releases[preferredIndex];
    if (preferred?.valid !== false && preferred?.editor_path) {
        return preferredIndex;
    }

    return releases.findIndex(
        (release) => release.valid !== false && Boolean(release.editor_path),
    );
}

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

/**
 * Adds the selected Git LFS policy to a Create Project Git request.
 *
 * @param gitOptions - Existing initial commit and identity choice.
 * @param trackingPolicy - Main-owned Git LFS policy selected for setup.
 * @returns The original choice or a request with the documentation defaults.
 */
export const addCreateProjectGitLfsOptions = (
    gitOptions: CreateProjectGitOptions | undefined,
    trackingPolicy: GitLfsTrackingPolicy | undefined,
): CreateProjectGitOptions | undefined => {
    if (!trackingPolicy) {
        return gitOptions;
    }

    return {
        ...(gitOptions ?? { initialCommit: 'create' }),
        gitLfs: { trackingPolicy },
    };
};

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
    isSharedGitIdentityComplete(identity);

export type CreateProjectGitIdentityDecision =
    | { action: 'use-global' }
    | { action: 'apply-preset'; preset: ProjectGitIdentityPreset }
    | {
          action: 'suggest-preset';
          preset: ProjectGitIdentityPreset;
          globalIdentity: GitIdentity;
      }
    | { action: 'require-identity'; globalIdentity: GitIdentity };

export type CreateProjectGitIdentitySaveChoice =
    | 'ask'
    | 'local-default'
    | 'global-default';

export type CreateProjectGitIdentitySaveResolution = {
    scope: GitIdentityScope;
    preset: ProjectGitIdentityPreset | null;
};

/**
 * Resolves Create Project behaviour from global Git state and the preset.
 *
 * @param globalIdentity - Independently read global Git name and email.
 * @param projectPreset - Optional Launcher-owned project identity preset.
 * @returns The next identity step before project creation.
 */
export function resolveCreateProjectGitIdentityDecision(
    globalIdentity: GitIdentity,
    projectPreset: ProjectGitIdentityPreset | null,
): CreateProjectGitIdentityDecision {
    return resolveGitIdentityDecision(globalIdentity, projectPreset);
}

/**
 * Resolves how a first entered identity should be saved.
 *
 * @param identity - Complete identity entered during project creation.
 * @param choice - Future default selected by the user.
 * @param existingPreset - Preset already loaded before the form opened.
 * @returns Git scope and optional new automatic preset, or null when invalid.
 */
export function resolveCreateProjectGitIdentitySave(
    identity: GitIdentity,
    choice: CreateProjectGitIdentitySaveChoice,
    existingPreset: ProjectGitIdentityPreset | null,
): CreateProjectGitIdentitySaveResolution | null {
    return resolveGitIdentitySave(identity, choice, existingPreset);
}
