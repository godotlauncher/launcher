import type {
    TemplateMigrationProjectPlan,
    TemplateMigrationReview,
    TemplateProjectAssessment,
} from '@shared/contracts';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatTemplateBytes } from '../template-format.util';
import { migrationVersionName } from '../template-migration-choice.util';
import { migrationReviewGroups } from '../template-migration-review.util';
import {
    MigrationChoiceLabel,
    migrationChoiceTone,
} from './migration-choice-indicator.component';
import { MigrationChoiceSummary } from './migration-choice-summary.component';

/** Keeps the review instructions and selected actions above the version list.
 * @param props - Reviewed choices and projects that cannot be moved yet.
 */
export function MigrationReviewSummary({
    review,
    deferredProjects,
}: {
    review: TemplateMigrationReview | null;
    deferredProjects: TemplateProjectAssessment[];
}) {
    const { t } = useTranslation('exportTemplates');
    return (
        <div className="space-y-2">
            <p className="text-base-content/75">
                {t('wizardMigration.reviewIntro')}
            </p>
            <MigrationChoiceSummary
                choices={[
                    ...(review?.projects.flatMap((project) =>
                        project.versions.map((version) => version.choice),
                    ) ?? []),
                    ...deferredProjects.flatMap((project) =>
                        project.setIds.map(() => 'later' as const),
                    ),
                ]}
            />
        </div>
    );
}

/** Keeps required removal acknowledgement next to the fixed Move action.
 * @param props - Current acknowledgement and its session-owned update.
 */
export function MigrationRemovalConfirmation({
    confirmed,
    onConfirm,
}: {
    confirmed: boolean;
    onConfirm: (confirmed: boolean) => void;
}) {
    const { t } = useTranslation('exportTemplates');
    return (
        <label className="flex items-start gap-3 rounded-md border border-warning/25 bg-warning/5 p-3">
            <TriangleAlert
                className="mt-0.5 size-5 shrink-0 text-[color:var(--color-warning-readable)]"
                aria-hidden="true"
            />
            <input
                type="checkbox"
                className="checkbox checkbox-sm mt-0.5 shrink-0"
                checked={confirmed}
                onChange={(event) => onConfirm(event.target.checked)}
            />
            <span>{t('wizardMigration.confirmRemoval')}</span>
        </label>
    );
}

/** Shows project-wide effects once while preserving each version's exact file details.
 * @param props - Disposable review and unavailable projects.
 */
export function MigrationReviewStep({
    review,
    deferredProjects,
}: {
    review: TemplateMigrationReview | null;
    deferredProjects: TemplateProjectAssessment[];
}) {
    const { t } = useTranslation('exportTemplates');
    return (
        <div className="space-y-3">
            {!!review?.projects.length && (
                <div className="rounded-md border border-base-content/10">
                    <table className="w-full table-fixed text-base">
                        <thead className="sticky top-0 z-10 bg-base-200 text-left text-sm text-base-content/65">
                            <tr>
                                <th
                                    scope="col"
                                    className="w-[23%] px-3 py-2 font-medium"
                                >
                                    {t('wizardMigration.projectColumn')}
                                </th>
                                <th
                                    scope="col"
                                    className="w-[28%] px-3 py-2 font-medium"
                                >
                                    {t('wizardMigration.versionsColumn')}
                                </th>
                                <th
                                    scope="col"
                                    className="px-3 py-2 font-medium"
                                >
                                    {t('wizardMigration.effectsColumn')}
                                </th>
                            </tr>
                        </thead>
                        {review.projects.map((project) => (
                            <MigrationReviewProject
                                key={project.projectPath}
                                project={project}
                            />
                        ))}
                    </table>
                </div>
            )}
            {!!deferredProjects.length && (
                <section>
                    <h3 className="font-semibold">
                        {t('wizardMigration.laterProjects')}
                    </h3>
                    <ul className="mt-2 space-y-1">
                        {deferredProjects.map((project) => (
                            <li key={project.projectPath}>
                                <span className="font-medium">
                                    {project.name}
                                </span>
                                : {t(`migration.reasons.${project.reason}`)}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

/** Labels the decision scope and lists all versions affected by each reviewed action.
 * @param props - One reviewed project's choices and file details.
 */
function MigrationReviewProject({
    project,
}: {
    project: TemplateMigrationProjectPlan;
}) {
    const { t, i18n } = useTranslation('exportTemplates');
    const groups = migrationReviewGroups(project);
    return (
        <tbody>
            {groups.map((versions, index) => {
                const version = versions[0];
                return (
                    <tr
                        key={`${project.projectPath}:${version.setId}`}
                        className="border-t border-base-content/10 align-top"
                    >
                        {index === 0 && (
                            <th
                                scope="rowgroup"
                                rowSpan={groups.length}
                                className="break-words px-3 py-2 text-left font-normal"
                            >
                                <p className="font-semibold">{project.name}</p>
                                {project.versions.length > 1 && (
                                    <p className="mt-1 text-sm text-base-content/65">
                                        {t(
                                            project.selectionMode ===
                                                'per-version'
                                                ? 'wizardMigration.reviewScope.individual'
                                                : groups.length === 1
                                                  ? 'wizardMigration.allVersions'
                                                  : 'wizardMigration.reviewScope.differentEffects',
                                            { number: project.versions.length },
                                        )}
                                    </p>
                                )}
                            </th>
                        )}
                        <td className="break-words px-3 py-2">
                            <ul
                                aria-label={t(
                                    'wizardMigration.reviewVersions',
                                    { project: project.name },
                                )}
                                className="space-y-1"
                            >
                                {versions.map((item) => (
                                    <li
                                        key={item.setId}
                                        className="flex flex-wrap items-baseline gap-x-2"
                                    >
                                        <span>
                                            {migrationVersionName(item.setId)}
                                        </span>
                                        <span className="text-sm text-base-content/60">
                                            {t('wizardMigration.files', {
                                                number: item.fileCount,
                                            })}
                                            {' - '}
                                            {formatTemplateBytes(
                                                item.sizeBytes,
                                                i18n.language,
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </td>
                        <td className="px-3 py-2">
                            <MigrationChoiceLabel choice={version.choice} />
                            <ul className="mt-1 space-y-1 text-base-content/70">
                                <li>
                                    {t(
                                        `wizardMigration.reviewDetails.destination.${version.destination}`,
                                    )}
                                </li>
                                {version.sharedFiles === 'add-missing' && (
                                    <li>
                                        {t(
                                            'wizardMigration.reviewDetails.addMissing',
                                        )}
                                    </li>
                                )}
                                <li
                                    className={
                                        migrationChoiceTone[version.choice]
                                    }
                                >
                                    {t(
                                        `wizardMigration.reviewDetails.localFiles.${version.localFiles}`,
                                    )}
                                </li>
                            </ul>
                        </td>
                    </tr>
                );
            })}
        </tbody>
    );
}
