import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppNavigation } from '../../hooks/useAppNavigation';



export const MacOSStep: React.FC = () => {
    const { t } = useTranslation('welcome');
    const { openExternalLink } = useAppNavigation();


    return (
        <div className='text-sm'>
            <h1 className="text-xl">{t('macosStep.title')}</h1>
            <p>{t('macosStep.intro')}</p>
            <div className="pt-6 flex flex-col gap-2">
                <h2 className="font-bold">{t('macosStep.whyTitle')}</h2>
                <ul className="flex flex-col gap-4">
                    <li>
                        {t('macosStep.reason')}
                    </li>
                    <li className="flex flex-row gap-1 font-bold">
                        {t('macosStep.dotnetNote')}
                        <button className="flex flex-row hover:underline items-basleline text-info" onClick={() => openExternalLink('https://dotnet.microsoft.com/download')}>{t('macosStep.dotnetLink')} <ExternalLink className="w-4" /></button>
                    </li>
                </ul>
            </div>
        </div>


    );
};
