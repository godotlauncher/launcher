import type { TemplateMigrationReview } from '@shared/contracts';
import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    migrationErrorKey,
    migrationVersionName,
} from '../template-migration-choice.util';
import type { MigrationRun } from '../template-migration-wizard.types';
import { MigrationChoiceLabel } from './migration-choice-indicator.component';

/** Keeps individual version outcomes visible, including failures beside successful versions.
 * @param props - Reviewed identities and actual host-owned progress or results.
 */
export function MigrationVersionStatus({
    review,
    run,
}: {
    review: TemplateMigrationReview;
    run?: MigrationRun;
}) {
    const { t } = useTranslation('exportTemplates');
    return (
        <ul
            aria-label={t('wizardMigration.results')}
            className="rounded-md border border-base-content/10"
        >
            {review.projects.map((project) => (
                <li
                    key={project.projectPath}
                    className="border-b border-base-content/10 p-3 last:border-0"
                >
                    <p className="font-semibold">{project.name}</p>
                    <ul className="mt-2 space-y-2">
                        {project.versions.map((version) => {
                            const result = run?.versions.find(
                                (item) =>
                                    item.projectPath === project.projectPath &&
                                    item.setId === version.setId,
                            );
                            const status =
                                version.choice === 'later'
                                    ? 'later'
                                    : (result?.status ??
                                      (run?.status === 'complete'
                                          ? 'error'
                                          : 'waiting'));
                            const working = ![
                                'waiting',
                                'complete',
                                'error',
                                'later',
                            ].includes(status);
                            return (
                                <li
                                    key={version.setId}
                                    className="rounded-md bg-base-200/40 px-3 py-2"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <p>
                                                {migrationVersionName(
                                                    version.setId,
                                                )}
                                            </p>
                                            <div className="text-sm">
                                                <MigrationChoiceLabel
                                                    choice={version.choice}
                                                />
                                            </div>
                                        </div>
                                        <span className="flex shrink-0 items-center gap-2">
                                            {status === 'complete' && (
                                                <CircleCheck
                                                    size={17}
                                                    className="text-success-content dark:text-success"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            {status === 'error' && (
                                                <TriangleAlert
                                                    size={17}
                                                    className="text-[color:var(--color-warning-readable)]"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            {working && (
                                                <LoaderCircle
                                                    size={17}
                                                    className="animate-spin text-primary"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            {t(
                                                `wizardMigration.status.${status}`,
                                            )}
                                        </span>
                                    </div>
                                    {status === 'error' && (
                                        <p className="mt-1 text-base-content/70">
                                            {t(
                                                migrationErrorKey(
                                                    result?.error,
                                                ),
                                            )}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </li>
            ))}
        </ul>
    );
}
