import {
    createContext,
    type FC,
    type PropsWithChildren,
    useContext,
    useState,
} from 'react';

export type View = 'projects' | 'installs' | 'settings' | 'help';

type AppNavigationContext = {
    currentView: View;
    setCurrentView: (view: View) => void;
    openExternalLink: (url: string) => void;
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
    const [currentView, setCurrentView] = useState<View>('projects');

    const openExternalLink = async (url: string) => {
        await window.electron.openExternal(url);
    };

    return (
        <appNavigationContext.Provider
            value={{ currentView, setCurrentView, openExternalLink }}
        >
            {children}
        </appNavigationContext.Provider>
    );
};
