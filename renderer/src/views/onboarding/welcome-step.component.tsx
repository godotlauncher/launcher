import { Code2, Download, FolderCog } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { OverlayTitle } from '../../components/ui/overlay-title.component';

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
                <OverlayTitle
                    as="h1"
                    data-testid="onboarding-step-heading"
                    className="text-[20px] font-semibold"
                >
                    {t('onboarding.welcome.title')}
                </OverlayTitle>
                <p className="max-w-2xl text-base-content/75">
                    {t('onboarding.welcome.description')}
                </p>
                <p className="max-w-2xl">
                    {t('onboarding.welcome.expectation')}
                </p>
            </div>

            <ul
                className="flex flex-col gap-5"
                aria-label={t('onboarding.welcome.benefitsLabel')}
            >
                {benefits.map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-center gap-4">
                        <span className="flex size-10 shrink-0 items-center justify-center">
                            <Icon size={20} aria-hidden="true" />
                        </span>
                        <span>{text}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
