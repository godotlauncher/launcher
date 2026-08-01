import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    ProjectDetails,
} from '@shared/contracts';

export type CodeEditorProjectUsage = {
    count: number;
    dotnetCount: number;
};

export type UnavailableCodeEditorUsage = CodeEditorProjectUsage & {
    settings: CodeEditorIntegrationSettings;
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

export function getUnavailableCodeEditorUsage(
    projects: ProjectDetails[],
    settings: CodeEditorIntegrationSettings[],
): UnavailableCodeEditorUsage[] {
    return settings
        .filter((integrationSettings) => !integrationSettings.installation)
        .map((integrationSettings) => ({
            settings: integrationSettings,
            ...getCodeEditorProjectUsage(
                projects,
                integrationSettings.integration.id,
            ),
        }))
        .filter(({ count }) => count > 0);
}
