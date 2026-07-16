import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    let locale = 'en';
    const resources = {
        en: { common: { greeting: 'Hello' } },
        de: { common: { greeting: 'Hallo' } },
    };

    return {
        get locale() {
            return locale;
        },
        set locale(value: string) {
            locale = value;
        },
        getState: vi.fn(async () => ({
            locale,
            fallbackLocale: 'en',
            systemLocale: 'en',
            supportedLocales: ['en', 'de'],
            namespaces: ['common'],
            resources: resources[locale as keyof typeof resources],
        })),
        getResources: vi.fn(
            async (requestedLocale: string) =>
                resources[requestedLocale as keyof typeof resources],
        ),
        changeLanguage: vi.fn(async (preference: string) => {
            locale = preference === 'system' ? 'en' : preference;
            return locale;
        }),
    };
});

vi.mock('@mariodebono/di-electron-i18n/renderer', () => ({
    createI18nRendererBridge: () => ({
        getState: mocks.getState,
        getResources: mocks.getResources,
    }),
}));

vi.mock('../bridge.ts', () => ({
    appBridge: { changeLanguage: mocks.changeLanguage },
}));

import i18n, { changeLanguage } from './index.js';

describe('renderer i18n', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mocks.locale = 'en';
        await vi.waitFor(() => expect(i18n.isInitialized).toBe(true));
    });

    it('initializes from the DI i18n bridge state', async () => {
        await vi.waitFor(() => expect(i18n.language).toBe('en'));

        expect(i18n.t('greeting', { ns: 'common' })).toBe('Hello');
    });

    it('persists the preference before applying returned resources', async () => {
        await changeLanguage('de');

        expect(mocks.changeLanguage).toHaveBeenCalledWith('de');
        expect(mocks.getState).toHaveBeenCalled();
        expect(i18n.language).toBe('de');
        expect(i18n.t('greeting', { ns: 'common' })).toBe('Hallo');
    });
});
