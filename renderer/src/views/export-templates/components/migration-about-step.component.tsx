import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Explains what is changing and why before asking for any choices.
 * @param props - Number of unresolved projects found.
 */
export function MigrationAboutStep({ projectCount }: { projectCount: number }) {
    const { t } = useTranslation('exportTemplates');
    return (
        <div className="space-y-4">
            <p className="text-base-content/75">
                {t('wizardMigration.about.intro')}
            </p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-md border border-base-content/10 bg-base-200/40 p-3">
                <div>
                    <p className="text-sm text-base-content/60">
                        {t('wizardMigration.about.today')}
                    </p>
                    <p className="mt-1 font-medium">
                        {t('wizardMigration.about.before')}
                    </p>
                </div>
                <ArrowRight
                    className="size-5 text-base-content/50"
                    aria-hidden="true"
                />
                <div>
                    <p className="text-sm text-base-content/60">
                        {t('wizardMigration.about.after')}
                    </p>
                    <p className="mt-1 font-medium">
                        {t('wizardMigration.about.destination')}
                    </p>
                </div>
            </div>
            <section>
                <h3 className="text-base font-semibold">
                    {t('wizardMigration.about.why')}
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-base-content/75">
                    {[1, 2, 3].map((number) => (
                        <li key={number}>
                            {t(`wizardMigration.about.benefit${number}`)}
                        </li>
                    ))}
                </ul>
            </section>
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="font-medium">
                    {t('wizardMigration.about.found', { number: projectCount })}
                </p>
                <p className="mt-1 text-base-content/70">
                    {t('wizardMigration.about.next')}
                </p>
            </div>
        </div>
    );
}
