import { app } from 'electron';
import logger from 'electron-log/main.js';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'node:path';
import { isDev } from '../utils.js';


let i18nInstance: typeof i18next | null = null;
const mainWindow = app
/**
 * Resolve the locale to use based on user preference and system settings
 * @param userPreference User's language preference ('system' or locale code)
 * @returns Resolved locale code
 */
function resolveLocale(userPreference?: string): string {
  // If user selected a specific language, use it
  if (userPreference && userPreference !== 'system') {
    logger.info(`Using user-selected language: ${userPreference}`);
    return userPreference;
  }

  // Otherwise, detect system language
  const systemLocale = app.getLocale();
  logger.info(`Detected system locale: ${systemLocale}`);

  // Normalize locale (e.g., 'en-US' -> 'en', 'es-ES' -> 'es')
  const normalizedLocale = systemLocale.split('-')[0].toLowerCase();

  return normalizedLocale;
}

/**
 * Initialize i18next with filesystem backend
 * @param locale User's language preference or 'system' for auto-detect
 */
export async function initI18n(locale?: string): Promise<typeof i18next> {
  if (i18nInstance) {
    logger.debug('i18n already initialized');
    return i18nInstance;
  }

  const localesPath = isDev()
    ? path.join(process.cwd(), 'src', 'locales')
    : path.join(process.resourcesPath, 'locales');

  const resolvedLocale = resolveLocale(locale);

  logger.info(`Initializing i18n from: ${localesPath}`);
  logger.info(`Target language: ${resolvedLocale}`);

  try {
    await i18next.use(Backend).init({
      lng: resolvedLocale,
      fallbackLng: 'en',
      ns: ['translation', 'dialogs', 'menus', 'common', 'projects', 'installs', 'settings', 'help', 'createProject', 'installEditor', 'welcome'],
      defaultNS: 'translation',
      backend: {
        loadPath: path.join(localesPath, '{{lng}}/{{ns}}.json'),
      },
      interpolation: {
        escapeValue: false,
      },
      debug: isDev(),
    });

    i18nInstance = i18next;
    logger.info(`i18n initialized successfully with language: ${i18nInstance.language}`);

    return i18next;
  } catch (error) {
    logger.error('Failed to initialize i18n:', error);
    throw error;
  }
}

/**
 * Translate a key in the backend
 * @param key Translation key
 * @param options Interpolation options
 * @returns Translated string
 */
export function t(key: string, options?: any): string {
  if (!i18nInstance) {
    logger.error('i18n not initialized, returning key as-is');
    return key;
  }
  return i18nInstance.t(key, options) as string;
}

/**
 * Change the current language and reload translations
 * @param lng Locale code to switch to
 */
export async function changeLanguage(lng: string): Promise<void> {
  if (!i18nInstance) {
    throw new Error('i18n not initialized');
  }

  const resolvedLocale = resolveLocale(lng);

  logger.info(`Changing language to: ${resolvedLocale}`);

  try {
    await i18nInstance.changeLanguage(resolvedLocale);

    logger.info(`Language changed successfully to: ${i18nInstance.language}`);
  } catch (error) {
    logger.error(`Failed to change language to ${resolvedLocale}:`, error);
    throw error;
  }
}

/**
 * Get the current language code
 * @returns Current locale code
 */
export function getCurrentLanguage(): string {
  if (!i18nInstance) {
    logger.warn('i18n not initialized, returning default locale');
    return 'en';
  }
  return i18nInstance.language;
}

/**
 * Get list of available languages
 * @returns Array of available locale codes
 */
export function getAvailableLanguages(): string[] {
  // Update this list when adding new locale folders under src/locales
  return ['en', 'it'];
}

/**
 * Get all translations for a specific language (for renderer process)
 * @param language Locale code (optional, defaults to current language)
 * @returns Object with all namespaces and their translations
 */
export function getAllTranslations(language?: string): Record<string, Record<string, any>> {
  if (!i18nInstance) {
    logger.error('i18n not initialized, returning empty translations');
    return {};
  }

  const lang = language || i18nInstance.language;
  const translations: Record<string, Record<string, any>> = {};

  // Get all loaded namespaces
  const namespaces = i18nInstance.options.ns as string[];

  logger.debug(`Exporting translations for language: ${lang}, namespaces: ${namespaces.join(', ')}`);

  for (const ns of namespaces) {
    const bundle = i18nInstance.getResourceBundle(lang, ns);
    if (bundle) {
      translations[ns] = bundle;
    } else {
      logger.warn(`No translations found for namespace: ${ns} in language: ${lang}`);
    }
  }

  logger.debug(`Exported ${Object.keys(translations).length} namespaces for ${lang}`);
  return translations;
}
