import logger from 'electron-log';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    buildPromotionClickPayload,
    calculateCountdownMeta,
    fetchPromotion,
    isPromotionActive,
    type Promotion,
    type PromotionCountdownMeta,
} from '../promotion';
import type { PromotionClickPayload } from '../../types';

const TICK_DAY_MS = 60 * 60 * 1000; // 1 hour
const TICK_HOUR_MS = 60 * 1000; // 1 minute
const TICK_MINUTE_MS = 1000; // 1 second

function resolveTickInterval(countdown: PromotionCountdownMeta | null): number {
    if (!countdown) {
        return TICK_DAY_MS;
    }

    switch (countdown.mode) {
        case 'minutes':
            return TICK_MINUTE_MS;
        case 'hours':
            return TICK_HOUR_MS;
        default:
            return TICK_DAY_MS;
    }
}

export type UsePromotionResult = {
    promotion: Promotion | null;
    countdown: PromotionCountdownMeta | null;
    loading: boolean;
    error: unknown;
    refresh: () => Promise<void>;
    buildClickPayload: () => PromotionClickPayload | null;
};

export function usePromotion(): UsePromotionResult {
    const { i18n } = useTranslation();
    const [promotion, setPromotion] = useState<Promotion | null>(null);
    const [countdown, setCountdown] = useState<PromotionCountdownMeta | null>(
        null,
    );
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<unknown>(null);
    const lastLocaleRef = useRef<string | null>(null);

    const updateCountdown = useCallback(
        (currentPromotion: Promotion | null) => {
            if (!currentPromotion) {
                setCountdown(null);
                return;
            }

            const now = new Date();
            if (!isPromotionActive(currentPromotion, now)) {
                setPromotion(null);
                setCountdown(null);
                return;
            }

            const meta = calculateCountdownMeta(currentPromotion, now);
            setCountdown(meta);
        },
        [],
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchPromotion();
            setPromotion(result);
            updateCountdown(result);
        } catch (err) {
            logger.warn('[promotion] Failed to load promotion.', err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [updateCountdown]);

    useEffect(() => {
        const currentLocale = i18n.language ?? null;

        if (currentLocale === lastLocaleRef.current) {
            return;
        }

        lastLocaleRef.current = currentLocale;
        void load();
    }, [i18n.language, load]);

    useEffect(() => {
        if (!promotion) {
            return;
        }

        updateCountdown(promotion);
        const intervalId = window.setInterval(
            () => updateCountdown(promotion),
            resolveTickInterval(countdown),
        );

        return () => window.clearInterval(intervalId);
    }, [promotion, countdown?.mode, updateCountdown, countdown]);

    const buildClickPayload = useCallback(() => {
        if (!promotion) {
            return null;
        }

        return buildPromotionClickPayload(promotion);
    }, [promotion]);

    return useMemo(
        () => ({
            promotion,
            countdown,
            loading,
            error,
            refresh: load,
            buildClickPayload,
        }),
        [promotion, countdown, loading, error, load, buildClickPayload],
    );
}
