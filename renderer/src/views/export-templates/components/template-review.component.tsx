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
    const required = review.conflicts.map((conflict) => conflict.path);
    return (
        <section
            className="flex flex-col gap-3 border-t border-base-content/15 pt-3"
            aria-label={t('review')}
        >
            <h2 className="text-lg font-semibold">{t('review')}</h2>
            {review.projectName && <p>{review.projectName}</p>}
            <p>
                {review.sets.join(', ')} · {bytes(review.sizeBytes)}
            </p>
            <p>
                {t('mergeSummary', {
                    added: review.addedFiles,
                    identical: review.identicalFiles,
                })}
            </p>
            {!!review.conflicts.length && (
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
            <div>
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                        pending ||
                        required.some((filename) => !decisions[filename])
                    }
                    onClick={() => onApply(decisions)}
                >
                    {t('apply')}
                </button>
            </div>
        </section>
    );
}
