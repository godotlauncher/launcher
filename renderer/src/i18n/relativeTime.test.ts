import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeTime, resolveRelativeTimeLocale } from './relativeTime';

describe('relative time localization', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it.each([
        ['en', 'en'],
        ['de', 'de'],
        ['es', 'es'],
        ['fr', 'fr'],
        ['it', 'it'],
        ['ja', 'ja'],
        ['mt', 'mt'],
        ['pl', 'pl'],
        ['ru', 'ru'],
        ['tr', 'tr'],
        ['pt', 'pt-PT'],
        ['pt-BR', 'pt'],
        ['zh-CN', 'zh'],
        ['zh-TW', 'zh-Hant'],
    ])('maps launcher locale %s to %s', (locale, expected) => {
        expect(resolveRelativeTimeLocale(locale)).toBe(expected);
    });

    it('normalizes locale casing, whitespace, and underscores', () => {
        expect(resolveRelativeTimeLocale(' PT_br ')).toBe('pt');
        expect(resolveRelativeTimeLocale('ZH_tw')).toBe('zh-Hant');
    });

    it.each([
        undefined,
        '',
        'unsupported',
    ])('falls back to English for %s', (locale) => {
        expect(resolveRelativeTimeLocale(locale)).toBe('en');
    });

    it.each([
        ['en', '2 hours ago'],
        ['de', 'vor 2 Stunden'],
        ['es', 'hace 2 horas'],
        ['ja', '2 時間前'],
        ['pt', 'há 2 horas'],
        ['pt-BR', 'há 2 horas'],
        ['zh-CN', '2小时前'],
        ['zh-TW', '2 小時前'],
    ])('formats relative time in %s', (locale, expected) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));

        expect(
            formatRelativeTime(
                new Date('2026-08-02T10:00:00Z').getTime(),
                locale,
            ),
        ).toBe(expected);
    });

    it('uses locale plural rules', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));

        expect(
            formatRelativeTime(
                new Date('2026-08-02T11:00:00Z').getTime(),
                'de',
            ),
        ).toBe('vor 1 Stunde');
        expect(
            formatRelativeTime(
                new Date('2026-08-02T10:00:00Z').getTime(),
                'de',
            ),
        ).toBe('vor 2 Stunden');
    });
});
