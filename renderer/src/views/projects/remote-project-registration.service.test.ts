import type {
    AddProjectToListResult,
    ProjectDetails,
    ReleaseSummary,
    RemoteDiscoveredProject,
} from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteProjectEditorPlanGroup } from './remote-project-editor-plan.model';
import {
    applyRemoteProjectEditorPlan,
    registerRemoteProjectBatch,
} from './remote-project-registration.service';

/**
 * Creates one discovered project for registration service tests.
 *
 * @param name - Project display name.
 * @param directory - Absolute project directory.
 * @returns Discovered remote project.
 */
function createDiscoveredProject(
    name: string,
    directory: string,
): RemoteDiscoveredProject {
    return {
        name,
        relativePath: name.toLowerCase(),
        projectFilePath: `${directory}/project.godot`,
        detectedEditor: null,
    };
}

describe('remote project registration service', () => {
    it('skips existing projects and registers remaining projects in order', async () => {
        const existing = createDiscoveredProject(
            'Existing',
            'C:/Repo/Existing',
        );
        const added = createDiscoveredProject('Added', 'C:/Repo/Added');
        const addProject = vi.fn().mockResolvedValue({ success: true });
        const handleAddProjectResult = vi.fn().mockResolvedValue(true);
        const onProgress = vi.fn();
        const onOutcomesChange = vi.fn();

        const result = await registerRemoteProjectBatch({
            selectedProjects: [existing, added],
            existingProjects: [
                {
                    name: 'Existing',
                    path: 'c:\\repo\\existing\\',
                } as ProjectDetails,
            ],
            codeEditorChoices: {},
            platform: 'win32',
            addProject,
            handleAddProjectResult,
            t: (key) => key,
            onProgress,
            onOutcomesChange,
        });

        expect(result.outcomes.map(({ status }) => status)).toEqual([
            'skipped',
            'added',
        ]);
        expect(addProject).toHaveBeenCalledOnce();
        expect(addProject).toHaveBeenCalledWith(added.projectFilePath, {});
        expect(handleAddProjectResult).toHaveBeenCalledOnce();
        expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
        expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
        expect(onOutcomesChange).toHaveBeenCalledTimes(2);
    });

    it('collects editor-resolution candidates with their code-editor choice', async () => {
        const project = createDiscoveredProject('Game', '/repo/game');
        const editorResult: AddProjectToListResult = {
            success: false,
            editorResolution: {
                requested: {
                    kind: 'stable-base',
                    channel: 'official',
                    flavor: 'gdscript',
                    base_version: '4.4',
                },
                downloadable: {
                    match: 'stable-base',
                    base_version: '4.4',
                    flavor: 'gdscript',
                },
            },
        };
        const addProject = vi.fn().mockResolvedValue(editorResult);

        const result = await registerRemoteProjectBatch({
            selectedProjects: [project],
            existingProjects: [],
            codeEditorChoices: { [project.projectFilePath]: 'vscode' },
            addProject,
            handleAddProjectResult: vi.fn(),
            t: (key) => key,
            onProgress: vi.fn(),
            onOutcomesChange: vi.fn(),
        });

        expect(result.outcomes).toEqual([]);
        expect(result.editorCandidates).toHaveLength(1);
        expect(result.editorCandidates[0].options).toEqual({
            codeEditorId: 'vscode',
        });
    });

    it('queues repairs only for successfully registered download groups', async () => {
        const project = createDiscoveredProject('Game', '/repo/game');
        const release = {
            version: '4.4.3-stable',
        } as ReleaseSummary;
        const registeredProject = {
            name: 'Game',
            path: '/repo/game',
        } as ProjectDetails;
        const plan: RemoteProjectEditorPlanGroup[] = [
            {
                key: '4.4',
                version: '4.4.3-stable',
                mono: false,
                candidates: [
                    {
                        project,
                        result: { success: false },
                        options: { codeEditorId: null },
                    },
                ],
                downloadableRelease: release,
                choice: 'download',
            },
        ];
        const addProject = vi.fn().mockResolvedValue({
            success: true,
            newProject: registeredProject,
        });
        const handleAddProjectResult = vi.fn().mockResolvedValue(true);

        const result = await applyRemoteProjectEditorPlan({
            plan,
            addProject,
            handleAddProjectResult,
            t: (key) => key,
            onProgress: vi.fn(),
        });

        expect(result.outcomes).toEqual([{ project, status: 'added' }]);
        expect(result.repairRequests).toEqual([
            {
                release,
                mono: false,
                projects: [registeredProject],
            },
        ]);
        expect(addProject).toHaveBeenCalledWith(project.projectFilePath, {
            codeEditorId: null,
            resolution: 'add_missing',
        });
    });
});
