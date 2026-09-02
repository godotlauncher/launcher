import type {
    AddProjectOptions,
    AddProjectToListResult,
    ProjectDetails,
} from '@shared/contracts';
import type { ProjectEditorRepairRequest } from '../../hooks/useProjects';
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
                status: 'skipped',
                error: t('addProject.remote.registration.alreadyAdded'),
            };
        } else {
            try {
                const options = getRemoteAddProjectOptions(
                    codeEditorChoices[project.projectFilePath] ?? 'auto',
                );
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
                    outcome = { project, status: 'added' };
                    knownNames.add(project.name);
                    knownPaths.add(normalisedDirectory);
                } else {
                    outcome = {
                        project,
                        status: 'failed',
                        error:
                            result.error ??
                            t('addProject.remote.errors.registration-failed'),
                    };
                }
            } catch {
                outcome = {
                    project,
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
        const registeredProjects: ProjectEditorRepairRequest['projects'] = [];
        for (const candidate of group.candidates) {
            const resolutionOptions: AddProjectOptions =
                group.choice === 'use-fallback' && group.fallback
                    ? {
                          ...candidate.options,
                          resolution: 'use_fallback',
                          release: group.fallback,
                      }
                    : {
                          ...candidate.options,
                          resolution: 'add_missing',
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
                        status: 'added',
                    });
                } else {
                    outcomes.push({
                        project: candidate.project,
                        status: 'failed',
                        error:
                            result.error ??
                            t('addProject.remote.errors.registration-failed'),
                    });
                }
            } catch {
                outcomes.push({
                    project: candidate.project,
                    status: 'failed',
                    error: t('addProject.remote.errors.registration-failed'),
                });
            }
            processedProjects += 1;
            onProgress(processedProjects, projectCount);
        }

        if (
            group.choice === 'download' &&
            group.downloadableRelease &&
            registeredProjects.length > 0
        ) {
            repairRequests.push({
                release: group.downloadableRelease,
                mono: group.mono,
                projects: registeredProjects,
            });
        }
    }

    return { outcomes, repairRequests };
}
