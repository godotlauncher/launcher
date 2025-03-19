import { createContext, FC, PropsWithChildren, useContext, useState } from 'react';

export type View = 'projects' | 'installs' | 'settings' | 'help';

type AppNavigationContext = {
    currentView: View;
    setCurrentView: (view: View) => void;
    openExternalLink: (url: string) => void;

};


const AppNavigationContext = createContext<AppNavigationContext>({} as AppNavigationContext);

export const useAppNavigation = () => {
    const context = useContext(AppNavigationContext);
    if (!context) {
        throw new Error('useAppNavigation must be used within a AppNavigationProvider');
    }
    return context;
};


type AppNavigationProviderProps = PropsWithChildren;

export const AppNavigationProvider: FC<AppNavigationProviderProps> = ({ children }) => {
    const [currentView, setCurrentView] = useState<View>('projects');

    const openExternalLink = async (url: string) => {
        await window.electron.openExternal(url);
    };

    return <AppNavigationContext.Provider value={{ currentView, setCurrentView, openExternalLink }} >
        {children}
    </AppNavigationContext.Provider>;
};
