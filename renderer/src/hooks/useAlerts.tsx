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
} from '../components/confirm.component';

interface IAlert {
    icon?: React.ReactNode;
    title: string;
    message: ReactNode | string;
}

interface IConfirm {
    icon?: React.ReactNode;
    title: string;
    content: ReactNode;
    buttons?: ConfirmButton[];
}

type AlertContext = {
    clearAlerts: () => void;
    addAlert: (
        title: string,
        message: string | ReactNode,
        icon?: React.ReactNode,
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
        content: ReactNode,
        buttons: ConfirmButton[],
        icon?: ReactNode,
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

    const addAlert = (
        title: string,
        message: string | ReactNode,
        icon?: React.ReactNode,
    ) => {
        setAlerts([...alerts, { title, message, icon }]);
    };

    const closeAlert = () => {
        setAlerts(alerts.slice(1));
    };

    const addCustomConfirm = (
        title: string,
        content: ReactNode,
        buttons: ConfirmButton[],
        icon?: ReactNode,
    ) => {
        setConfirm({ title, content, buttons, icon });
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
            {showConfirm()}
            {showAlerts()}
            {children}
        </AlertsContext.Provider>
    );
};
