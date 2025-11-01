import { describe, expect, it } from 'vitest';

import {
    buildPromotionClickPayload,
    calculateCountdownMeta,
    getEmbeddedPromotion,
    isPromotionActive,
    normalizePromotion,
} from './promotion.service';
import { DEFAULT_COUNTDOWN_THRESHOLD_DAYS, Promotion } from './promotion.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('normalizePromotion', () => {
    it('returns a promotion when entry is valid', () => {
        const now = new Date('2025-12-01T00:00:00Z');
        const entry = {
            id: 'survey-2025',
            title: 'Fill our survey',
            expiresAt: new Date(now.getTime() + 5 * MS_PER_DAY).toISOString(),
            description: 'Help shape the launcher.',
            externalLink: 'https://example.com',
            countdownSingularLabel: '{count} day remaining',
            countdownPluralLabel: '{count} days remaining',
            countdownHourLabel: '{count} hours remaining',
            countdownMinuteLabel: '{minutes}m {seconds}s remaining',
        };

        const promotion = normalizePromotion(entry, now);
        expect(promotion).toBeTruthy();
        expect(promotion?.id).toBe(entry.id);
        expect(promotion?.countdownThresholdDays).toBe(DEFAULT_COUNTDOWN_THRESHOLD_DAYS);
        expect(promotion?.externalLink).toBe(entry.externalLink);
        expect(promotion?.countdownSingularLabel).toBe(entry.countdownSingularLabel);
        expect(promotion?.countdownPluralLabel).toBe(entry.countdownPluralLabel);
        expect(promotion?.countdownHourLabel).toBe(entry.countdownHourLabel);
        expect(promotion?.countdownMinuteLabel).toBe(entry.countdownMinuteLabel);
    });

    it('returns null when entry is disabled or expired', () => {
        const now = new Date('2025-12-01T00:00:00Z');
        const disabled = {
            id: 'survey-2025',
            title: 'Fill our survey',
            expiresAt: new Date(now.getTime() + 5 * MS_PER_DAY).toISOString(),
            enabled: false,
        };

        const expired = {
            id: 'survey-2025',
            title: 'Fill our survey',
            expiresAt: new Date(now.getTime() - MS_PER_DAY).toISOString(),
        };

        expect(normalizePromotion(disabled, now)).toBeNull();
        expect(normalizePromotion(expired, now)).toBeNull();
    });

    it('applies localized copy when available for locale', () => {
        const now = new Date('2025-12-01T00:00:00Z');
        const entry = {
            id: 'survey-2025',
            title: 'Fill our survey',
            description: 'Help shape the launcher.',
            ctaLabel: 'Share feedback',
            expiresAt: new Date(now.getTime() + 5 * MS_PER_DAY).toISOString(),
            countdownSingularLabel: '{count} day remaining',
            countdownPluralLabel: '{count} days remaining',
            localizedCopy: {
                it: {
                    title: 'Aiuta a migliorare Godot Launcher',
                    ctaLabel: 'Invia il tuo feedback',
                    countdownSingularLabel: 'Manca {count} giorno',
                },
            },
        };

        const promotion = normalizePromotion(entry, now, 'it');
        expect(promotion?.title).toBe('Aiuta a migliorare Godot Launcher');
        expect(promotion?.ctaLabel).toBe('Invia il tuo feedback');
        expect(promotion?.countdownSingularLabel).toBe('Manca {count} giorno');
        expect(promotion?.description).toBe('Help shape the launcher.');
    });

    it('falls back to base locale when localized copy is missing', () => {
        const now = new Date('2025-12-01T00:00:00Z');
        const entry = {
            id: 'survey-2025',
            title: 'Fill our survey',
            description: 'Help shape the launcher.',
            ctaLabel: 'Share feedback',
            expiresAt: new Date(now.getTime() + 5 * MS_PER_DAY).toISOString(),
            countdownPluralLabel: '{count} days remaining',
            localizedCopy: {
                pt: {
                    ctaLabel: 'Partilhar feedback',
                    countdownPluralLabel: 'Faltam {count} dias',
                },
            },
        };

        const promotion = normalizePromotion(entry, now, 'pt-BR');
        expect(promotion?.ctaLabel).toBe('Partilhar feedback');
        expect(promotion?.countdownPluralLabel).toBe('Faltam {count} dias');
        expect(promotion?.title).toBe('Fill our survey');
    });

    it('canonicalizes locale variants before lookup', () => {
        const now = new Date('2025-12-01T00:00:00Z');
        const entry = {
            id: 'survey-2025',
            title: 'Fill our survey',
            expiresAt: new Date(now.getTime() + 5 * MS_PER_DAY).toISOString(),
            localizedCopy: {
                'pt-BR': {
                    ctaLabel: 'Enviar feedback',
                },
            },
        };

        const promotion = normalizePromotion(entry, now, 'pt_br');
        expect(promotion?.ctaLabel).toBe('Enviar feedback');
    });
});

describe('calculateCountdownMeta', () => {
    it('returns countdown when within window', () => {
        const now = new Date('2025-12-20T00:00:00Z');
        const promotion: Promotion = {
            id: 'survey',
            title: 'Survey',
            expiresAt: new Date(now.getTime() + 3 * MS_PER_DAY),
            countdownThresholdDays: 5,
            externalLink: null,
        };

        const result = calculateCountdownMeta(promotion, now);
        expect(result).toBeTruthy();
        expect(result?.mode).toBe('days');
        if (result && result.mode === 'days') {
            expect(result.daysRemaining).toBe(3);
        }
        expect(result?.percentageRemaining).toBeGreaterThan(0);
    });

    it('returns null when outside countdown window', () => {
        const now = new Date('2025-12-01T00:00:00Z');
        const promotion: Promotion = {
            id: 'survey',
            title: 'Survey',
            expiresAt: new Date(now.getTime() + 12 * MS_PER_DAY),
            countdownThresholdDays: 5,
            externalLink: null,
        };

        const result = calculateCountdownMeta(promotion, now);
        expect(result).toBeNull();
    });
});

    it('returns hours countdown within last day', () => {
        const now = new Date('2025-12-24T12:00:00Z');
        const promotion: Promotion = {
            id: 'survey',
            title: 'Survey',
            expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000),
            countdownThresholdDays: 5,
            externalLink: null,
        };

        const result = calculateCountdownMeta(promotion, now);
        expect(result).toBeTruthy();
        expect(result?.mode).toBe('hours');
        if (result && result.mode === 'hours') {
            expect(result.hoursRemaining).toBe(6);
        }
    });

    it('returns minute countdown within last hour', () => {
        const now = new Date('2025-12-24T12:00:00Z');
        const promotion: Promotion = {
            id: 'survey',
            title: 'Survey',
            expiresAt: new Date(now.getTime() + 15 * 60 * 1000 + 5 * 1000),
            countdownThresholdDays: 5,
            externalLink: null,
        };

        const result = calculateCountdownMeta(promotion, now);
        expect(result).toBeTruthy();
        expect(result?.mode).toBe('minutes');
        if (result && result.mode === 'minutes') {
            expect(result.minutesRemaining).toBe(15);
            expect(result.secondsRemaining).toBe(5);
        }
    });
describe('isPromotionActive', () => {
    it('checks if promotion is active at given time', () => {
        const now = new Date('2025-12-01T00:00:00Z');
        const promotion: Promotion = {
            id: 'survey',
            title: 'Survey',
            expiresAt: new Date(now.getTime() + MS_PER_DAY),
            countdownThresholdDays: 5,
            externalLink: null,
        };

        expect(isPromotionActive(promotion, now)).toBe(true);
        expect(isPromotionActive(promotion, new Date(now.getTime() + 2 * MS_PER_DAY))).toBe(false);
    });
});

describe('getEmbeddedPromotion', () => {
    it('returns embedded promotion when it is active', () => {
        const promotion = getEmbeddedPromotion(new Date('2025-07-01T00:00:00Z'));
        expect(promotion).toBeTruthy();
        expect(promotion?.id).toBe('survey-dec-2025');
    });

    it('returns localized embedded promotion copy when locale provided', () => {
        const promotion = getEmbeddedPromotion(
            new Date('2025-07-01T00:00:00Z'),
            'it'
        );
        expect(promotion?.title).toBe('Aiuta a migliorare Godot Launcher');
        expect(promotion?.ctaLabel).toBe('Invia il tuo feedback');
    });

    it('returns null when embedded promotion is expired', () => {
        const promotion = getEmbeddedPromotion(new Date('2026-01-02T00:00:00Z'));
        expect(promotion).toBeNull();
    });
});

describe('buildPromotionClickPayload', () => {
    it('builds payload with ISO expiration', () => {
        const expiresAt = new Date('2025-12-31T23:59:59Z');
        const promotion: Promotion = {
            id: 'survey',
            title: 'Survey',
            expiresAt,
            countdownThresholdDays: 5,
            externalLink: 'https://example.com',
        };

        const payload = buildPromotionClickPayload(promotion);
        expect(payload.id).toBe('survey');
        expect(payload.externalLink).toBe('https://example.com');
        expect(payload.expiresAt).toBe(expiresAt.toISOString());
    });
});
