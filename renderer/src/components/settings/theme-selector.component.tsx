import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemeMode } from '../../hooks/useTheme';

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

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
    theme,
    onThemeChange,
    disabled = false,
}) => {
    const { t } = useTranslation('settings');

    return (
        <fieldset className="flex flex-col gap-1">
            <legend data-testid="themeHeader" className="font-bold">
                {t('appearance.theme.title')}
            </legend>
            <p
                data-testid="themeSubHeader"
                className="text-sm text-base-content/65"
            >
                {t('appearance.theme.description')}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 px-1 py-3">
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
                            className="radio radio-primary radio-sm"
                            checked={theme === option.value}
                            disabled={disabled}
                        />
                        <span>{t(option.labelKey)}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
};
