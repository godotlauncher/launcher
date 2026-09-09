import logger from 'electron-log';

import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAlerts } from '../../hooks/alerts.hook';
import { useRelease } from '../../hooks/release.hook';
import { SettingsSection } from './settings-section.component';

const STORAGE_KEY = 'gdlauncher.clearReleaseCache.lastClearedAt';
const COOLDOWN_SECONDS = 60;

const calculateRemainingSeconds = (timestamp: number | null) => {
    if (timestamp === null) {
        return 0;
    }

    const elapsedSeconds = Math.floor((Date.now() - timestamp) / 1000);
    return Math.max(0, COOLDOWN_SECONDS - elapsedSeconds);
};

const getStoredTimestamp = (): number | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const preset = window.localStorage.getItem(STORAGE_KEY);
        if (!preset) {
            return null;
        }

        const parsed = Number.parseInt(preset, 10);
        return Number.isFinite(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const persistTimestamp = (timestamp: number | null) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        if (timestamp === null) {
            window.localStorage.removeItem(STORAGE_KEY);
            return;
        }

        window.localStorage.setItem(STORAGE_KEY, timestamp.toString());
    } catch {
        // Intentionally ignore storage errors (e.g. quota exceeded, sandboxed env).
    }
};

export const ClearReleaseCacheControl: React.FC = () => {
    const { t } = useTranslation('settings');
    const {
        clearReleaseCache,
        refreshAvailableReleases,
        loading: releaseLoading,
    } = useRelease();
    const { addAlert } = useAlerts();
    const [lastClearedAt, setLastClearedAt] = useState<number | null>(() =>
        getStoredTimestamp(),
    );
    const [remainingSeconds, setRemainingSeconds] = useState(() =>
        calculateRemainingSeconds(getStoredTimestamp()),
    );
    const [isProcessing, setIsProcessing] = useState(false);

    const updateRemaining = useCallback((timestamp: number | null) => {
        const remaining = calculateRemainingSeconds(timestamp);
        setRemainingSeconds(remaining);
        if (remaining <= 0 && timestamp !== null) {
            setLastClearedAt(null);
            persistTimestamp(null);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        updateRemaining(lastClearedAt);

        if (lastClearedAt === null) {
            return;
        }

        const intervalId = window.setInterval(() => {
            updateRemaining(lastClearedAt);
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [lastClearedAt, updateRemaining]);

    const isCooldownActive = remainingSeconds > 0;

    const buttonDisabled = isCooldownActive || isProcessing || releaseLoading;

    const buttonLabel = useMemo(() => {
        if (isProcessing) {
            return t('behavior.clearReleaseCache.clearing');
        }

        const baseLabel = t('behavior.clearReleaseCache.cta');

        if (isCooldownActive) {
            return `${baseLabel} (${remainingSeconds})`;
        }

        return baseLabel;
    }, [isCooldownActive, isProcessing, remainingSeconds, t]);

    const handleClear = useCallback(async () => {
        if (buttonDisabled || isProcessing) {
            return;
        }

        setIsProcessing(true);
        try {
            await clearReleaseCache();
            await refreshAvailableReleases();
            addAlert(
                t('behavior.clearReleaseCache.successTitle'),
                t('behavior.clearReleaseCache.successMessage'),
                undefined,
                'success',
            );
            const timestamp = Date.now();
            setLastClearedAt(timestamp);
            setRemainingSeconds(COOLDOWN_SECONDS);
            persistTimestamp(timestamp);
        } catch (error) {
            logger.error('Failed to clear release cache', error);
            addAlert(
                t('behavior.clearReleaseCache.errorTitle'),
                t('behavior.clearReleaseCache.errorMessage'),
            );
        } finally {
            setIsProcessing(false);
        }
    }, [
        addAlert,
        buttonDisabled,
        clearReleaseCache,
        isProcessing,
        refreshAvailableReleases,
        t,
    ]);

    return (
        <SettingsSection
            title={t('behavior.clearReleaseCache.title')}
            description={t('behavior.clearReleaseCache.description')}
        >
            {isCooldownActive && (
                <div className="alert alert-warning alert-soft text-warning-content dark:text-warning flex items-center gap-2 py-2 px-3 w-fit sm:w-auto">
                    <AlertTriangle
                        className="h-4 w-4 shrink-0"
                        aria-hidden="true"
                    />
                    <span>
                        {t('behavior.clearReleaseCache.cooldownNotice')}
                    </span>
                </div>
            )}
            <button
                type="button"
                className="btn btn-ghost w-fit text-base"
                disabled={buttonDisabled}
                onClick={() => {
                    void handleClear();
                }}
            >
                {buttonLabel}
            </button>
        </SettingsSection>
    );
};
