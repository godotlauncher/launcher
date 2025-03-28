import { createContext, FC, PropsWithChildren, useContext, useEffect, useState } from 'react';

type AppContext = {
    updateAvailable: AppUpdateMessage | undefined;
    installAndRelaunch: () => void;
    checkForAppUpdates: () => void;
};

const appContext = createContext<AppContext>({} as AppContext);

export const useApp = () => useContext(appContext);

export const AppProvider: FC<PropsWithChildren> = ({ children }) => {

    const [updateAvailable, setUpdateAvailable] = useState<AppUpdateMessage>();

    const installAndRelaunch = async () => {
        await window.electron.installUpdateAndRestart();
    };

    const checkForAppUpdates = async () => {
        await window.electron.checkForUpdates();
    };
    useEffect(() => {

        const unsubscribeUpdates = window.electron.subscribeAppUpdates(setUpdateAvailable);
        return () => {
            unsubscribeUpdates();
        };
    }, []);

    return <appContext.Provider value={{ updateAvailable, installAndRelaunch, checkForAppUpdates }}>
        {children}
    </appContext.Provider>;
};