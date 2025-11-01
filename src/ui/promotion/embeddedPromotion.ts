import { LOCALIZED_EMBEDDED_PROMOTION_COPY } from './embeddedPromotion.locales';
import { PromotionManifestEntry } from './promotion.types';

export const EMBEDDED_PROMOTION: PromotionManifestEntry | null = {
    id: 'survey-dec-2025',
    title: 'Help shape Godot Launcher',
    description: 'Help Shape the Future of Godot Launcher 🚀',
    ctaLabel: 'Share feedback',
    expiresAt: '2025-12-31T23:59:59Z',
    countdownThresholdDays: 10,
    countdownSingularLabel: '{count} day left',
    countdownPluralLabel: '{count} days left',
    countdownHourLabel: '{count} hours left',
    countdownMinuteLabel: '{minutes} minutes {seconds} seconds left',
    externalLink: 'https://forms.gle/g6g3pc4gbnbPgvtdA',
    enabled: true,
    localizedCopy: LOCALIZED_EMBEDDED_PROMOTION_COPY,
};
