import type {
    TemplateMigrationReview,
    TemplateProjectAssessment,
} from '@shared/contracts';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { migrationResults } from '../template-migration-results.util';
import type { MigrationRun } from '../template-migration-wizard.types';
import { MigrationVersionStatus } from './migration-version-status.component';

type DoneProps = {
    review: TemplateMigrationReview;
    run?: MigrationRun;
    deferredProjects: TemplateProjectAssessment[];
};

/** Keeps outcome counts visible above the scrolling results.
 * @param props - Reviewed versions, host results and deferred projects.
 */
export function MigrationDoneSummary({
    review,
    run,
    deferredProjects,
}: DoneProps) {
    const { t } = useTranslation('exportTemplates');
    const {
        completed,
        failed,
        later: deferredVersions,
    } = migrationResults(review, run);
    const later = deferredProjects.reduce(
        (total, project) => total + project.setIds.length,
        deferredVersions,
    );
    return (
        <div
            className={`flex items-start gap-3 rounded-md border p-3 ${failed.length ? 'border-warning/25 bg-warning/5' : 'border-success/25 bg-success/5'}`}
        >
            {failed.length ? (
                <TriangleAlert
                    className="size-6 shrink-0 text-[color:var(--color-warning-readable)]"
                    aria-hidden="true"
                />
            ) : (
                <CircleCheck
                    className="size-6 shrink-0 text-success-content dark:text-success"
                    aria-hidden="true"
                />
            )}
            <div>
                <h3 className="font-semibold">
                    {t(
                        failed.length
                            ? 'wizardMigration.partial'
                            : 'wizardMigration.success',
                    )}
                </h3>
                <p className="mt-1">
                    {t('wizardMigration.resultSummary', {
                        completed: completed.length,
                        failed: failed.length,
                        later,
                    })}
                </p>
                <p className="mt-2 text-base-content/70">
                    {t('wizardMigration.resultNote')}
                </p>
            </div>
        </div>
    );
}

/** Lists individual results without placing recovery actions below them.
 * @param props - Reviewed versions, host results and deferred projects.
 */
export function MigrationDoneStep({
    review,
    run,
    deferredProjects,
}: DoneProps) {
    const { t } = useTranslation('exportTemplates');
    return (
        <div className="space-y-3">
            <MigrationVersionStatus review={review} run={run} />
            {!!deferredProjects.length && (
                <section>
                    <h3 className="font-semibold">
                        {t('wizardMigration.laterProjects')}
                    </h3>
                    <ul className="mt-2 space-y-1">
                        {deferredProjects.map((project) => (
                            <li key={project.projectPath}>
                                {project.name}:{' '}
                                {t(`migration.reasons.${project.reason}`)}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
