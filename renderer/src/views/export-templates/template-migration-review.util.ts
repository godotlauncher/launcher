import type {
    TemplateMigrationProjectPlan,
    TemplateMigrationVersionPlan,
} from '@shared/contracts';

/** Combines a project-wide choice only when every reviewed effect is the same.
 * Individual selections retain their own rows, including when their choices match.
 * @param project - Main-owned project review with exact per-version file details.
 */
export function migrationReviewGroups(
    project: TemplateMigrationProjectPlan,
): TemplateMigrationVersionPlan[][] {
    const first = project.versions[0];
    const sameEffects =
        first &&
        project.versions.every(
            (version) =>
                version.choice === first.choice &&
                version.destination === first.destination &&
                version.sharedFiles === first.sharedFiles &&
                version.localFiles === first.localFiles &&
                version.pending === first.pending,
        );
    return project.selectionMode === 'all-versions' && sameEffects
        ? [project.versions]
        : project.versions.map((version) => [version]);
}
