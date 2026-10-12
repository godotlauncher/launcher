import type { TemplateMigrationReview } from '@shared/contracts';
import type {
    MigrationRun,
    MigrationVersionIdentity,
} from './template-migration-wizard.types';

/** Resolves outcomes against reviewed identities, ignoring unrelated host results.
 * @param review - Exact choices submitted by the user.
 * @param run - Host-owned progress or final results.
 */
export function migrationResults(
    review: TemplateMigrationReview,
    run?: MigrationRun,
) {
    const completed: MigrationVersionIdentity[] = [];
    const failed: MigrationVersionIdentity[] = [];
    let later = 0;
    let finished = 0;
    for (const project of review.projects)
        for (const version of project.versions) {
            if (version.choice === 'later') {
                later++;
                continue;
            }
            const identity = {
                projectPath: project.projectPath,
                setId: version.setId,
            };
            const result = run?.versions.find(
                (item) =>
                    item.projectPath === identity.projectPath &&
                    item.setId === identity.setId,
            );
            if (result?.status === 'complete') completed.push(identity);
            else failed.push(identity);
            if (result?.status === 'complete' || result?.status === 'error')
                finished++;
        }
    const active = run?.versions.find(
        (version) =>
            !['waiting', 'complete', 'error', 'later'].includes(
                version.status,
            ) &&
            review.projects.some(
                (project) =>
                    project.projectPath === version.projectPath &&
                    project.versions.some(
                        (item) =>
                            item.setId === version.setId &&
                            item.choice !== 'later',
                    ),
            ),
    );
    return {
        completed,
        failed,
        later,
        finished,
        total: completed.length + failed.length,
        activeStatus: active?.status,
        active,
    };
}
