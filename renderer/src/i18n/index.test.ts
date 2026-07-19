import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    let locale = 'en';
    const resources: Record<string, Record<string, Record<string, string>>> = {
        en: { common: { greeting: 'Hello' } },
        de: { common: { greeting: 'Hallo' } },
        'pt-br': { common: { greeting: 'Olá' } },
        'zh-cn': { common: { greeting: '你好 (简体)' } },
        'zh-tw': { common: { greeting: '你好 (繁體)' } },
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
            supportedLocales: Object.keys(resources),
            namespaces: ['common'],
            resources: resources[locale] ?? {},
        })),
        getResources: vi.fn(
            async (requestedLocale: string) => resources[requestedLocale] ?? {},
        ),
        changeLanguage: vi.fn(async (preference: string) => {
            locale = preference === 'system' ? 'en' : preference.toLowerCase();
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

async function loadI18n(locale = 'en') {
    mocks.locale = locale;
    const i18nModule = await import('./index.js');
    await vi.waitFor(() => expect(mocks.getState).toHaveBeenCalled());
    return i18nModule;
}

describe('renderer i18n', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mocks.locale = 'en';
    });

    it('initializes from the DI i18n bridge state', async () => {
        const { default: i18n } = await loadI18n();

        await vi.waitFor(() => {
            expect(i18n.resolvedLanguage).toBe('en');
            expect(i18n.t('greeting', { ns: 'common' })).toBe('Hello');
        });
    });

    it.each([
        ['pt-br', 'Olá'],
        ['zh-cn', '你好 (简体)'],
        ['zh-tw', '你好 (繁體)'],
    ])('starts in the %s regional locale', async (locale, greeting) => {
        const { default: i18n } = await loadI18n(locale);

        await vi.waitFor(() => {
            expect(i18n.resolvedLanguage).toBe(locale);
            expect(i18n.t('greeting', { ns: 'common' })).toBe(greeting);
        });
    });

    it('persists the preference before applying returned resources', async () => {
        const { changeLanguage, default: i18n } = await loadI18n('de');
        await vi.waitFor(() => {
            expect(i18n.resolvedLanguage).toBe('de');
            expect(i18n.t('greeting', { ns: 'common' })).toBe('Hallo');
        });

        await changeLanguage('pt-BR');

        expect(mocks.changeLanguage).toHaveBeenCalledWith('pt-BR');
        expect(mocks.getState).toHaveBeenCalled();
        expect(mocks.locale).toBe('pt-br');
        expect(i18n.resolvedLanguage).toBe('pt-br');
        expect(i18n.t('greeting', { ns: 'common' })).toBe('Olá');
    });

    it('falls back to English for an unsupported locale', async () => {
        const { default: i18n } = await loadI18n('unsupported');

        await vi.waitFor(() => {
            expect(i18n.resolvedLanguage).toBe('en');
            expect(i18n.t('greeting', { ns: 'common' })).toBe('Hello');
        });
    });
});
