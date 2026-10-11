import type { TemplateMigrationReview } from '@shared/contracts';
import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatTemplateBytes } from '../template-format.util';
import { migrationVersionName } from '../template-migration-choice.util';
import { migrationResults } from '../template-migration-results.util';
import type { MigrationRun } from '../template-migration-wizard.types';
import { MigrationVersionStatus } from './migration-version-status.component';

/** Shows host-reported phases and completed versions without an invented percentage.
 * @param props - Exact reviewed versions and host-owned progress.
 */
export function MigrationMoveSummary({
    review,
    run,
}: {
    review: TemplateMigrationReview;
    run?: MigrationRun;
}) {
    const { t, i18n } = useTranslation('exportTemplates');
    const { finished, total, activeStatus, active } = migrationResults(
        review,
        run,
    );
    return (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <p role="status" className="flex items-center gap-2 font-medium">
                <LoaderCircle
                    className="size-5 animate-spin text-primary"
                    aria-hidden="true"
                />
                {activeStatus
                    ? t(`wizardMigration.status.${activeStatus}`)
                    : t('wizardMigration.titles.move')}
            </p>
            <p className="mt-2">
                {t('wizardMigration.progress', {
                    completed: finished,
                    total,
                })}
            </p>
            {active && (
                <p className="mt-2 break-words">
                    {
                        review.projects.find(
                            (project) =>
                                project.projectPath === active.projectPath,
                        )?.name
                    }{' '}
                    - {migrationVersionName(active.setId)}
                </p>
            )}
            {active?.progress && active.progress.totalBytes > 0 && (
                <p className="mt-2 text-sm">
                    {formatTemplateBytes(
                        active.progress.completedBytes,
                        i18n.language,
                    )}{' '}
                    /{' '}
                    {formatTemplateBytes(
                        active.progress.totalBytes,
                        i18n.language,
                    )}
                </p>
            )}
            <progress
                className="progress progress-primary mt-2 w-full"
                value={
                    active?.progress && active.progress.totalBytes > 0
                        ? Math.min(
                              active.progress.completedBytes,
                              active.progress.totalBytes,
                          )
                        : undefined
                }
                max={active?.progress?.totalBytes || 1}
                aria-label={
                    activeStatus
                        ? t(`wizardMigration.status.${activeStatus}`)
                        : t('wizardMigration.progressLabel')
                }
            />
            <p className="mt-2 text-base-content/70">
                {t('wizardMigration.keepOpen')}
            </p>
        </div>
    );
}

/** Lists version progress while the overall phase remains fixed above it.
 * @param props - Reviewed versions and host-owned progress.
 */
export function MigrationMoveStep({
    review,
    run,
}: {
    review: TemplateMigrationReview;
    run?: MigrationRun;
}) {
    return <MigrationVersionStatus review={review} run={run} />;
}
