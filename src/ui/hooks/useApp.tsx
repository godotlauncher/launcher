import {
    createContext,
    type FC,
    type PropsWithChildren,
    useContext,
    useEffect,
    useState,
} from 'react';

type AppContext = {
    appVersion: string | undefined;
    updateAvailable: AppUpdateMessage | undefined;
    installAndRelaunch: () => void;
    checkForAppUpdates: () => void;
};

const appContext = createContext<AppContext>({} as AppContext);

export const useApp = () => useContext(appContext);

export const AppProvider: FC<PropsWithChildren> = ({ children }) => {
    const [updateAvailable, setUpdateAvailable] = useState<AppUpdateMessage>();
    const [appVersion, setAppVersion] = useState<string>();

    const installAndRelaunch = async () => {
        await window.electron.installUpdateAndRestart();
    };

    const checkForAppUpdates = async () => {
        await window.electron.checkForUpdates();
    };
    useEffect(() => {
        // get app version
        window.electron.getAppVersion().then(setAppVersion);

        const unsubscribeUpdates =
            window.electron.subscribeAppUpdates(setUpdateAvailable);
        return () => {
            unsubscribeUpdates();
        };
    }, []);

    return (
        <appContext.Provider
            value={{
                appVersion,
                updateAvailable,
                installAndRelaunch,
                checkForAppUpdates,
            }}
        >
            {children}
        </appContext.Provider>
    );
};
