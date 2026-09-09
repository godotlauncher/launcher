import React, {
    type PropsWithChildren,
    type ReactNode,
    useContext,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../components/alert.component';
import {
    Confirm,
    type ConfirmButton,
    type ConfirmButtonClick,
    type ConfirmContent,
} from '../components/confirm.component';
import type { DialogTone } from '../components/dialog.component';

interface IAlert {
    tone?: DialogTone;
    icon?: React.ReactNode;
    title: string;
    message: ReactNode | string;
}

interface IConfirm {
    tone?: DialogTone;
    icon?: React.ReactNode;
    title: string;
    content: ConfirmContent;
    buttons?: ConfirmButton[];
}

type AlertContext = {
    clearAlerts: () => void;
    addAlert: (
        title: string,
        message: string | ReactNode,
        icon?: React.ReactNode,
        tone?: DialogTone,
    ) => void;
    closeAlert: () => void;
    addConfirm: (
        title: string,
        content: ReactNode,
        onOk: ConfirmButtonClick,
        onCancel?: ConfirmButtonClick,
        icon?: ReactNode,
    ) => void;
    addCustomConfirm: (
        title: string,
        content: ConfirmContent,
        buttons: ConfirmButton[],
        icon?: ReactNode,
        tone?: DialogTone,
    ) => void;
};

const AlertsContext = React.createContext<AlertContext>({} as AlertContext);

export const useAlerts = () => useContext(AlertsContext);

export const AlertsProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const { t } = useTranslation('common');
    const [alerts, setAlerts] = useState<IAlert[]>([]);

    const [confirm, setConfirm] = useState<IConfirm | null>(null);

    const clearAlerts = () => {
        setAlerts([]);
    };

    /**
     * Queues an alert with an optional semantic tone.
     * @param title - Dialog heading.
     * @param message - Dialog body.
     * @param icon - Optional replacement for the tone icon.
     * @param tone - Semantic dialog tone, neutral by default.
     */
    const addAlert = (
        title: string,
        message: string | ReactNode,
        icon?: React.ReactNode,
        tone?: DialogTone,
    ) => {
        setAlerts([...alerts, { title, message, icon, tone }]);
    };

    const closeAlert = () => {
        setAlerts(alerts.slice(1));
    };

    /**
     * Opens a confirmation with custom actions and optional presentation tone.
     * @param title - Dialog heading.
     * @param content - Dialog body.
     * @param buttons - Confirmation actions.
     * @param icon - Optional replacement for the tone icon.
     * @param tone - Semantic dialog tone, neutral by default.
     */
    const addCustomConfirm = (
        title: string,
        content: ConfirmContent,
        buttons: ConfirmButton[],
        icon?: ReactNode,
        tone?: DialogTone,
    ) => {
        setConfirm({ title, content, buttons, icon, tone });
    };

    const addConfirm = (
        title: string,
        content: ReactNode,
        onOk: ConfirmButtonClick,
        onCancel?: ConfirmButtonClick,
        icon?: ReactNode,
    ) => {
        setConfirm({
            title,
            content,
            buttons: [
                {
                    typeClass: 'btn-primary',
                    text: t('buttons.ok'),
                    onClick: onOk,
                },
                {
                    isCancel: true,
                    typeClass: 'btn-neutral',
                    text: t('buttons.cancel'),
                    onClick: onCancel,
                },
            ],
            icon,
        });
    };

    const closeConfirm = (): void => {
        setConfirm(null);
    };

    const showConfirm = () => {
        if (confirm) {
            return (
                <Confirm
                    tone={confirm.tone}
                    icon={confirm.icon}
                    title={confirm.title}
                    content={confirm.content}
                    buttons={confirm.buttons}
                    shouldClose={closeConfirm}
                />
            );
        }

        return null;
    };

    const showAlerts = () => {
        if (alerts.length > 0) {
            const error = alerts[0];
            return (
                <Alert
                    tone={error.tone}
                    title={error.title}
                    message={error.message}
                    onOk={closeAlert}
                    icon={error.icon}
                />
            );
        }

        return null;
    };

    return (
        <AlertsContext.Provider
            value={{
                clearAlerts,
                addAlert,
                closeAlert,
                addConfirm,
                addCustomConfirm,
            }}
        >
            {children}
            {showConfirm()}
            {showAlerts()}
        </AlertsContext.Provider>
    );
};
