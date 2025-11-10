import logger from 'electron-log';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../i18n';

interface LanguageOption {
    code: string;
    name: string;
}

// Available language options
const LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: 'system', name: 'System (Auto-detect)' },
    { code: 'en', name: 'English' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'zh-CN', name: '简体中文' },
    { code: 'zh-TW', name: '繁體中文' },
    { code: 'de', name: 'Deutsch' },
    { code: 'fr', name: 'Français' },
    { code: 'es', name: 'Español' },
    { code: 'pl', name: 'Polski' },
    { code: 'ru', name: 'Русский' },
    { code: 'ja', name: '日本語' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'mt', name: 'Malti' },
    // Add more languages here as they become available
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
                logger.error(
                    '[LanguageSelector] Failed to load language preference:',
                    error,
                );
            }
        };

        loadCurrentLanguage();
    }, []);

    const handleLanguageChange = async (
        event: React.ChangeEvent<HTMLSelectElement>,
    ) => {
        const newLanguage = event.target.value;

        if (newLanguage === selectedLanguage) {
            return; // No change
        }

        setIsChanging(true);

        try {
            logger.info(
                `[LanguageSelector] Changing language to: ${newLanguage}`,
            );

            // Change language (this updates preferences in backend and fetches new translations)
            await changeLanguage(newLanguage);

            // Update local state
            setSelectedLanguage(newLanguage);

            logger.info(
                `[LanguageSelector] Language changed successfully to: ${newLanguage}`,
            );
        } catch (error) {
            logger.error(
                '[LanguageSelector] Failed to change language:',
                error,
            );
            // Revert to previous selection on error
            event.target.value = selectedLanguage;
        } finally {
            setIsChanging(false);
        }
    };

    return (
        <div className="form-control w-full ">
            <div className="label">
                <span className="label-text font-semibold">
                    {t('general.language.label', 'Language')}
                </span>
            </div>
            <select
                className="select outline-0 w-full"
                value={selectedLanguage}
                onChange={handleLanguageChange}
                disabled={isChanging}
            >
                {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code} className="">
                        {option.code === 'system'
                            ? t('general.language.system', option.name)
                            : option.name}
                    </option>
                ))}
            </select>
            <div className="label">
                <span className="label-text-alt text-base-content/70">
                    {t(
                        'general.language.description',
                        'Select your preferred language',
                    )}
                </span>
            </div>

            {isChanging && (
                <div className="flex items-center gap-2 mt-2">
                    <span className="loading loading-spinner loading-sm"></span>
                    <span className="text-sm text-base-content/70">
                        Changing language...
                    </span>
                </div>
            )}
        </div>
    );
};
