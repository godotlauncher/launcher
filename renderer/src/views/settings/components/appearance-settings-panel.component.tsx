import type React from 'react';
import { LanguageSelector } from '../../../components/settings/language-select.component';
import { ThemeSelector } from '../../../components/settings/theme-selector.component';
import { ContentDivider } from '../../../components/ui/content-divider.component';
import type { ThemeMode } from '../../../hooks/theme.hook';
import { SettingsPanelSection } from './settings-panel-section.component';

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
        <ContentDivider />

        <LanguageSelector />
    </SettingsPanelSection>
);
