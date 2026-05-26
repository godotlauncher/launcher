import type { AppUpdateMessage } from '@shared';
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
    installAndRelaunch: () => Promise<void>;
    checkForAppUpdates: () => Promise<void>;
    downloadAppUpdate: () => Promise<void>;
    skipAppUpdate: (version: string) => Promise<void>;
    unskipAppUpdate: () => Promise<void>;
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
        await window.electron.checkForUpdates({ ignoreSkippedVersion: true });
    };

    const downloadAppUpdate = async () => {
        await window.electron.downloadAppUpdate();
    };

    const skipAppUpdate = async (version: string) => {
        await window.electron.skipAppUpdate(version);
        setUpdateAvailable({
            available: false,
            downloaded: false,
            type: 'none',
            message: 'No updates available',
        });
    };

    const unskipAppUpdate = async () => {
        await window.electron.unskipAppUpdate();
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
                downloadAppUpdate,
                skipAppUpdate,
                unskipAppUpdate,
            }}
        >
            {children}
        </appContext.Provider>
    );
};
