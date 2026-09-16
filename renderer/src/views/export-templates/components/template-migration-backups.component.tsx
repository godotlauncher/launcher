import type { TemplateMigrationAssessment } from '@shared/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportTemplatesBridge } from '../../../renderer.bridge';
import { formatTemplateBytes } from '../template-format.util';

/** Shows retained originals and requires explicit restore or cleanup confirmation.
 * @param props - Backups, availability and the parent action runner.
 */
export function TemplateMigrationBackups({
    assessment,
    disabled,
    run,
}: {
    assessment: TemplateMigrationAssessment;
    disabled: boolean;
    run: (action: () => Promise<unknown>) => Promise<void>;
}) {
    const { t, i18n } = useTranslation('exportTemplates');
    const [action, setAction] = useState<{
        id: string;
        restore: boolean;
    } | null>(null);
    if (!assessment.backups?.length) return null;
    return (
        <details className="mt-4 border-t border-base-content/15 pt-3">
            <summary className="cursor-pointer text-sm">
                {t('migration.backups')} ({assessment.backups.length})
            </summary>
            <ul className="divide-y divide-base-content/10">
                {assessment.backups.map((backup) => (
                    <li key={backup.id} className="space-y-2 py-3 text-sm">
                        <p className="break-words font-semibold">
                            {backup.projectName}{' '}
                            <span className="font-normal text-base-content/60">
                                {formatTemplateBytes(
                                    backup.sizeBytes,
                                    i18n.language,
                                )}
                            </span>
                        </p>
                        {action?.id === backup.id ? (
                            <>
                                <p>
                                    {t(
                                        action.restore
                                            ? 'migration.restoreDetail'
                                            : 'migration.discardDetail',
                                    )}
                                </p>
                                {action.restore && !!backup.sets.length && (
                                    <>
                                        <p className="break-words">
                                            {backup.sets.join(', ')}
                                        </p>
                                        <p className="text-xs text-base-content/60">
                                            {t('migration.affected')}:{' '}
                                            {assessment.projects
                                                .filter(
                                                    (project) =>
                                                        project.connection ===
                                                            'shared' &&
                                                        project.projectPath !==
                                                            backup.projectPath,
                                                )
                                                .map((project) => project.name)
                                                .join(', ') ||
                                                t('migration.noAffected')}
                                        </p>
                                    </>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${action.restore ? 'btn-primary' : 'btn-error'}`}
                                        disabled={disabled}
                                        onClick={() =>
                                            void run(async () => {
                                                if (action.restore)
                                                    await exportTemplatesBridge.restoreMigration(
                                                        backup.id,
                                                    );
                                                else
                                                    await exportTemplatesBridge.discardMigrationBackup(
                                                        backup.id,
                                                    );
                                                setAction(null);
                                            })
                                        }
                                    >
                                        {t(
                                            action.restore
                                                ? 'migration.restore'
                                                : 'migration.discard',
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        disabled={disabled}
                                        onClick={() => setAction(null)}
                                    >
                                        {t('cancel')}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    disabled={disabled}
                                    onClick={() =>
                                        setAction({
                                            id: backup.id,
                                            restore: true,
                                        })
                                    }
                                >
                                    {t('migration.restore')}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    disabled={disabled}
                                    onClick={() =>
                                        setAction({
                                            id: backup.id,
                                            restore: false,
                                        })
                                    }
                                >
                                    {t('migration.discard')}
                                </button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </details>
    );
}
