import TimeAgo from 'javascript-time-ago';
import 'javascript-time-ago/locale/de';
import 'javascript-time-ago/locale/en';
import 'javascript-time-ago/locale/es';
import 'javascript-time-ago/locale/fr';
import 'javascript-time-ago/locale/it';
import 'javascript-time-ago/locale/ja';
import 'javascript-time-ago/locale/mt';
import 'javascript-time-ago/locale/pl';
import 'javascript-time-ago/locale/pt';
import 'javascript-time-ago/locale/pt-PT';
import 'javascript-time-ago/locale/ru';
import 'javascript-time-ago/locale/tr';
import 'javascript-time-ago/locale/zh';
import 'javascript-time-ago/locale/zh-Hant';

const DEFAULT_RELATIVE_TIME_LOCALE = 'en';

const RELATIVE_TIME_LOCALES: Readonly<Record<string, string>> = {
    de: 'de',
    en: 'en',
    es: 'es',
    fr: 'fr',
    it: 'it',
    ja: 'ja',
    mt: 'mt',
    pl: 'pl',
    pt: 'pt-PT',
    'pt-br': 'pt',
    ru: 'ru',
    tr: 'tr',
    'zh-cn': 'zh',
    'zh-tw': 'zh-Hant',
};

const formatters = new Map<string, TimeAgo>();

export function resolveRelativeTimeLocale(locale?: string): string {
    const normalizedLocale = locale?.trim().replace(/_/g, '-').toLowerCase();

    if (!normalizedLocale) {
        return DEFAULT_RELATIVE_TIME_LOCALE;
    }

    return (
        RELATIVE_TIME_LOCALES[normalizedLocale] ?? DEFAULT_RELATIVE_TIME_LOCALE
    );
}

export function formatRelativeTime(
    timestamp: number | Date,
    locale: string,
): string {
    const resolvedLocale = resolveRelativeTimeLocale(locale);
    let formatter = formatters.get(resolvedLocale);

    if (!formatter) {
        formatter = new TimeAgo(resolvedLocale);
        formatters.set(resolvedLocale, formatter);
    }

    return formatter.format(timestamp);
}
