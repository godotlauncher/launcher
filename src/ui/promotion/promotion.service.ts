import logger from 'electron-log';

import { PROMOTION_MANIFEST_URL } from '../constants';
import i18n from '../i18n';
import { EMBEDDED_PROMOTION } from './embeddedPromotion';
import { resolvePromotionCopy } from './promotion.localization';
import {
    DEFAULT_COUNTDOWN_THRESHOLD_DAYS,
    type Promotion,
    type PromotionClickPayload,
    type PromotionCountdownMeta,
    type PromotionManifest,
    type PromotionManifestEntry,
} from './promotion.types';

const STORAGE_KEY = 'godot-launcher:promotion-cache';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_SECOND = 1000;

type PromotionCacheRecord = {
    entry: PromotionManifestEntry;
    fetchedAt: number;
};

type PromotionLocaleOptions = {
    locale?: string;
};

function readCache(now: number): PromotionManifestEntry | null {
    try {
        const serialized = window.localStorage.getItem(STORAGE_KEY);
        if (!serialized) {
            return null;
        }

        const cached: PromotionCacheRecord = JSON.parse(serialized);
        if (!cached?.entry || !cached?.fetchedAt) {
            window.localStorage.removeItem(STORAGE_KEY);
            return null;
        }

        if (now - cached.fetchedAt > CACHE_TTL_MS) {
            window.localStorage.removeItem(STORAGE_KEY);
            return null;
        }

        return cached.entry;
    } catch (error) {
        logger.warn('[promotion] Unable to read cached promotion.', error);
        return null;
    }
}

function writeCache(entry: PromotionManifestEntry) {
    try {
        const cache: PromotionCacheRecord = {
            entry,
            fetchedAt: Date.now(),
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
        logger.warn('[promotion] Unable to persist promotion cache.', error);
    }
}

async function fetchRemoteManifest(): Promise<PromotionManifestEntry | null> {
    try {
        const response = await fetch(PROMOTION_MANIFEST_URL, {
            cache: 'no-store',
        });

        if (!response.ok) {
            logger.warn(
                '[promotion] Manifest request failed',
                response.status,
                response.statusText,
            );
            return null;
        }

        const data = (await response.json()) as
            | PromotionManifest
            | PromotionManifestEntry;

        if ('promotions' in data) {
            return (
                data.promotions?.find((entry) => entry?.enabled ?? true) ?? null
            );
        }

        // Treat direct entry as manifest
        const entry = data as PromotionManifestEntry;
        if (entry?.enabled === false) {
            return null;
        }
        return entry;
    } catch (error) {
        logger.warn('[promotion] Failed to download manifest.', error);
        return null;
    }
}

export function normalizePromotion(
    entry: PromotionManifestEntry | null | undefined,
    now = new Date(),
    locale?: string,
): Promotion | null {
    if (!entry) {
        return null;
    }

    if (entry.enabled === false) {
        return null;
    }

    if (!entry.id || !entry.title || !entry.expiresAt) {
        return null;
    }

    const expiresAt = new Date(entry.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
        return null;
    }

    if (expiresAt.getTime() <= now.getTime()) {
        return null;
    }

    const countdownThresholdDays = Math.max(
        0,
        entry.countdownThresholdDays ?? DEFAULT_COUNTDOWN_THRESHOLD_DAYS,
    );

    const localized = resolvePromotionCopy(entry, locale);

    return {
        id: entry.id,
        title: localized?.title ?? entry.title,
        description: localized?.description ?? entry.description,
        ctaLabel: localized?.ctaLabel ?? entry.ctaLabel,
        expiresAt,
        countdownThresholdDays,
        externalLink: entry.externalLink ?? null,
        countdownSingularLabel:
            localized?.countdownSingularLabel ?? entry.countdownSingularLabel,
        countdownPluralLabel:
            localized?.countdownPluralLabel ?? entry.countdownPluralLabel,
        countdownHourLabel:
            localized?.countdownHourLabel ?? entry.countdownHourLabel,
        countdownMinuteLabel:
            localized?.countdownMinuteLabel ?? entry.countdownMinuteLabel,
    };
}

export function isPromotionActive(
    promotion: Promotion | null,
    now = new Date(),
): promotion is Promotion {
    if (!promotion) {
        return false;
    }
    return promotion.expiresAt.getTime() > now.getTime();
}

export function calculateCountdownMeta(
    promotion: Promotion,
    now = new Date(),
): PromotionCountdownMeta | null {
    if (promotion.countdownThresholdDays <= 0) {
        return null;
    }

    const msRemaining = promotion.expiresAt.getTime() - now.getTime();

    if (msRemaining <= 0) {
        return null;
    }

    const windowMs = promotion.countdownThresholdDays * MS_PER_DAY;
    if (msRemaining > windowMs) {
        return null;
    }

    const percentageRemaining = Math.min(
        1,
        Math.max(0, msRemaining / windowMs),
    );

    if (msRemaining <= MS_PER_HOUR) {
        const totalSeconds = Math.max(
            0,
            Math.ceil(msRemaining / MS_PER_SECOND),
        );
        const minutesRemaining = Math.floor(totalSeconds / 60);
        const secondsRemaining = totalSeconds % 60;
        return {
            mode: 'minutes',
            minutesRemaining,
            secondsRemaining,
            percentageRemaining,
        };
    }

    if (msRemaining <= MS_PER_DAY) {
        const hoursRemaining = Math.max(
            1,
            Math.ceil(msRemaining / MS_PER_HOUR),
        );
        return {
            mode: 'hours',
            hoursRemaining,
            percentageRemaining,
        };
    }

    const daysRemaining = Math.max(1, Math.ceil(msRemaining / MS_PER_DAY));
    return {
        mode: 'days',
        daysRemaining,
        percentageRemaining,
    };
}

async function fetchRemotePromotion(
    now = new Date(),
    locale?: string,
): Promise<Promotion | null> {
    const remoteEntry = await fetchRemoteManifest();

    if (remoteEntry) {
        writeCache(remoteEntry);
        return normalizePromotion(remoteEntry, now, locale);
    }

    const cachedEntry = readCache(now.getTime());
    return normalizePromotion(cachedEntry, now, locale);
}

export function getEmbeddedPromotion(
    now = new Date(),
    locale?: string,
): Promotion | null {
    return normalizePromotion(EMBEDDED_PROMOTION, now, locale);
}

async function resolvePromotionLocale(
    options?: PromotionLocaleOptions,
): Promise<string | undefined> {
    if (options?.locale) {
        return options.locale;
    }

    try {
        const language = await window.electron?.i18n?.getCurrentLanguage?.();
        if (typeof language === 'string' && language.length > 0) {
            return language;
        }
    } catch (error) {
        logger.warn(
            '[promotion] Failed to resolve locale from Electron.',
            error,
        );
    }

    try {
        if (i18n?.language) {
            return i18n.language;
        }
    } catch (error) {
        logger.warn('[promotion] Failed to read locale from i18n.', error);
    }

    return undefined;
}

export async function fetchPromotion(
    now = new Date(),
    options?: PromotionLocaleOptions,
): Promise<Promotion | null> {
    const locale = await resolvePromotionLocale(options);

    const embedded = getEmbeddedPromotion(now, locale);
    if (embedded) {
        return embedded;
    }

    return fetchRemotePromotion(now, locale);
}

export function buildPromotionClickPayload(
    promotion: Promotion,
): PromotionClickPayload {
    return {
        id: promotion.id,
        externalLink: promotion.externalLink,
        expiresAt: promotion.expiresAt.toISOString(),
    };
}
