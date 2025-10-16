import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface AlertProps {
    icon?: React.ReactNode;
    title: string;
    message: string | ReactNode;
    onOk: () => void;
}
export const Alert: React.FC<AlertProps> = ({ message, onOk, title, icon }) => {
    const { t } = useTranslation('common');
    return (
        <div className="absolute z-50 inset-0 bg-black/80 flex flex-col items-center justify-center">
            <div className="bg-base-100 rounded-md p-4 flex flex-col gap-4 min-w-80 m-4 min-h-36 items-start ">
                <h1 className="text-base-content font-bold flex flex-row items-center gap-2">{icon} <p>{title}</p></h1>
                <div>
                    {typeof message === 'string'
                        ? message.split('\n').map((line, index) => <p key={index}>{line}</p>)
                        : message
                    }
                </div>
                <div className="flex flex-row justify-end w-full">
                    <button data-testid="btnAlertOk" onClick={onOk} className="btn btn-primary">{t('buttons.ok')}</button>
                </div>
            </div>
        </div>
    );
};