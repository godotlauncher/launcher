import {
    PromotionLocalizedFields,
    PromotionManifestEntry,
} from './promotion.types';

const DEFAULT_LOCALE = 'en';

const LOCALE_FALLBACKS: Record<string, readonly string[]> = {
    'pt-BR': ['pt', DEFAULT_LOCALE],
    pt: [DEFAULT_LOCALE],
    'zh-CN': ['zh-TW', DEFAULT_LOCALE],
    'zh-TW': ['zh-CN', DEFAULT_LOCALE],
    de: [DEFAULT_LOCALE],
    fr: [DEFAULT_LOCALE],
    es: [DEFAULT_LOCALE],
    pl: [DEFAULT_LOCALE],
    ru: [DEFAULT_LOCALE],
    ja: [DEFAULT_LOCALE],
    tr: [DEFAULT_LOCALE],
    mt: [DEFAULT_LOCALE],
    default: [DEFAULT_LOCALE],
};

function canonicalizeLocale(locale?: string): string | null {
    if (!locale) {
        return null;
    }

    const normalized = locale.replace('_', '-');

    try {
        const [canonical] = Intl.getCanonicalLocales(normalized);
        if (canonical) {
            return canonical;
        }
    } catch {
        // Ignore failures and fall back to manual normalization
    }

    const [language, region] = normalized.split('-');
    if (region) {
        return `${language.toLowerCase()}-${region.toUpperCase()}`;
    }

    return language.toLowerCase();
}

function pushIfMissing(target: string[], candidate?: string | null) {
    if (!candidate) {
        return;
    }

    if (!target.includes(candidate)) {
        target.push(candidate);
    }
}

function buildFallbackChain(locale?: string): string[] {
    const chain: string[] = [];
    const canonical = canonicalizeLocale(locale);

    pushIfMissing(chain, canonical);

    if (canonical && canonical.includes('-')) {
        const [baseLanguage] = canonical.split('-');
        pushIfMissing(chain, baseLanguage);
    }

    const configuredFallbacks = canonical
        ? LOCALE_FALLBACKS[canonical] ?? LOCALE_FALLBACKS.default
        : LOCALE_FALLBACKS.default;

    configuredFallbacks.forEach((fallback) => pushIfMissing(chain, fallback));

    pushIfMissing(chain, DEFAULT_LOCALE);

    return chain;
}

export function resolvePromotionCopy(
    entry: PromotionManifestEntry,
    locale?: string
): PromotionLocalizedFields | null {
    if (!entry.localizedCopy) {
        return null;
    }

    const chain = buildFallbackChain(locale);

    for (const candidate of chain) {
        const localized = entry.localizedCopy[candidate];
        if (localized) {
            return localized;
        }
    }

    return null;
}

export function getDefaultPromotionLocale(): string {
    return DEFAULT_LOCALE;
}
