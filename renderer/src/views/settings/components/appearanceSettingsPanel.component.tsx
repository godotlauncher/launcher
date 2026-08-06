import type React from 'react';
import { LanguageSelector } from '../../../components/settings/LanguageSelector';
import { ThemeSelector } from '../../../components/settings/theme-selector.component';
import type { ThemeMode } from '../../../hooks/useTheme';
import { SettingsPanelSection } from './settingsPanelSection.component';

type AppearanceSettingsPanelProps = {
    active: boolean;
    theme: ThemeMode | null;
    onThemeChange: (theme: ThemeMode) => void;
};

export const AppearanceSettingsPanel: React.FC<
    AppearanceSettingsPanelProps
> = ({ active, theme, onThemeChange }) => (
    <SettingsPanelSection active={active}>
        <ThemeSelector theme={theme} onThemeChange={onThemeChange} />
        <div className="divider"></div>

        <LanguageSelector />
    </SettingsPanelSection>
);
