import {
    createI18nRendererBridge,
    type I18nBridgeState,
} from '@mariodebono/di-electron-i18n/renderer';
import logger from 'electron-log';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { appBridge } from '../bridge.ts';

const i18nBridge = createI18nRendererBridge();

async function addStateResources(state: I18nBridgeState): Promise<void> {
    const fallbackResources =
        state.locale === state.fallbackLocale
            ? state.resources
            : await i18nBridge.getResources(state.fallbackLocale);

    for (const [namespace, resource] of Object.entries(fallbackResources)) {
        i18n.addResourceBundle(
            state.fallbackLocale,
            namespace,
            resource,
            true,
            true,
        );
    }

    for (const [namespace, resource] of Object.entries(state.resources)) {
        i18n.addResourceBundle(state.locale, namespace, resource, true, true);
    }
}

async function initializeI18n(): Promise<void> {
    try {
        const state = await i18nBridge.getState();

        await i18n.use(initReactI18next).init({
            lng: state.locale,
            fallbackLng: state.fallbackLocale,
            supportedLngs: state.supportedLocales,
            lowerCaseLng: true,
            ns: state.namespaces,
            defaultNS: 'common',
            resources: {},
            interpolation: {
                escapeValue: false,
            },
            react: {
                useSuspense: false,
            },
        });

        await addStateResources(state);
        await i18n.changeLanguage(state.locale);
        logger.info(
            `[i18n] Initialized successfully with language: ${state.locale}`,
        );
    } catch (error) {
        logger.error('[i18n] Failed to initialize:', error);
    }
}

void initializeI18n();

export async function changeLanguage(preference: string): Promise<void> {
    try {
        logger.info(`[i18n] Changing language preference: ${preference}`);
        await appBridge.changeLanguage(preference);
        const state = await i18nBridge.getState();
        await addStateResources(state);
        await i18n.changeLanguage(state.locale);
        logger.info(`[i18n] Language changed successfully to: ${state.locale}`);
    } catch (error) {
        logger.error('[i18n] Failed to change language:', error);
        throw error;
    }
}

export default i18n;
