import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './dialog.component';

interface AlertProps {
    icon?: React.ReactNode;
    title: string;
    message: string | ReactNode;
    onOk: () => void;
}
export const Alert: React.FC<AlertProps> = ({ message, onOk, title, icon }) => {
    const { t } = useTranslation('common');
    return (
        <Dialog
            icon={icon}
            title={title}
            footer={
                <button
                    type="button"
                    data-testid="btnAlertOk"
                    onClick={onOk}
                    className="btn btn-primary"
                >
                    {t('buttons.ok')}
                </button>
            }
        >
            <div className="flex flex-col gap-2">
                {typeof message === 'string'
                    ? message
                          .split('\n')
                          .map((line) => (
                              <p key={`alert-message-${line.substring(0, 10)}`}>
                                  {line}
                              </p>
                          ))
                    : message}
            </div>
        </Dialog>
    );
};
