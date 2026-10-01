import type { AppUpdateMessage } from '@shared/contracts';
import {
    createContext,
    type FC,
    type PropsWithChildren,
    useContext,
    useEffect,
    useState,
} from 'react';
import { appBridge, subscribeAppEvent } from '../renderer.bridge.ts';
import { reduceAppUpdateState } from './app-update-state.util';

type AppContext = {
    appVersion: string | undefined;
    updateAvailable: AppUpdateMessage | undefined;
    installAndRelaunch: () => Promise<void>;
    checkForAppUpdates: () => Promise<void>;
    downloadAppUpdate: () => Promise<void>;
    retryAppUpdate: () => Promise<void>;
    skipAppUpdate: (version: string) => Promise<void>;
    unskipAppUpdate: () => Promise<void>;
};

const appContext = createContext<AppContext>({} as AppContext);

/** Reads the shared application update state and actions. */
export const useApp = () => useContext(appContext);

/**
 * Shares update events and explicit actions across application views.
 *
 * @param props - Child views that consume the application state.
 */
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

    /** Retries only the operation identified by the current update failure. */
    const retryAppUpdate = async () => {
        if (updateAvailable?.type !== 'error') return;
        switch (updateAvailable.failedOperation) {
            case 'check':
                await checkForAppUpdates();
                break;
            case 'download':
                await downloadAppUpdate();
                break;
            case 'install':
                await installAndRelaunch();
                break;
        }
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
            (incoming) =>
                setUpdateAvailable((current) =>
                    reduceAppUpdateState(current, incoming),
                ),
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
                retryAppUpdate,
                skipAppUpdate,
                unskipAppUpdate,
            }}
        >
            {children}
        </appContext.Provider>
    );
};
