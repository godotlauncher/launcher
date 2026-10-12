import type {
    TemplateMigrationAssessment,
    TemplateMigrationProjectDecision,
    TemplateMigrationReview,
    TemplateMigrationRun,
    TemplateMigrationVersionIdentity,
} from '@shared/contracts';
import { canChooseMigration } from './template-migration-choice.util';

/** Identifies one version without conflating projects with similar paths.
 * @param version - Exact project and version identity.
 */
function identity(version: TemplateMigrationVersionIdentity): string {
    return JSON.stringify([version.projectPath, version.setId]);
}

/** Prepares a new review for failed versions, leaving every other local version for later.
 * @param review - Effects of the earlier reviewed batch.
 * @param failed - Exact failed identities selected for retry.
 * @param assessment - Fresh main-owned discovery after the earlier run and recovery.
 */
export function migrationRetryDecisions(
    review: TemplateMigrationReview,
    failed: TemplateMigrationVersionIdentity[],
    assessment: TemplateMigrationAssessment,
): TemplateMigrationProjectDecision[] {
    if (assessment.recoveryIds.length)
        throw new Error('exportTemplates:errors.recovery');
    const requested = new Set(failed.map(identity));
    if (!requested.size || requested.size !== failed.length)
        throw new Error('exportTemplates:errors.changed');
    const decisions: TemplateMigrationProjectDecision[] = [];
    for (const original of review.projects) {
        const selected = original.versions.filter((version) =>
            requested.has(
                identity({
                    projectPath: original.projectPath,
                    setId: version.setId,
                }),
            ),
        );
        if (!selected.length) continue;
        const project = assessment.projects.find(
            (item) => item.projectPath === original.projectPath,
        );
        if (
            !project ||
            !canChooseMigration(project) ||
            selected.some(
                (version) =>
                    version.choice === 'later' ||
                    !project.setIds.includes(version.setId),
            )
        )
            throw new Error('exportTemplates:errors.changed');
        decisions.push({
            projectPath: project.projectPath,
            selection: {
                mode: 'per-version',
                choices: Object.fromEntries(
                    project.setIds.map((setId) => [
                        setId,
                        selected.find((version) => version.setId === setId)
                            ?.choice ?? 'later',
                    ]),
                ),
            },
        });
        for (const version of selected)
            requested.delete(
                identity({
                    projectPath: project.projectPath,
                    setId: version.setId,
                }),
            );
    }
    if (requested.size) throw new Error('exportTemplates:errors.changed');
    return decisions;
}

/** Retains earlier successful outcomes when a retry includes other versions as Later.
 * @param previous - Earlier batch results in this wizard session.
 * @param next - Real progress from the next main-owned job.
 */
export function mergeMigrationRuns(
    previous: TemplateMigrationRun | undefined,
    next: TemplateMigrationRun,
): TemplateMigrationRun {
    const versions = new Map(
        previous?.versions.map((version) => [identity(version), version]),
    );
    for (const version of next.versions) {
        const key = identity(version);
        if (version.status === 'later' && versions.has(key)) continue;
        versions.set(key, version);
    }
    return { ...next, versions: [...versions.values()] };
}

/** Keeps the full results list while updating effects explicitly reviewed for a retry.
 * @param previous - Original batch shown on Move and Done.
 * @param next - Fresh retry review shown before any new operation.
 */
export function mergeMigrationReviews(
    previous: TemplateMigrationReview,
    next: TemplateMigrationReview,
): TemplateMigrationReview {
    const projects = structuredClone(previous.projects);
    for (const project of next.projects) {
        const original = projects.find(
            (item) => item.projectPath === project.projectPath,
        );
        if (!original) {
            projects.push(project);
            continue;
        }
        for (const version of project.versions) {
            const index = original.versions.findIndex(
                (item) => item.setId === version.setId,
            );
            if (index < 0) original.versions.push(version);
            else if (version.choice !== 'later')
                original.versions[index] = version;
        }
    }
    return { ...next, projects };
}
