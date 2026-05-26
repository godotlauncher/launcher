import { ExternalLink } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useAppNavigation } from '../../hooks/useAppNavigation';

export const MacOSStep: React.FC = () => {
    const { t } = useTranslation('welcome');
    const { openExternalLink } = useAppNavigation();

    return (
        <div className="text-sm">
            <h1 className="text-xl">{t('macosStep.title')}</h1>
            <p>{t('macosStep.intro')}</p>
            <div className="pt-6 flex flex-col gap-2">
                <h2 className="font-bold">{t('macosStep.whyTitle')}</h2>
                <ul className="flex flex-col gap-4">
                    <li>{t('macosStep.reason')}</li>
                    <li className="flex flex-row items-center gap-1 font-bold">
                        <Trans
                            i18nKey="macosStep.dotnetNote"
                            ns="welcome"
                            components={{
                                ButtonLink: (
                                    <button
                                        type="button"
                                        className="hover:underline text-info"
                                        onClick={() =>
                                            openExternalLink(
                                                'https://dotnet.microsoft.com/download',
                                            )
                                        }
                                    />
                                ),
                                Icon: (
                                    <ExternalLink className="w-4 inline-block" />
                                ),
                            }}
                        />
                    </li>
                </ul>
            </div>
        </div>
    );
};
