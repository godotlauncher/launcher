import {
    createContext,
    type FC,
    type PropsWithChildren,
    useCallback,
    useContext,
    useMemo,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { appViewRoutes, getViewFromPathname, type View } from '../routes';

export type { View };

type AppNavigationContext = {
    currentView: View;
    setCurrentView: (view: View) => void;
    openExternalLink: (url: string) => Promise<void>;
};

const appNavigationContext = createContext<AppNavigationContext>(
    {} as AppNavigationContext,
);

export const useAppNavigation = () => {
    const context = useContext(appNavigationContext);
    if (!context) {
        throw new Error(
            'useAppNavigation must be used within a AppNavigationProvider',
        );
    }
    return context;
};

type AppNavigationProviderProps = PropsWithChildren;

export const AppNavigationProvider: FC<AppNavigationProviderProps> = ({
    children,
}) => {
    const location = useLocation();
    const navigate = useNavigate();

    const currentView = useMemo(
        () => getViewFromPathname(location.pathname),
        [location.pathname],
    );

    const setCurrentView = useCallback(
        (view: View) => {
            navigate(appViewRoutes[view]);
        },
        [navigate],
    );

    const openExternalLink = useCallback(async (url: string) => {
        await window.electron.openExternal(url);
    }, []);

    return (
        <appNavigationContext.Provider
            value={{ currentView, setCurrentView, openExternalLink }}
        >
            {children}
        </appNavigationContext.Provider>
    );
};
