import type React from 'react';
import { LanguageSelector } from '../../../components/settings/LanguageSelector';
import type { ThemeMode } from '../../../hooks/useTheme';
import { SettingsPanelSection } from './settingsPanelSection.component';

type Translate = (key: string) => string;

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

type AppearanceSettingsPanelProps = {
    active: boolean;
    t: Translate;
    theme: ThemeMode | null;
    onThemeChange: (theme: ThemeMode) => void;
};

export const AppearanceSettingsPanel: React.FC<
    AppearanceSettingsPanelProps
> = ({ active, t, theme, onThemeChange }) => (
    <SettingsPanelSection active={active}>
        <div className="flex flex-col">
            <h1 data-testid="themeHeader" className="font-bold">
                {t('appearance.theme.title')}
            </h1>
            <p data-testid="themeSubHeader" className="text-sm">
                {t('appearance.theme.description')}
            </p>
            <div className=" flex flex-row flex-0 p-4 gap-4">
                {themeOptions.map((option) => (
                    <label
                        key={option.value}
                        className="flex flex-row  items-center justify-start  gap-4 cursor-pointer "
                    >
                        <input
                            onChange={(event) => {
                                if (event.target.checked) {
                                    onThemeChange(option.value);
                                }
                            }}
                            data-testid={option.testId}
                            type="radio"
                            name="theme-select"
                            className="radio"
                            checked={theme === option.value}
                        />
                        <span className="">{t(option.labelKey)}</span>
                    </label>
                ))}
            </div>
        </div>
        <div className="divider"></div>

        <LanguageSelector />
    </SettingsPanelSection>
);
