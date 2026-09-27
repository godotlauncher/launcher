import {
    Code,
    Download,
    Folder,
    FolderArchive,
    Palette,
    Plug,
    RefreshCw,
    SlidersHorizontal,
    Wrench,
} from 'lucide-react';
import type React from 'react';
import { type SettingsTab, settingsTabs } from '../../../app.routes';
import { VerticalTabMenu } from '../../../components/ui/vertical-tab-menu.component';

type Translate = (key: string) => string;

const settingsTabTestIds: Record<SettingsTab, string> = {
    projects: 'tabProjects',
    installs: 'tabInstalls',
    exportTemplates: 'tabExportTemplates',
    appearance: 'tabAppearance',
    behavior: 'tabBehavior',
    codeEditors: 'tabCodeEditors',
    tools: 'tabTools',
    connections: 'tabConnections',
    updates: 'tabUpdates',
};

const settingsTabIcons = {
    projects: Folder,
    installs: Download,
    exportTemplates: FolderArchive,
    appearance: Palette,
    behavior: SlidersHorizontal,
    codeEditors: Code,
    tools: Wrench,
    connections: Plug,
    updates: RefreshCw,
};

type SettingsTabsProps = {
    activeTab: SettingsTab;
    t: Translate;
    onActiveTabChange: (tab: SettingsTab) => void;
};

/**
 * Renders the vertical settings menu with keyboard navigation.
 * @param props - Active section, translated labels and navigation callback.
 */
export const SettingsTabs: React.FC<SettingsTabsProps> = ({
    activeTab,
    t,
    onActiveTabChange,
}) => (
    <VerticalTabMenu
        ariaLabel={t('title')}
        activeTab={activeTab}
        onActiveTabChange={onActiveTabChange}
        items={settingsTabs.map((tab) => ({
            value: tab,
            label: t(`tabs.${tab}`),
            icon: settingsTabIcons[tab],
            id: `settings-tab-${tab}`,
            panelId: 'settings-panel',
            testId: settingsTabTestIds[tab],
        }))}
    />
);
