import type {
    AddProjectOptions,
    AddProjectToListResult,
    ProjectDetails,
} from '@shared/contracts';
import type { ProjectEditorRepairRequest } from '../../hooks/useProjects';
import type { LocalImportRow } from './local-import-editor.model';
import type {
    RemoteProjectEditorCandidate,
    RemoteProjectEditorPlanGroup,
} from './remote-project-editor-plan.model';
import {
    getProjectDirectoryFromFilePath,
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

type RegisterRemoteProjectBatchArgs = {
    selectedProjects: RemoteProjectRegistrationOutcome['project'][];
    existingProjects: ProjectDetails[];
    codeEditorChoices: Record<string, RemoteProjectCodeEditorChoice>;
    platform?: string;
    addProject: AddProject;
    handleAddProjectResult: HandleAddProjectResult;
    t: Translate;
    onProgress: (current: number, total: number) => void;
    onOutcomesChange: (outcomes: RemoteProjectRegistrationOutcome[]) => void;
};

export type RemoteProjectRegistrationBatchResult = {
    outcomes: RemoteProjectRegistrationOutcome[];
    editorCandidates: RemoteProjectEditorCandidate[];
};

type ApplyRemoteProjectEditorPlanArgs = {
    plan: RemoteProjectEditorPlanGroup[];
    addProject: AddProject;
    handleAddProjectResult: HandleAddProjectResult;
    t: Translate;
    onProgress: (current: number, total: number) => void;
};

export type RemoteProjectEditorPlanResult = {
    outcomes: RemoteProjectRegistrationOutcome[];
    repairRequests: ProjectEditorRepairRequest[];
};

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

/**
 * Normalises a project path for renderer-side duplicate preflight.
 *
 * @param value - Project directory path.
 * @param platform - Current operating-system platform.
 * @returns Comparable project path.
 */
function normaliseProjectPath(value: string, platform?: string): string {
    const normalised = value.replace(/\\/g, '/').replace(/\/+$/, '');
    return platform === 'win32' ? normalised.toLocaleLowerCase() : normalised;
}

/**
 * Checks and registers selected remote projects in discovery order.
 *
 * @param args - Projects, dependencies, and progress callbacks.
 * @returns Registration outcomes and projects needing editor resolution.
 */
export async function registerRemoteProjectBatch({
    selectedProjects,
    existingProjects,
    codeEditorChoices,
    platform,
    addProject,
    handleAddProjectResult,
    t,
    onProgress,
    onOutcomesChange,
}: RegisterRemoteProjectBatchArgs): Promise<RemoteProjectRegistrationBatchResult> {
    const knownNames = new Set(existingProjects.map((project) => project.name));
    const knownPaths = new Set(
        existingProjects.map((project) =>
            normaliseProjectPath(project.path, platform),
        ),
    );
    const outcomes: RemoteProjectRegistrationOutcome[] = [];
    const editorCandidates: RemoteProjectEditorCandidate[] = [];

    for (let index = 0; index < selectedProjects.length; index++) {
        const project = selectedProjects[index];
        onProgress(index + 1, selectedProjects.length);
        const projectDirectory = getProjectDirectoryFromFilePath(
            project.projectFilePath,
        );
        const normalisedDirectory = normaliseProjectPath(
            projectDirectory,
            platform,
        );
        let outcome: RemoteProjectRegistrationOutcome;

        if (
            knownNames.has(project.name) ||
            knownPaths.has(normalisedDirectory)
        ) {
            outcome = {
                project,
                originalName: project.name,
                launcherName: project.name,
                status: 'skipped',
                error: t('addProject.remote.registration.alreadyAdded'),
            };
        } else {
            try {
                const options = {
                    ...getRemoteAddProjectOptions(
                        codeEditorChoices[project.projectFilePath] ?? 'auto',
                    ),
                    name: project.name,
                };
                const result = await addProject(
                    project.projectFilePath,
                    options,
                );

                if (result.editorResolution) {
                    editorCandidates.push({ project, result, options });
                    knownNames.add(project.name);
                    knownPaths.add(normalisedDirectory);
                    continue;
                }

                if (result.success) {
                    await handleAddProjectResult(
                        project.projectFilePath,
                        result,
                        options,
                    );
                    outcome = {
                        project,
                        originalName: project.name,
                        launcherName: project.name,
                        status: 'added',
                    };
                    knownNames.add(project.name);
                    knownPaths.add(normalisedDirectory);
                } else {
                    outcome = {
                        project,
                        originalName: project.name,
                        launcherName: project.name,
                        status: 'failed',
                        error:
                            result.error ??
                            t('addProject.remote.errors.registration-failed'),
                    };
                }
            } catch {
                outcome = {
                    project,
                    originalName: project.name,
                    launcherName: project.name,
                    status: 'failed',
                    error: t('addProject.remote.errors.registration-failed'),
                };
            }
        }
        outcomes.push(outcome);
        onOutcomesChange([...outcomes]);
    }

    return { outcomes, editorCandidates };
}

/**
 * Applies editor-resolution choices and registers the remaining projects.
 *
 * @param args - Editor plan, registration dependencies, and progress callback.
 * @returns Registration outcomes and queued editor-repair requests.
 */
export async function applyRemoteProjectEditorPlan({
    plan,
    addProject,
    handleAddProjectResult,
    t,
    onProgress,
}: ApplyRemoteProjectEditorPlanArgs): Promise<RemoteProjectEditorPlanResult> {
    const projectCount = plan.reduce(
        (count, group) => count + group.candidates.length,
        0,
    );
    let processedProjects = 0;
    const outcomes: RemoteProjectRegistrationOutcome[] = [];
    const repairRequests: ProjectEditorRepairRequest[] = [];

    for (const group of plan) {
        const selectedChoice = group.choices?.find(
            (choice) => choice.id === group.choice,
        );
        const registeredProjects: ProjectEditorRepairRequest['projects'] = [];
        for (const candidate of group.candidates) {
            const resolutionOptions: AddProjectOptions =
                selectedChoice?.installed
                    ? {
                          ...candidate.options,
                          resolution: 'use_selected',
                          editorChoiceId: selectedChoice.id,
                      }
                    : group.choice === 'use-fallback' && group.fallback
                      ? {
                            ...candidate.options,
                            resolution: 'use_fallback',
                            release: group.fallback,
                        }
                      : {
                            ...candidate.options,
                            resolution: 'add_missing',
                            ...(selectedChoice?.release
                                ? { editorChoiceId: selectedChoice.id }
                                : {}),
                        };
            try {
                const result = await addProject(
                    candidate.project.projectFilePath,
                    resolutionOptions,
                );
                if (result.success && result.newProject) {
                    await handleAddProjectResult(
                        candidate.project.projectFilePath,
                        result,
                        resolutionOptions,
                    );
                    registeredProjects.push(result.newProject);
                    outcomes.push({
                        project: candidate.project,
                        originalName: candidate.project.name,
                        launcherName:
                            resolutionOptions.name ?? candidate.project.name,
                        status: 'added',
                    });
                } else {
                    outcomes.push({
                        project: candidate.project,
                        originalName: candidate.project.name,
                        launcherName:
                            resolutionOptions.name ?? candidate.project.name,
                        status: 'failed',
                        error:
                            result.error ??
                            t('addProject.remote.errors.registration-failed'),
                    });
                }
            } catch {
                outcomes.push({
                    project: candidate.project,
                    originalName: candidate.project.name,
                    launcherName:
                        resolutionOptions.name ?? candidate.project.name,
                    status: 'failed',
                    error: t('addProject.remote.errors.registration-failed'),
                });
            }
            processedProjects += 1;
            onProgress(processedProjects, projectCount);
        }

        const repairRelease =
            selectedChoice?.release ??
            (group.choice === 'download'
                ? group.downloadableRelease
                : undefined);
        if (repairRelease && registeredProjects.length > 0) {
            repairRequests.push({
                release: repairRelease,
                mono: group.mono,
                projects: registeredProjects,
            });
        }
    }

    return { outcomes, repairRequests };
}
