


import { Trans, useTranslation } from 'react-i18next';


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
                    <li>
                        <Trans
                            i18nKey="startStep.installTab"
                            ns="welcome"
                            components={{
                                strong: <strong />
                            }}
                        />
                    </li>
                    <li>
                        <Trans
                            i18nKey="startStep.projectsTab"
                            ns="welcome"
                            components={{
                                strong: <strong />
                            }}
                        />
                    </li>
                    <li>
                        <Trans
                            i18nKey="startStep.settingsTab"
                            ns="welcome"
                            components={{
                                strong: <strong />
                            }}
                        />
                    </li>
                </ul>
            </div>
        </div>

    );
};