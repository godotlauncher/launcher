import type { AppUpdateMessage } from '@shared/contracts';
import {
    createContext,
    type FC,
    type PropsWithChildren,
    useContext,
    useEffect,
    useState,
} from 'react';
import { appBridge, subscribeAppEvent } from '../bridge.ts';

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
        await appBridge.installUpdateAndRestart();
    };

    const checkForAppUpdates = async () => {
        await appBridge.checkForUpdates({ ignoreSkippedVersion: true });
    };

    const downloadAppUpdate = async () => {
        await appBridge.downloadAppUpdate();
    };

    const skipAppUpdate = async (version: string) => {
        await appBridge.skipAppUpdate(version);
        setUpdateAvailable({
            available: false,
            downloaded: false,
            type: 'none',
            message: 'No updates available',
        });
    };

    const unskipAppUpdate = async () => {
        await appBridge.unskipAppUpdate();
    };

    useEffect(() => {
        // get app version
        appBridge.getAppVersion().then(setAppVersion);

        const unsubscribeUpdates = subscribeAppEvent(
            'app-updates',
            setUpdateAvailable,
        );
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
