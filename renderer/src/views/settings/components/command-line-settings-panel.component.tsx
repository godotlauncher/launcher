import { AutomaticAliasesControl } from '../../../components/settings/automatic-aliases-control.component';
import { LauncherCliPreview } from '../../../components/settings/launcher-cli-preview.component';
import { SettingsPanelSection } from './settings-panel-section.component';

/**
 * Groups global editor commands and the planned launcher CLI in one settings tab.
 * @param props - Whether the Command line tab is active.
 */
export function CommandLineSettingsPanel({ active }: { active: boolean }) {
    return (
        <SettingsPanelSection active={active}>
            <AutomaticAliasesControl />
            <LauncherCliPreview />
        </SettingsPanelSection>
    );
}
