


import { useTranslation } from 'react-i18next';


export const StartStep: React.FC = () => {
    const { t } = useTranslation('welcome');


    return (
        <div className='flex flex-col gap-4 text-sm'>
            <p>
                <h1 className="text-xl">{t('startStep.title')}</h1>
                <p>{t('startStep.subtitle')}</p>
            </p>
            <div className="flex flex-col gap-4">
                <p className="font-bold">{t('startStep.whatsNext')}</p>
                <ul className="flex flex-col list-disc ml-0 pl-4 gap-2">
                    <li>{t('startStep.installTab')} <strong>{t('startStep.installTabBold')}</strong> {t('startStep.installTabSuffix')}</li>
                    <li>{t('startStep.projectsTab')} <strong>{t('startStep.projectsTabBold')}</strong> {t('startStep.projectsTabSuffix')}</li>
                    <li>{t('startStep.settingsTab')} <strong>{t('startStep.settingsTabBold')}</strong> {t('startStep.settingsTabSuffix')}</li>
                </ul>
            </div>
        </div>

    );
};