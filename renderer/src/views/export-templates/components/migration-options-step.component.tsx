import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { migrationOptions } from '../template-migration-choice.util';
import { MigrationChoiceInformation } from './migration-choice-information.component';

/** Introduces the same four options that appear in every project selector. */
export function MigrationOptionsStep() {
    const { t } = useTranslation('exportTemplates');
    return (
        <div className="space-y-3">
            <p className="text-base-content/75">
                {t('wizardMigration.optionsIntro')}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {migrationOptions.map((choice) => (
                    <MigrationChoiceInformation key={choice} choice={choice} />
                ))}
            </div>
            <p className="flex items-center gap-2 text-base-content/65">
                <Info size={18} className="shrink-0" aria-hidden="true" />
                {t('wizardMigration.infoReminder')}
            </p>
        </div>
    );
}
