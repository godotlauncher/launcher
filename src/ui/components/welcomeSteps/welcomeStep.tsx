import { ExternalLinkIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

export const WelcomeStep: React.FC = () => {
    const { t } = useTranslation('welcome');

    return (
        <div className="flex flex-col gap-4 text-sm ">
            <p>{t('welcomeStep.title')}</p>
            <p>
                <Trans
                    i18nKey="welcomeStep.description"
                    ns="welcome"
                    components={{
                        strong: <strong />
                    }}
                />
            </p>
            <p>{t('welcomeStep.feedback')}</p>
            <p>{t('welcomeStep.enjoy')}
                <button className="btn btn-link p-0 flex gap-1"
                    onClick={() => window.electron.openExternal('https://godotlauncher.com')}
                >https://godotlauncher.com
                    <ExternalLinkIcon className='w-4 h-4' /></button>
            </p>
            <div>
            </div>
        </div>




    );
};
