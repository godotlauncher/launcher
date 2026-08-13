import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GITHUB_STATUS_URL } from '../constants';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { Dialog } from './dialog.component';

const GITHUB_STATUS_HOST = 'githubstatus.com';

interface AlertProps {
    icon?: React.ReactNode;
    title: string;
    message: string | ReactNode;
    onOk: () => void;
}

function renderAlertLine(
    line: string,
    openExternalLink: (url: string) => Promise<void>,
): ReactNode {
    const linkIndex = line.indexOf(GITHUB_STATUS_HOST);
    if (linkIndex === -1) {
        return line;
    }

    return (
        <>
            {line.slice(0, linkIndex)}
            <button
                type="button"
                data-external-link=""
                onClick={() => void openExternalLink(GITHUB_STATUS_URL)}
                className="link link-primary inline-flex items-center gap-1"
            >
                {GITHUB_STATUS_HOST}
                <ExternalLink className="h-3 w-3" />
            </button>
            {line.slice(linkIndex + GITHUB_STATUS_HOST.length)}
        </>
    );
}

export const Alert: React.FC<AlertProps> = ({ message, onOk, title, icon }) => {
    const { t } = useTranslation('common');
    const { openExternalLink } = useAppNavigation();

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
                                  {renderAlertLine(line, openExternalLink)}
                              </p>
                          ))
                    : message}
            </div>
        </Dialog>
    );
};
