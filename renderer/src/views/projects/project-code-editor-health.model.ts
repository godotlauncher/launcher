import type { CodeEditorId, ProjectDetails } from '@shared/contracts';

export type CodeEditorProjectUsage = {
    count: number;
    dotnetCount: number;
};

export function getCodeEditorProjectUsage(
    projects: ProjectDetails[],
    integrationId: CodeEditorId,
): CodeEditorProjectUsage {
    const affectedProjects = projects.filter(
        (project) => project.codeEditorId === integrationId,
    );

    return {
        count: affectedProjects.length,
        dotnetCount: affectedProjects.filter((project) => project.release.mono)
            .length,
    };
}
