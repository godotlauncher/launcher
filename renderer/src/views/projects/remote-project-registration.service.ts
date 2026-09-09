import type {
    AddProjectOptions,
    AddProjectToListResult,
} from '@shared/contracts';
import type { ProjectEditorRepairRequest } from '../../hooks/projects.hook';
import type { LocalImportRow } from './local-import-editor.model';
import {
    getRemoteAddProjectOptions,
    type RemoteProjectCodeEditorChoice,
} from './remote-project-import.model';
import type { RemoteProjectRegistrationOutcome } from './remote-project-import.types';

type Translate = (key: string) => string;

type AddProject = (
    projectPath: string,
    options?: AddProjectOptions,
) => Promise<AddProjectToListResult>;

type HandleAddProjectResult = (
    projectPath: string,
    result: AddProjectToListResult,
    options?: AddProjectOptions,
) => Promise<boolean>;

type RegisterResolvedRemoteProjectBatchArgs = {
    rows: LocalImportRow[];
    projects: RemoteProjectRegistrationOutcome['project'][];
    codeEditorChoices: Record<string, RemoteProjectCodeEditorChoice>;
    addProject: AddProject;
    handleAddProjectResult: HandleAddProjectResult;
    t: Translate;
    onProgress: (current: number, total: number) => void;
    onOutcomesChange: (outcomes: RemoteProjectRegistrationOutcome[]) => void;
};

export type ResolvedRemoteProjectBatchResult = {
    outcomes: RemoteProjectRegistrationOutcome[];
    staleResults: Map<string, AddProjectToListResult>;
    repairRequests: ProjectEditorRepairRequest[];
};

/** Registers preflighted remote rows with their chosen Godot and code editors.
 * @param args - Reviewed rows, discovery metadata and registration callbacks.
 * @returns Final outcomes, stale rows to review again and grouped repairs.
 */
export async function registerResolvedRemoteProjectBatch({
    rows,
    projects,
    codeEditorChoices,
    addProject,
    handleAddProjectResult,
    t,
    onProgress,
    onOutcomesChange,
}: RegisterResolvedRemoteProjectBatchArgs): Promise<ResolvedRemoteProjectBatchResult> {
    const projectByPath = new Map(
        projects.map((project) => [project.projectFilePath, project]),
    );
    const outcomes: RemoteProjectRegistrationOutcome[] = [];
    const staleResults = new Map<string, AddProjectToListResult>();
    const repairGroups = new Map<string, ProjectEditorRepairRequest>();

    for (const [index, row] of rows.entries()) {
        const project = projectByPath.get(row.projectFilePath);
        const action = row.editorActions.find(
            (candidate) => candidate.id === row.editorActionId,
        );
        if (!project || !action) {
            if (project) {
                outcomes.push({
                    project,
                    originalName: row.godotName ?? project.name,
                    launcherName: row.name,
                    status: 'failed',
                    error: t('addProject.remote.errors.registration-failed'),
                });
                onOutcomesChange([...outcomes]);
            }
            onProgress(index + 1, rows.length);
            continue;
        }

        const options: AddProjectOptions = {
            ...getRemoteAddProjectOptions(
                codeEditorChoices[row.projectFilePath] ?? 'auto',
            ),
            ...action.options,
            name: row.name,
        };
        try {
            const result = await addProject(row.projectFilePath, options);
            if (result.importConflict || result.editorResolution) {
                staleResults.set(row.projectFilePath, result);
            } else if (result.success && result.newProject) {
                await handleAddProjectResult(
                    row.projectFilePath,
                    result,
                    options,
                );
                outcomes.push({
                    project,
                    originalName: row.godotName ?? project.name,
                    launcherName: row.name,
                    status: 'added',
                });
                if (action.download) {
                    const mono =
                        row.editorRequest?.flavor === 'dotnet' ||
                        row.editorResolution?.requested.flavor === 'dotnet';
                    const key = `${action.download.version}:${mono ? 'dotnet' : 'gdscript'}`;
                    const group = repairGroups.get(key);
                    if (group) {
                        group.projects.push(result.newProject);
                    } else {
                        repairGroups.set(key, {
                            release: action.download,
                            mono,
                            projects: [result.newProject],
                        });
                    }
                }
                onOutcomesChange([...outcomes]);
            } else {
                outcomes.push({
                    project,
                    originalName: row.godotName ?? project.name,
                    launcherName: row.name,
                    status: 'failed',
                    error:
                        result.error ??
                        t('addProject.remote.errors.registration-failed'),
                });
                onOutcomesChange([...outcomes]);
            }
        } catch {
            outcomes.push({
                project,
                originalName: row.godotName ?? project.name,
                launcherName: row.name,
                status: 'failed',
                error: t('addProject.remote.errors.registration-failed'),
            });
            onOutcomesChange([...outcomes]);
        }
        onProgress(index + 1, rows.length);
    }

    return {
        outcomes,
        staleResults,
        repairRequests: [...repairGroups.values()],
    };
}
