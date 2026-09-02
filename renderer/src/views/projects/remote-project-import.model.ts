import type {
    AddProjectOptions,
    AddProjectToListResult,
    CodeEditorId,
    CodeEditorIntegrationSettings,
    RemoteDiscoveredProject,
    RemoteProjectImportFailureReason,
    RemoteRepositorySummary,
    ToolIntegrationSummary,
} from '@shared/contracts';
import type { SelectFieldOption } from '../../components/ui/selectField.component';
import {
    getCreateProjectDirectorySegment,
    normalizeBasePathForJoin,
} from '../subViews/createProject/createProject.model';

export type GitAvailability = 'loading' | 'available' | 'unavailable';

type RemoteProjectAdd = (
    projectPath: string,
    options?: AddProjectOptions,
) => Promise<AddProjectToListResult>;

type RemoteProjectResultHandler = (
    projectPath: string,
    result: AddProjectToListResult,
    options?: AddProjectOptions,
) => Promise<boolean>;

export type RemoteProjectCodeEditorChoice = 'auto' | 'none' | CodeEditorId;

type Translate = (key: string) => string;

export type RemoteProjectRegistrationHandoff =
    | {
          handled: true;
          added: boolean;
      }
    | {
          handled: false;
          error?: string;
      };

/**
 * Hands a discovered remote project to the shared Add Project result workflow.
 *
 * @param projectFilePath - Discovered project.godot path.
 * @param addProject - Canonical project registration function.
 * @param handleAddProjectResult - Shared renderer result handler.
 * @param options - Per-project registration options to preserve through retries.
 * @returns Whether the result was handled and whether the project was added.
 */
export async function handOffRemoteProjectRegistration(
    projectFilePath: string,
    addProject: RemoteProjectAdd,
    handleAddProjectResult: RemoteProjectResultHandler,
    options: AddProjectOptions = {},
): Promise<RemoteProjectRegistrationHandoff> {
    const result = await addProject(projectFilePath, options);
    if (!result.success && !result.editorResolution) {
        return { handled: false, error: result.error };
    }

    return {
        handled: true,
        added: await handleAddProjectResult(projectFilePath, result, options),
    };
}

/**
 * Creates the code-editor choices shown for one discovered project.
 *
 * @param t - Translation function.
 * @param settings - Configured code-editor integration settings.
 * @returns Select options with unavailable integrations disabled.
 */
export function getRemoteCodeEditorOptions(
    t: Translate,
    settings: CodeEditorIntegrationSettings[],
): SelectFieldOption[] {
    return [
        {
            value: 'auto',
            label: t('settings:codeEditors.drawer.path.automatic'),
        },
        { value: 'none', label: t('editProject.codeEditor.none') },
        ...settings.map((integrationSettings) => {
            const unavailableReason = !integrationSettings.enabled
                ? t('editProject.codeEditor.disabled')
                : integrationSettings.installation
                  ? null
                  : t('editProject.codeEditor.notFound');

            return {
                value: integrationSettings.integration.id,
                label: `${integrationSettings.integration.displayName}${unavailableReason ? ` (${unavailableReason})` : ''}`,
                disabled: unavailableReason !== null,
            };
        }),
    ];
}

/**
 * Converts a review choice into the options accepted by project registration.
 *
 * @param choice - Per-project code-editor choice.
 * @returns Registration options for automatic, none, or an explicit editor.
 */
export function getRemoteAddProjectOptions(
    choice: RemoteProjectCodeEditorChoice,
): AddProjectOptions {
    if (choice === 'auto') return {};
    if (choice === 'none') return { codeEditorId: null };
    return { codeEditorId: choice };
}

/**
 * Formats the effective Godot editor requirement discovered in a repository.
 *
 * @param project - Discovered project with effective editor metadata.
 * @returns A compact version label, or null when no version was detected.
 */
export function getRemoteDetectedEditorLabel(
    project: RemoteDiscoveredProject,
): string | null {
    const detected = project.detectedEditor;
    if (!detected) return null;

    const version =
        detected.kind === 'exact'
            ? detected.version
            : `${detected.baseVersion} stable`;
    return detected.flavor === 'dotnet' ? `${version} (.NET)` : version;
}

/**
 * Creates the default selection containing every discovered project.
 *
 * @param projects - Projects returned by repository discovery.
 * @returns A new set of selected project file paths.
 */
export function selectAllDiscoveredProjects(
    projects: RemoteDiscoveredProject[],
): Set<string> {
    return new Set(projects.map((project) => project.projectFilePath));
}

/**
 * Returns only discoveries selected for registration.
 *
 * @param projects - All discovered projects in display order.
 * @param selectedPaths - Selected project file paths.
 * @returns Selected projects in discovery order.
 */
export function filterSelectedDiscoveredProjects(
    projects: RemoteDiscoveredProject[],
    selectedPaths: Set<string>,
): RemoteDiscoveredProject[] {
    return projects.filter((project) =>
        selectedPaths.has(project.projectFilePath),
    );
}

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
 * Returns the containing project directory for a discovered project file.
 *
 * @param projectFilePath - Absolute path ending in project.godot.
 * @returns The platform-shaped containing directory path.
 */
export function getProjectDirectoryFromFilePath(
    projectFilePath: string,
): string {
    return projectFilePath.replace(/[\\/]project\.godot$/, '');
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
        'btn h-auto min-h-0 w-full justify-start rounded-box px-3 py-2 text-left text-sm font-normal shadow-none focus-visible:outline-none';
    return selected
        ? `${base} btn-soft btn-primary hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:border-primary focus-visible:bg-primary/10 focus-visible:text-primary`
        : `${base} btn-ghost`;
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
        'discovery-failed': 'discoveryFailed',
        'discovery-limit-exceeded': 'discoveryLimitExceeded',
        'finalise-failed': 'finaliseFailed',
        cancelled: 'cancelled',
    };
    return `addProject.remote.errors.${failureKeys[reason]}`;
}
