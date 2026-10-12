import type { TemplateMigrationDecision } from '@shared/contracts';
import { useTranslation } from 'react-i18next';
import { migrationOptions } from '../template-migration-choice.util';
import { MigrationChoiceLabel } from './migration-choice-indicator.component';

/** Summarises effective version choices, rather than the inactive remembered selections.
 * @param props - One current decision per template version.
 */
export function MigrationChoiceSummary({
    choices,
}: {
    choices: TemplateMigrationDecision[];
}) {
    const { t } = useTranslation('exportTemplates');
    return (
        <ul
            aria-label={t('wizardMigration.choiceSummary')}
            className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
        >
            {migrationOptions.map((choice) => {
                const count = choices.filter(
                    (value) => value === choice,
                ).length;
                return (
                    count > 0 && (
                        <li key={choice} className="flex items-center gap-1">
                            <MigrationChoiceLabel choice={choice} />
                            <span className="text-base-content/65">
                                ({count})
                            </span>
                        </li>
                    )
                );
            })}
        </ul>
    );
}
