import type { TemplateMigrationDecision } from '@shared/contracts';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '../../../components/ui/status-badge.component';
import { migrationOptions } from '../template-migration-choice.util';
import {
    MigrationChoiceIcon,
    migrationChoicePanelTone,
    migrationChoiceTone,
} from './migration-choice-indicator.component';

/** Uses the same explanation on Options and beside a project selection.
 * @param props - Choice whose meaning and local-file warning are shown.
 */
export function MigrationChoiceInformation({
    choice,
}: {
    choice: TemplateMigrationDecision;
}) {
    const { t } = useTranslation('exportTemplates');
    const removesLocal = choice === 'share-project' || choice === 'use-shared';
    return (
        <section
            className={`rounded-md border p-3 ${migrationChoicePanelTone[choice]}`}
        >
            <div className="flex flex-wrap items-center gap-2">
                <h3
                    className={`flex items-center gap-2 text-base font-semibold ${migrationChoiceTone[choice]}`}
                >
                    <MigrationChoiceIcon choice={choice} />
                    {t('wizardMigration.optionTitle', {
                        number: migrationOptions.indexOf(choice) + 1,
                        label: t(`wizardMigration.choices.${choice}`),
                    })}
                </h3>
                {choice === 'save-imported' && (
                    <StatusBadge tone="success">
                        {t('wizardMigration.recommended')}
                    </StatusBadge>
                )}
            </div>
            <p className="mt-2 text-base-content/75">
                {t(`wizardMigration.explanations.${choice}`)}
            </p>
            {removesLocal && (
                <p
                    className={`mt-2 flex items-start gap-2 ${migrationChoiceTone[choice]}`}
                >
                    <TriangleAlert
                        className="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                    />
                    {t(`wizardMigration.warnings.${choice}`)}
                </p>
            )}
        </section>
    );
}
