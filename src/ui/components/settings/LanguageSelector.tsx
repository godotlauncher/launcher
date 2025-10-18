import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../i18n';
import logger from 'electron-log';

interface LanguageOption {
    code: string;
    name: string;
}

// Available language options
const LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: 'system', name: 'System (Auto-detect)' },
    { code: 'en', name: 'English' },
    { code: 'it', name: 'Italiano' },
    // Add more languages here as they become available
    // { code: 'es', name: 'Español' },
    // { code: 'fr', name: 'Français' },
    // { code: 'de', name: 'Deutsch' },
];

export const LanguageSelector: React.FC = () => {
    const { t } = useTranslation('settings');
    const [selectedLanguage, setSelectedLanguage] = useState<string>('system');
    const [isChanging, setIsChanging] = useState(false);

    // Load current language preference on mount
    useEffect(() => {
        const loadCurrentLanguage = async () => {
            try {
                const prefs = await window.electron.getUserPreferences();
                setSelectedLanguage(prefs.language || 'system');
            } catch (error) {
                logger.error('[LanguageSelector] Failed to load language preference:', error);
            }
        };

        loadCurrentLanguage();
    }, []);

    const handleLanguageChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newLanguage = event.target.value;

        if (newLanguage === selectedLanguage) {
            return; // No change
        }

        setIsChanging(true);

        try {
            logger.info(`[LanguageSelector] Changing language to: ${newLanguage}`);

            // Change language (this updates preferences in backend and fetches new translations)
            await changeLanguage(newLanguage);

            // Update local state
            setSelectedLanguage(newLanguage);

            logger.info(`[LanguageSelector] Language changed successfully to: ${newLanguage}`);
        } catch (error) {
            logger.error('[LanguageSelector] Failed to change language:', error);
            // Revert to previous selection on error
            event.target.value = selectedLanguage;
        } finally {
            setIsChanging(false);
        }
    };

    return (
        <div className="form-control w-full">
            <label className="label">
                <span className="label-text font-semibold">
                    {t('general.language.label', 'Language')}
                </span>
            </label>
            <select
                className="select select-bordered w-full"
                value={selectedLanguage}
                onChange={handleLanguageChange}
                disabled={isChanging}
            >
                {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                        {option.code === 'system'
                            ? t('general.language.system', option.name)
                            : option.name
                        }
                    </option>
                ))}
            </select>
            <label className="label">
                <span className="label-text-alt text-base-content/70">
                    {t('general.language.description', 'Select your preferred language')}
                </span>
            </label>

            {isChanging && (
                <div className="flex items-center gap-2 mt-2">
                    <span className="loading loading-spinner loading-sm"></span>
                    <span className="text-sm text-base-content/70">Changing language...</span>
                </div>
            )}
        </div>
    );
};
