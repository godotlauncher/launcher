import logger from 'electron-log';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appBridge } from '../../bridge.ts';
import { changeLanguage } from '../../i18n';
import { SelectField } from '../ui/selectField.component';

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

/**
 * Renders the application language preference.
 *
 * @returns The language selector and its update status.
 */
export const LanguageSelector: React.FC = () => {
    const { t } = useTranslation('settings');
    const [selectedLanguage, setSelectedLanguage] = useState<string>('system');
    const [isChanging, setIsChanging] = useState(false);

    // Load current language preference on mount
    useEffect(() => {
        const loadCurrentLanguage = async () => {
            try {
                const prefs = await appBridge.getUserPreferences();
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

    /**
     * Persists and applies a new application language.
     *
     * @param newLanguage - Locale code selected by the user.
     * @returns A promise that ends when the language update finishes.
     */
    const handleLanguageChange = async (newLanguage: string): Promise<void> => {
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
        } finally {
            setIsChanging(false);
        }
    };

    return (
        <div className="flex w-full flex-col gap-1">
            <SelectField
                id="selectLanguage"
                testId="selectLanguage"
                label={t('general.language.label', 'Language')}
                value={selectedLanguage}
                onChange={(value) => void handleLanguageChange(value)}
                disabled={isChanging}
                options={LANGUAGE_OPTIONS.map((option) => ({
                    value: option.code,
                    label:
                        option.code === 'system'
                            ? t('general.language.system', option.name)
                            : option.name,
                }))}
                showSelectedCheck
            />
            <p className="text-xs text-base-content/70">
                {t(
                    'general.language.description',
                    'Select your preferred language',
                )}
            </p>

            {isChanging && (
                <div className="mt-2 flex items-center gap-2">
                    <span className="loading loading-spinner loading-sm" />
                    <span className="text-sm text-base-content/70">
                        Changing language...
                    </span>
                </div>
            )}
        </div>
    );
};
