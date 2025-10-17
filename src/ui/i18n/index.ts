import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import IPCBackend from './ipc-backend';

const ipcBackend = new IPCBackend();

/**
 * Initialize i18next for React renderer process
 * Fetches translations from Electron main process via IPC
 */
async function initializeI18n() {
    try {
    // Get current language from main process
        const currentLang = await window.electron.i18n.getCurrentLanguage();
        const availableLanguages = await window.electron.i18n.getAvailableLanguages();
    
        console.log(`[i18n] Initializing with language: ${currentLang}`);
        console.log('[i18n] Available languages:', availableLanguages);

        await i18n
            .use(ipcBackend)
            .use(initReactI18next)
            .init({
                lng: currentLang,
                fallbackLng: 'en',
                supportedLngs: availableLanguages,
                ns: ['common', 'projects', 'installs', 'settings', 'help', 'createProject', 'installEditor', 'welcome'],
                defaultNS: 'common',
                interpolation: {
                    escapeValue: false, // React already escapes
                },
                react: {
                    useSuspense: false, // We'll handle loading states manually
                },
            });

        console.log(`[i18n] Initialized successfully with language: ${i18n.language}`);
    } catch (error) {
        console.error('[i18n] Failed to initialize:', error);
    }
}

// Initialize immediately when module is imported
initializeI18n();

/**
 * Change language and reload translations
 * @param language Locale code to switch to
 */
export async function changeLanguage(language: string): Promise<void> {
    try {
        console.log(`[i18n] Changing language to: ${language}`);
    
        // Request language change from main process (also updates preferences)
        const newTranslations = await window.electron.i18n.changeLanguage(language);
    
        // Clear backend cache
        ipcBackend.clearCache();
    
        // Change language in i18next (this will trigger re-fetch from backend)
        await i18n.changeLanguage(language);
    
        // Manually add new translations to ensure immediate update
        Object.keys(newTranslations).forEach(ns => {
            i18n.addResourceBundle(language, ns, newTranslations[ns], true, true);
        });
    
        console.log(`[i18n] Language changed successfully to: ${i18n.language}`);
    } catch (error) {
        console.error('[i18n] Failed to change language:', error);
        throw error;
    }
}

export default i18n;
