import { Code2, Download, FolderCog } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';

export const WelcomeStep: React.FC = () => {
    const { t } = useTranslation('welcome');

    const benefits = [
        {
            icon: Download,
            text: t('onboarding.welcome.officialAndCustomEditors'),
        },
        {
            icon: FolderCog,
            text: t('onboarding.welcome.projectSettings'),
        },
        {
            icon: Code2,
            text: t('onboarding.welcome.codeEditorIntegration'),
        },
    ];

    return (
        <div className="flex max-w-3xl flex-col gap-7">
            <div className="flex flex-col gap-3">
                <h1
                    data-testid="onboarding-step-heading"
                    tabIndex={-1}
                    className="text-4xl font-bold tracking-tight text-base-content outline-none"
                >
                    {t('onboarding.welcome.title')}
                </h1>
                <p className="max-w-2xl text-lg leading-relaxed text-base-content/80">
                    {t('onboarding.welcome.description')}
                </p>
                <p className="max-w-2xl leading-relaxed text-base-content/65">
                    {t('onboarding.welcome.expectation')}
                </p>
            </div>

            <ul
                className="flex flex-col gap-5"
                aria-label={t('onboarding.welcome.benefitsLabel')}
            >
                {benefits.map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-center gap-4">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-box bg-primary/10 text-primary">
                            <Icon size={22} aria-hidden="true" />
                        </span>
                        <span className="text-base leading-relaxed">
                            {text}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
