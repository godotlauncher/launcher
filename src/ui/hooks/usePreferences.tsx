import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

interface AppPreferences {
    preferences: UserPreferences | null;
    savePreferences: (preferences: UserPreferences) => void;
    loadPreferences: () => Promise<UserPreferences>;
    updatePreferences: (preferences: Partial<UserPreferences>) => void;
    setAutoStart: (autoStart: boolean, hidden: boolean) => Promise<SetAutoStartResult>;
    setAutoUpdates: (enabled: boolean) => Promise<boolean>;
    platform: string;
}

const preferencesContext = createContext<AppPreferences>({} as AppPreferences);

export const usePreferences = () => {
    const context = useContext(preferencesContext);
    if (!context) {
        throw new Error('usePreferences must be used within a PrefsProvider');
    }
    return context;
};

type AppPreferencesProviderProps = PropsWithChildren;

export const PreferencesProvider: React.FC<AppPreferencesProviderProps> = ({ children }) => {
    const [preferences, setPreferences] = useState<UserPreferences | null>(null);
    const [platform, setPlatform] = useState<string>('');

    useEffect(() => {
        window.electron.getPlatform().then(setPlatform);
        loadPreferences();
    }, []);

    const updatePreferences = async (newPrefs: Partial<UserPreferences>) => {
        const prefs = { ...preferences, ...newPrefs } as UserPreferences;
        savePreferences(prefs).then(setPreferences);
    };


    const loadPreferences = async () => {
        const preferences = await window.electron.getUserPreferences();
        setPreferences(preferences);
        return preferences;
    };

    const savePreferences = async (preferences: UserPreferences) => {
        const newPreferences = await window.electron.setUserPreferences(preferences);
        setPreferences({ ...newPreferences });
        return newPreferences;
    };

    const setAutoStart = async (autoStart: boolean, hidden: boolean): Promise<SetAutoStartResult> => {

        const result = await window.electron.setAutoStart(autoStart, hidden);
        await loadPreferences();
        return result;

    };

    const setAutoUpdates = async (enabled: boolean): Promise<boolean> => {
        const result = await window.electron.setAutoCheckUpdates(enabled);
        await loadPreferences();
        return result;
    };

    return <preferencesContext.Provider value={
        {
            platform,
            preferences,
            savePreferences,
            loadPreferences,
            updatePreferences,
            setAutoStart,
            setAutoUpdates
        }} > {children}</ preferencesContext.Provider>;
};