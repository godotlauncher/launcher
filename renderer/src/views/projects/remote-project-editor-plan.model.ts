import type {
    AddProjectOptions,
    AddProjectToListResult,
    InstalledRelease,
    ReleaseSummary,
    RemoteDiscoveredProject,
} from '@shared/contracts';
import { findDownloadableProjectEditor } from './project-editor-resolution.model';

export type RemoteProjectEditorChoice =
    | 'download'
    | 'use-fallback'
    | 'add-missing';

export type RemoteProjectEditorCandidate = {
    project: RemoteDiscoveredProject;
    result: AddProjectToListResult;
    options: AddProjectOptions;
};

export type RemoteProjectEditorPlanGroup = {
    key: string;
    version: string;
    mono: boolean;
    candidates: RemoteProjectEditorCandidate[];
    downloadableRelease?: ReleaseSummary;
    fallback?: InstalledRelease;
    choice: RemoteProjectEditorChoice;
};

/**
 * Creates a stable renderer key for one requested editor resolution.
 *
 * @param candidate - Project whose missing editor needs a resolution.
 * @param downloadableRelease - Exact catalogue release selected for download.
 * @returns A key that groups compatible editor decisions.
 */
function getEditorPlanKey(
    candidate: RemoteProjectEditorCandidate,
    downloadableRelease?: ReleaseSummary,
): string {
    const requested = candidate.result.editorResolution?.requested;
    if (!requested) return candidate.project.projectFilePath;

    if (downloadableRelease) {
        return `download:${downloadableRelease.version}:${requested.flavor}`;
    }

    const requestedVersion =
        requested.kind === 'exact' ? requested.version : requested.base_version;
    return `request:${requested.kind}:${requested.channel}:${requestedVersion}:${requested.flavor}`;
}

/**
 * Returns a fallback only when every candidate can use the same installed editor.
 *
 * @param candidates - Candidates grouped under one editor requirement.
 * @returns The common installed fallback, when one exists.
 */
function getCommonFallback(
    candidates: RemoteProjectEditorCandidate[],
): InstalledRelease | undefined {
    const fallbacks = candidates.map(
        (candidate) => candidate.result.editorResolution?.fallback,
    );
    const first = fallbacks[0];
    if (!first) return undefined;

    return fallbacks.every(
        (fallback) =>
            fallback?.version === first.version && fallback.mono === first.mono,
    )
        ? first
        : undefined;
}

/**
 * Groups missing remote-project editors into independent resolution choices.
 *
 * @param candidates - Projects that returned a missing-editor resolution.
 * @param availableReleases - Stable releases available for download.
 * @param availablePrereleases - Prereleases available for download.
 * @returns Groups keyed by the exact editor version and flavour to resolve.
 */
export function createRemoteProjectEditorPlan(
    candidates: RemoteProjectEditorCandidate[],
    availableReleases: ReleaseSummary[],
    availablePrereleases: ReleaseSummary[],
): RemoteProjectEditorPlanGroup[] {
    const groups = new Map<
        string,
        Omit<RemoteProjectEditorPlanGroup, 'fallback' | 'choice'>
    >();

    for (const candidate of candidates) {
        const resolution = candidate.result.editorResolution;
        if (!resolution) continue;

        const downloadableRelease = findDownloadableProjectEditor(
            resolution,
            availableReleases,
            availablePrereleases,
        );
        const canDownload =
            resolution.requested.channel === 'official' &&
            Boolean(downloadableRelease) &&
            (resolution.requested.flavor === 'gdscript' ||
                resolution.requested.flavor === 'dotnet');
        const resolvedRelease = canDownload ? downloadableRelease : undefined;
        const key = getEditorPlanKey(candidate, resolvedRelease);
        const current = groups.get(key);

        if (current) {
            current.candidates.push(candidate);
            continue;
        }

        groups.set(key, {
            key,
            version:
                resolvedRelease?.version ??
                (resolution.requested.kind === 'exact'
                    ? resolution.requested.version
                    : `${resolution.requested.base_version} stable`),
            mono: resolution.requested.flavor === 'dotnet',
            candidates: [candidate],
            downloadableRelease: resolvedRelease,
        });
    }

    return [...groups.values()].map((group) => {
        const fallback = getCommonFallback(group.candidates);
        return {
            ...group,
            fallback,
            choice: group.downloadableRelease
                ? 'download'
                : fallback
                  ? 'use-fallback'
                  : 'add-missing',
        };
    });
}
