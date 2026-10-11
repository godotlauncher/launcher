import type {
    TemplateMigrationAssessment,
    TemplateMigrationProjectDecision,
    TemplateMigrationReview,
    TemplateProjectAssessment,
} from '@shared/contracts';
import type { MigrationReviewActions } from '../../../renderer/src/views/export-templates/template-migration-wizard.types';

const names = [
    'Night Garden',
    'Platformer',
    'Prototype .NET',
    'Puzzle Game',
    'Space Explorer',
    'Racing Game',
    'Card Game',
    'Mobile Demo',
    'Web Demo',
    'Tools Project',
    'Archive Project',
    'Custom Build',
];

/** Creates twelve sample projects without inspecting any local files. */
export function migrationFixtureAssessment(): TemplateMigrationAssessment {
    const projects: TemplateProjectAssessment[] = names.map((name, index) => ({
        projectPath: `sample-project-${index}`,
        name,
        version: '4.4-stable',
        edition: index === 2 ? 'dotnet' : index === 11 ? 'custom' : 'standard',
        state: index >= 10 ? 'unavailable' : 'needs-review',
        reason:
            index === 10
                ? 'missing-project'
                : index === 11
                  ? 'custom-editor'
                  : 'unverified-files',
        pending: true,
        compared: false,
        provenance: 'unverified',
        setIds:
            index === 0
                ? ['4.3.stable', '4.4.stable', '4.4.stable.mono']
                : [index === 2 ? '4.4.stable.mono' : '4.4.stable'],
        metadata: [],
        unexpected: [],
    }));
    return { projects, pendingCount: projects.length, recoveryIds: [] };
}

/** Changes sample discovery while keeping recognised project identities stable.
 * @param assessment - Current sample discovery to refresh.
 */
export function migrationFixtureChangedAssessment(
    assessment: TemplateMigrationAssessment,
): TemplateMigrationAssessment {
    const example = migrationFixtureAssessment().projects[1];
    const projects = assessment.projects
        .filter((project) => project.projectPath !== example.projectPath)
        .map((project) =>
            project.projectPath === 'sample-project-0'
                ? {
                      ...project,
                      setIds: [...new Set([...project.setIds, '4.5.stable'])],
                  }
                : project,
        );
    if (
        !projects.some(
            (project) => project.projectPath === 'sample-project-new',
        )
    ) {
        projects.push({
            ...example,
            projectPath: 'sample-project-new',
            name: 'New Sample Project',
        });
    }
    return { ...assessment, projects, pendingCount: projects.length };
}

/** Mimics the read-only review boundary for the development UI only.
 * @param assessment - Sample projects whose version identities are expanded.
 */
export function migrationFixtureReview(
    assessment: TemplateMigrationAssessment,
): MigrationReviewActions {
    let currentToken: string | undefined;
    return {
        /** Expands exactly the requested versions without file operations.
         * @param decisions - All sample project and version decisions.
         */
        async review(
            decisions: TemplateMigrationProjectDecision[],
        ): Promise<TemplateMigrationReview> {
            currentToken = crypto.randomUUID();
            const projects = decisions.map((decision) => {
                const project = assessment.projects.find(
                    (item) => item.projectPath === decision.projectPath,
                );
                if (!project) throw new Error('exportTemplates:errors.changed');
                return {
                    projectPath: project.projectPath,
                    name: project.name,
                    selectionMode: decision.selection.mode,
                    versions: project.setIds.map((setId) => {
                        const choice =
                            decision.selection.mode === 'all-versions'
                                ? decision.selection.choice
                                : decision.selection.choices[setId];
                        return {
                            setId,
                            choice,
                            fileCount: 2,
                            sizeBytes: 4096,
                            destination:
                                choice === 'save-imported'
                                    ? ('imported' as const)
                                    : choice === 'later'
                                      ? ('local' as const)
                                      : ('shared' as const),
                            sharedFiles:
                                choice === 'share-project'
                                    ? ('add-missing' as const)
                                    : ('unchanged' as const),
                            localFiles:
                                choice === 'later'
                                    ? ('keep' as const)
                                    : choice === 'save-imported'
                                      ? ('remove-after-verification' as const)
                                      : ('remove-after-connection' as const),
                            pending: choice === 'later',
                        };
                    }),
                };
            });
            return {
                token: currentToken,
                projects,
                requiresRemovalConfirmation: projects.some((project) =>
                    project.versions.some((version) =>
                        ['share-project', 'use-shared'].includes(
                            version.choice,
                        ),
                    ),
                ),
            };
        },
        /** Drops a closed sample review without touching any files.
         * @param token - Sample review to release.
         */
        async discard(token: string) {
            if (currentToken === token) currentToken = undefined;
        },
    };
}
