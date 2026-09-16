import type { TemplateReview } from '@shared/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTemplateBytes } from '../template-format.util';

type TemplateReviewProps = {
    review: TemplateReview;
    pending: boolean;
    onApply: (decisions: Record<string, 'shared' | 'incoming'>) => void;
};
/** Owns conflict choices and confirmation for one prepared job.
 * @param props - Prepared review, availability and apply action.
 */
export function TemplateReviewPanel({
    review,
    pending,
    onApply,
}: TemplateReviewProps) {
    const { t, i18n } = useTranslation('exportTemplates');
    const [decisions, setDecisions] = useState<
        Record<string, 'shared' | 'incoming'>
    >({});
    /** Formats review file sizes.
     * @param value - File size in bytes.
     */
    const bytes = (value: number) => formatTemplateBytes(value, i18n.language);
    const useShared = review.migrationChoice === 'use-shared';
    const required =
        review.requiredDecisions ??
        review.conflicts.map((conflict) => conflict.path);
    const localOnly = (review.files ?? []).filter(
        (file) => file.state === 'local-only' && required.includes(file.path),
    );
    return (
        <section
            className={`flex flex-col gap-3 border-t border-base-content/15 pt-3 ${review.migrationChoice ? 'text-sm' : ''}`}
            aria-label={t('review')}
        >
            <h2 className="text-lg font-semibold">{t('review')}</h2>
            {!review.migrationChoice && review.projectName && (
                <p>{review.projectName}</p>
            )}
            <p>
                {review.sets.join(', ')} · {bytes(review.sizeBytes)}
            </p>
            {review.migrationChoice && (
                <p>
                    {t(
                        useShared
                            ? 'migration.useSharedReview'
                            : 'migration.shareReview',
                    )}
                </p>
            )}
            {review.retainsBackup && (
                <p className="text-sm text-base-content/70">
                    {t('migration.backupNotice')}
                </p>
            )}
            {review.migrationChoice === 'share-project' && (
                <p className="text-sm break-words">
                    {t('migration.affected')}:{' '}
                    {review.affectedProjects?.join(', ') ||
                        t('migration.noAffected')}
                </p>
            )}
            {!useShared && (
                <p>
                    {t('mergeSummary', {
                        added: review.addedFiles,
                        identical: review.identicalFiles,
                    })}
                </p>
            )}
            {useShared && !!review.files?.length && (
                <details>
                    <summary className="cursor-pointer text-sm">
                        {t('migration.comparison')}
                    </summary>
                    <ul className="max-h-64 space-y-2 overflow-auto text-sm">
                        {review.files.map((file) => (
                            <li
                                key={file.path}
                                className="rounded-field bg-base-200 p-2"
                            >
                                <p className="break-all">{file.path}</p>
                                <p className="text-base-content/65">
                                    {t(`migration.files.${file.state}`)}
                                    {file.localBytes !== undefined &&
                                        ` - ${t('migration.projectFiles')}: ${bytes(file.localBytes)}`}
                                    {file.sharedBytes !== undefined &&
                                        ` - ${t('shared')}: ${bytes(file.sharedBytes)}`}
                                </p>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            {!useShared && !!review.conflicts.length && (
                <>
                    <p>{t('conflicts')}</p>
                    <div className="max-h-72 space-y-3 overflow-auto">
                        {review.conflicts.map((conflict) => (
                            <label
                                key={conflict.path}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-base-200 p-3"
                            >
                                <span className="min-w-0 break-all">
                                    {conflict.path}
                                    <span className="block text-sm text-base-content/70">
                                        {t('shared')}:{' '}
                                        {bytes(conflict.sharedBytes)} ·{' '}
                                        {t('incoming')}:{' '}
                                        {bytes(conflict.incomingBytes)}
                                    </span>
                                </span>
                                <select
                                    className="select"
                                    value={decisions[conflict.path] ?? ''}
                                    onChange={(event) =>
                                        setDecisions({
                                            ...decisions,
                                            [conflict.path]: event.target
                                                .value as 'shared' | 'incoming',
                                        })
                                    }
                                >
                                    <option value="" disabled>
                                        {t('choose')}
                                    </option>
                                    <option value="shared">
                                        {t('keepShared')}
                                    </option>
                                    <option value="incoming">
                                        {t('useIncoming')}
                                    </option>
                                </select>
                            </label>
                        ))}
                    </div>
                </>
            )}
            {!useShared && !!localOnly.length && (
                <div className="space-y-3">
                    <p>{t('migration.localOnlyReview')}</p>
                    <div className="max-h-64 space-y-2 overflow-auto">
                        {localOnly.map((file) => (
                            <label
                                key={file.path}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-base-200 p-3"
                            >
                                <span className="min-w-0 break-all text-sm">
                                    {file.path}
                                    <span className="block text-base-content/65">
                                        {bytes(file.localBytes ?? 0)}
                                    </span>
                                </span>
                                <select
                                    className="select"
                                    value={decisions[file.path] ?? ''}
                                    onChange={(event) =>
                                        setDecisions({
                                            ...decisions,
                                            [file.path]: event.target.value as
                                                | 'shared'
                                                | 'incoming',
                                        })
                                    }
                                >
                                    <option value="" disabled>
                                        {t('choose')}
                                    </option>
                                    <option value="incoming">
                                        {t('migration.shareFile')}
                                    </option>
                                    <option value="shared">
                                        {t('migration.omitFile')}
                                    </option>
                                </select>
                            </label>
                        ))}
                    </div>
                </div>
            )}
            {!!review.metadata?.length && (
                <div className="space-y-2 text-sm">
                    <p>{t('migration.metadataReview')}</p>
                    <ul className="list-disc pl-5">
                        {review.metadata.map((name) => (
                            <li key={name} className="break-all">
                                {name}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div>
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                        pending ||
                        (!useShared &&
                            required.some((filename) => !decisions[filename]))
                    }
                    onClick={() => onApply(decisions)}
                >
                    {t('apply')}
                </button>
            </div>
        </section>
    );
}
