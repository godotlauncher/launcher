import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import i18n from '../i18n';

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
        // load preferences and then decide language behavior
        (async () => {
            const prefs = await loadPreferences();

            // if user has explicit language preference and didn't choose auto, respect it
            if (prefs?.language && prefs.language_auto === false) {
                if (i18n.language !== prefs.language) {
                    i18n.changeLanguage(prefs.language);
                }
                return;
            }

            // if language_auto is true or missing (first run), try to detect system language
            try {
                const anyWindow = window as any;
                let locale: string | undefined;
                if (anyWindow?.electron?.getLocale) {
                    locale = await anyWindow.electron.getLocale();
                }
                if (!locale && typeof navigator !== 'undefined') {
                    locale = navigator.language || (navigator as any).userLanguage;
                }
                if (locale) {
                    const lang = locale.startsWith('zh') ? 'zh' : 'en';
                    if (i18n.language !== lang) {
                        i18n.changeLanguage(lang);
                    }
                }
            } catch (e) {
                // ignore
            }
        })();
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