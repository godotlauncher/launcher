import type {
    AddProjectOptions,
    EditorFlavor,
    ProjectImportInspection,
    ReleaseSummary,
} from '@shared/contracts';
import { findDownloadableProjectEditor } from './project-editor-resolution.model';

export type LocalImportEditorAction = {
    id: string;
    version?: string;
    name?: string;
    flavor?: EditorFlavor;
    kind: 'use' | 'download' | 'missing';
    recommended?: boolean;
    options: AddProjectOptions;
    download?: ReleaseSummary;
};
export type LocalImportRow = ProjectImportInspection & {
    editorActions: LocalImportEditorAction[];
    editorActionId: string;
};

/** Builds review actions without starting registration or editor downloads.
 * @param row - Read-only main-process inspection.
 * @param stable - Stable catalogue for legacy exact requirements.
 * @param prereleases - Prerelease catalogue for exact requirements.
 */
export function prepareLocalImportRow(
    row: ProjectImportInspection,
    stable: ReleaseSummary[],
    prereleases: ReleaseSummary[],
): LocalImportRow {
    const resolution = row.editorResolution;
    const actions: LocalImportEditorAction[] = [];
    if (resolution?.choices !== undefined) {
        for (const choice of resolution.choices) {
            if (!choice.installed && !choice.release) continue;
            actions.push({
                id: choice.id,
                version: choice.version,
                name: choice.name,
                flavor: choice.flavor,
                kind: choice.installed ? 'use' : 'download',
                recommended: choice.recommended,
                options: choice.installed
                    ? { resolution: 'use_selected', editorChoiceId: choice.id }
                    : { resolution: 'add_missing', editorChoiceId: choice.id },
                download: choice.installed ? undefined : choice.release,
            });
        }
    } else if (resolution) {
        const download = findDownloadableProjectEditor(
            resolution,
            stable,
            prereleases,
        );
        if (download)
            actions.push({
                id: 'download',
                version: download.version,
                flavor:
                    resolution.downloadable?.flavor ??
                    resolution.requested.flavor,
                kind: 'download',
                options: { resolution: 'add_missing' },
                download,
            });
        if (resolution.fallback)
            actions.push({
                id: 'fallback',
                version: resolution.fallback.version,
                flavor: resolution.fallback.mono ? 'dotnet' : 'gdscript',
                kind: 'use',
                options: {
                    resolution: 'use_fallback',
                    release: resolution.fallback,
                },
            });
    } else {
        actions.push({
            id: 'automatic',
            version: row.editor?.version,
            flavor: row.editor
                ? row.editor.mono
                    ? 'dotnet'
                    : 'gdscript'
                : undefined,
            kind: 'use',
            options: {},
        });
    }
    if (resolution)
        actions.push({
            id: 'missing',
            kind: 'missing',
            options: { resolution: 'add_missing' },
        });
    return {
        ...row,
        editorActions: actions,
        editorActionId:
            actions.find((a) => a.recommended)?.id ?? actions[0]?.id ?? '',
    };
}
