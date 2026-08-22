import type {
    RemoteProjectImportFailureReason,
    RemoteRepositorySummary,
    ToolIntegrationSummary,
} from '@shared/contracts';
import {
    getCreateProjectDirectorySegment,
    normalizeBasePathForJoin,
} from '../subViews/createProject/createProject.model';

export type GitAvailability = 'loading' | 'available' | 'unavailable';

/**
 * Reports whether the registered Git tool can currently be used.
 *
 * @param integrations - Renderer-safe tool integration summaries.
 * @returns Whether Git is available.
 */
export function getGitAvailability(
    integrations: ToolIntegrationSummary[],
): GitAvailability {
    return integrations.some(
        (integration) =>
            integration.id === 'git' && integration.status === 'available',
    )
        ? 'available'
        : 'unavailable';
}

/**
 * Joins a selected parent and child for renderer-only destination display.
 *
 * @param parentDirectory - Selected existing parent directory.
 * @param directoryName - Proposed project directory name.
 * @param platform - Current operating-system platform.
 * @returns A platform-shaped display path.
 */
export function getRemoteProjectDestinationDisplay(
    parentDirectory: string,
    directoryName: string,
    platform?: string,
): string {
    const separator = platform === 'win32' ? '\\' : '/';
    const trimmedParent = parentDirectory.trim();
    const trimmedName = directoryName.trim();

    if (!trimmedParent) {
        return trimmedName;
    }
    if (!trimmedName) {
        return trimmedParent;
    }
    if (trimmedParent.endsWith('/') || trimmedParent.endsWith('\\')) {
        return `${trimmedParent}${trimmedName}`;
    }
    return `${trimmedParent}${separator}${trimmedName}`;
}

/**
 * Derives the safe local directory segment shown and submitted for an import.
 *
 * @param projectName - User-entered project name.
 * @returns A Create Project-compatible directory segment, or empty if blank.
 */
export function getRemoteProjectDirectoryName(projectName: string): string {
    return projectName.trim()
        ? getCreateProjectDirectorySegment(projectName)
        : '';
}

/**
 * Reports whether a custom clone parent should offer the configured default.
 *
 * @param parentDirectory - Current clone parent directory.
 * @param defaultParentDirectory - Configured Projects location.
 * @param platform - Current operating-system platform.
 * @returns Whether the Use default action should be shown.
 */
export function shouldShowRemoteProjectUseDefault(
    parentDirectory: string,
    defaultParentDirectory: string,
    platform?: string,
): boolean {
    const separator = platform === 'win32' ? '\\' : '/';
    const normalizedDefault = normalizeBasePathForJoin(
        defaultParentDirectory,
        separator,
    );

    return (
        normalizedDefault.length > 0 &&
        normalizeBasePathForJoin(parentDirectory, separator) !==
            normalizedDefault
    );
}

/**
 * Filters only the repository rows already loaded into the modal.
 *
 * @param repositories - Loaded renderer-safe repository rows.
 * @param query - Owner or repository search text.
 * @returns Matching rows in provider order.
 */
export function filterRemoteRepositories(
    repositories: RemoteRepositorySummary[],
    query: string,
): RemoteRepositorySummary[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
        return repositories;
    }
    return repositories.filter((repository) =>
        `${repository.owner}/${repository.name}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
    );
}

/**
 * Appends a repository page without duplicating opaque repository references.
 *
 * @param current - Currently loaded rows.
 * @param incoming - Newly loaded rows.
 * @returns Provider-ordered unique rows.
 */
export function appendRemoteRepositories(
    current: RemoteRepositorySummary[],
    incoming: RemoteRepositorySummary[],
): RemoteRepositorySummary[] {
    const known = new Set(
        current.map((repository) => repository.repositoryRef),
    );
    return [
        ...current,
        ...incoming.filter((repository) => {
            if (known.has(repository.repositoryRef)) {
                return false;
            }
            known.add(repository.repositoryRef);
            return true;
        }),
    ];
}

/**
 * Returns a clearly selected or idle repository-row treatment.
 *
 * @param selected - Whether this row is the current repository selection.
 * @returns Classes for the clickable repository row.
 */
export function getRemoteRepositoryRowClassName(selected: boolean): string {
    const base =
        'flex w-full items-center rounded-box border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50';
    return selected
        ? `${base} border-primary bg-primary/20 text-base-content ring-1 ring-primary`
        : `${base} border-base-300 bg-base-200 hover:border-primary/60 hover:bg-base-300`;
}

/**
 * Returns the locale key for a remote import terminal failure.
 *
 * @param reason - Typed main-process terminal failure.
 */
export function getRemoteImportFailureKey(
    reason: RemoteProjectImportFailureReason,
): string {
    const failureKeys: Record<RemoteProjectImportFailureReason, string> = {
        'invalid-request': 'invalidSource',
        'already-running': 'alreadyRunning',
        'git-unavailable': 'gitUnavailable',
        'invalid-url': 'invalidSource',
        'unsupported-url': 'invalidSource',
        'invalid-host': 'invalidSource',
        'invalid-path': 'invalidSource',
        'dns-unavailable': 'temporarilyUnavailable',
        'non-public-host': 'invalidSource',
        'public-clone-incompatible': 'cloneFailed',
        'no-usable-connection': 'connectionRequired',
        'secure-storage-unavailable': 'connectionRequired',
        'reauthorisation-required': 'connectionRequired',
        'repository-unavailable': 'repositoryUnavailable',
        'provider-unavailable': 'temporarilyUnavailable',
        'network-unavailable': 'temporarilyUnavailable',
        'rate-limited': 'temporarilyUnavailable',
        'session-expired': 'repositoryUnavailable',
        'destination-invalid': 'destinationInvalid',
        'destination-conflict': 'destinationConflict',
        'clone-failed': 'cloneFailed',
        'not-godot-project': 'notGodotProject',
        'finalise-failed': 'finaliseFailed',
        cancelled: 'cancelled',
    };
    return `addProject.remote.errors.${failureKeys[reason]}`;
}
