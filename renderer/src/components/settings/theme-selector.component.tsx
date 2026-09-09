import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemeMode } from '../../hooks/theme.hook';
import { SettingsSection } from './settings-section.component';

const themeOptions: Array<{
    value: ThemeMode;
    testId: string;
    labelKey: string;
}> = [
    {
        value: 'light',
        testId: 'themeLight',
        labelKey: 'appearance.theme.light',
    },
    {
        value: 'dark',
        testId: 'themeDark',
        labelKey: 'appearance.theme.dark',
    },
    {
        value: 'auto',
        testId: 'themeAuto',
        labelKey: 'appearance.theme.system',
    },
];

type ThemeSelectorProps = {
    theme: ThemeMode | null;
    onThemeChange: (theme: ThemeMode) => void;
    disabled?: boolean;
};

/**
 * Renders the theme preference with shared section styling.
 * @param props - Selected theme, change callback and disabled state.
 * @returns The labelled theme radio group.
 */
export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
    theme,
    onThemeChange,
    disabled = false,
}) => {
    const { t } = useTranslation('settings');

    return (
        <SettingsSection
            title={t('appearance.theme.title')}
            description={t('appearance.theme.description')}
            titleTestId="themeHeader"
            descriptionTestId="themeSubHeader"
        >
            <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
                <legend className="sr-only">
                    {t('appearance.theme.title')}
                </legend>
                {themeOptions.map((option) => (
                    <label
                        key={option.value}
                        className="flex min-h-8 items-center gap-2"
                    >
                        <input
                            onChange={(event) => {
                                if (event.currentTarget.checked) {
                                    onThemeChange(option.value);
                                }
                            }}
                            data-testid={option.testId}
                            type="radio"
                            name="theme-select"
                            className="radio radio-sm"
                            checked={theme === option.value}
                            disabled={disabled}
                        />
                        <span>{t(option.labelKey)}</span>
                    </label>
                ))}
            </fieldset>
        </SettingsSection>
    );
};
