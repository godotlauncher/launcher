import type { TemplateMigrationDecision } from '@shared/contracts';
import { Clock, Share2, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const migrationChoiceTone = {
    'save-imported': 'text-success-content dark:text-success',
    'share-project': 'text-[color:var(--color-warning-readable)]',
    'use-shared': 'text-error-content dark:text-error',
    later: 'text-base-content/65',
} satisfies Record<TemplateMigrationDecision, string>;

export const migrationChoicePanelTone = {
    'save-imported': 'border-success/25 bg-success/5',
    'share-project': 'border-warning/25 bg-warning/5',
    'use-shared': 'border-error/25 bg-error/5',
    later: 'border-base-content/10 bg-base-200/40',
} satisfies Record<TemplateMigrationDecision, string>;

const icons = {
    'save-imported': ShieldCheck,
    'share-project': Share2,
    'use-shared': Trash2,
    later: Clock,
};

/** Marks the selected action without confusing it with an execution result.
 * @param props - Choice represented by the decorative icon.
 */
export function MigrationChoiceIcon({
    choice,
}: {
    choice: TemplateMigrationDecision;
}) {
    const Icon = icons[choice];
    return (
        <Icon
            className={`size-4 shrink-0 ${migrationChoiceTone[choice]}`}
            aria-hidden="true"
        />
    );
}

/** Keeps the action's words, icon and colour consistent throughout the wizard.
 * @param props - Choice whose translated label is shown.
 */
export function MigrationChoiceLabel({
    choice,
}: {
    choice: TemplateMigrationDecision;
}) {
    const { t } = useTranslation('exportTemplates');
    return (
        <span
            className={`inline-flex items-center gap-2 font-medium ${migrationChoiceTone[choice]}`}
        >
            <MigrationChoiceIcon choice={choice} />
            {t(`wizardMigration.choices.${choice}`)}
        </span>
    );
}
