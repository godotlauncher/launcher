import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppNavigation } from '../../hooks/useAppNavigation';



export const WindowsStep: React.FC = () => {
    const { t } = useTranslation('welcome');
    const { openExternalLink } = useAppNavigation();

    return (
        <div className='text-sm'>
            <h1 className="text-xl">{t('windowsStep.title')}</h1>
            <p>
                {t('windowsStep.intro')}{' '}
                <code className="bg-base-300 px-2 rounded text-warning">{t('windowsStep.symlinkCode')}</code> {t('windowsStep.intro2')} <strong>{t('windowsStep.settingsPath')}</strong> {t('windowsStep.intro3')}
            </p>
            <div className="pt-6 flex flex-col gap-2">
                <h2 className="font-bold">{t('windowsStep.whatChangedTitle')}</h2>
                <ul className="flex flex-col gap-4">
                    <li>
                        {t('windowsStep.change1')}
                    </li>
                    <li>
                        {t('windowsStep.change2')}{' '}
                        <code className="bg-base-300 px-2 rounded text-warning">{t('windowsStep.administratorCode')}</code> {t('windowsStep.change2b')}{' '}
                        <code className="bg-base-300 px-2 rounded text-warning">{t('windowsStep.developerModeCode')}</code> {t('windowsStep.change2c')}
                    </li>
                    <li>
                        {t('windowsStep.change3')} <strong>{t('windowsStep.editorSymlinks')}</strong> {t('windowsStep.change3b')}
                    </li>
                    <li className="flex flex-row gap-1 font-bold">
                        {t('windowsStep.dotnetNote')}{' '}
                        <button
                            className="flex flex-row hover:underline items-basleline text-info"
                            onClick={() => openExternalLink('https://dotnet.microsoft.com/download')}
                        >
                            {t('windowsStep.dotnetLink')} <ExternalLink className="w-4" />
                        </button>
                    </li>
                </ul>
            </div>
        </div >
    );
};
