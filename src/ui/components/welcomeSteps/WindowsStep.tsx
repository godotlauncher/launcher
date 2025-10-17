import { ExternalLink } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useAppNavigation } from '../../hooks/useAppNavigation';



export const WindowsStep: React.FC = () => {
    const { t } = useTranslation('welcome');
    const { openExternalLink } = useAppNavigation();

    return (
        <div className='text-sm'>
            <h1 className="text-xl">{t('windowsStep.title')}</h1>
            <p>
                <Trans
                    i18nKey="windowsStep.intro"
                    ns="welcome"
                    components={{
                        code: <code className="bg-base-300 px-2 rounded text-warning" />,
                        strong: <strong />
                    }}
                />
            </p>
            <div className="pt-4 flex flex-col gap-2">
                <ul className="flex flex-col gap-4">
                    <li>
                        {t('windowsStep.change1')}
                    </li>
                    <li><strong>
                        <Trans
                            i18nKey="windowsStep.change2"
                            ns="welcome"
                            components={{
                                code: <code className="bg-base-300 px-2 rounded text-warning" />,
                            }}
                        />
                    </strong>
                    </li>
                    <li>
                        <Trans
                            i18nKey="windowsStep.change3"
                            ns="welcome"
                            components={{
                                strong: <strong />
                            }}
                        />
                    </li>
                    <li className="flex flex-row gap-1 font-bold">
                        <Trans
                            i18nKey="windowsStep.dotnetNote"
                            ns="welcome"
                            components={{
                                ButtonLink: (
                                    <button
                                        className="hover:underline text-info"
                                        onClick={() => openExternalLink('https://dotnet.microsoft.com/download')}
                                    />
                                ),
                                Icon: <ExternalLink className="w-4 inline-block" />
                            }}
                        />
                    </li>
                </ul>
            </div>
        </div >
    );
};
