import clsx from 'clsx';
import type React from 'react';
import { type SettingsTab, settingsTabs } from '../../../routes';

type Translate = (key: string) => string;

const settingsTabTestIds: Record<SettingsTab, string> = {
    projects: 'tabProjects',
    installs: 'tabInstalls',
    appearance: 'tabAppearance',
    behavior: 'tabBehavior',
    tools: 'tabTools',
    updates: 'tabUpdates',
};

type SettingsTabsProps = {
    activeTab: SettingsTab;
    t: Translate;
    onActiveTabChange: (tab: SettingsTab) => void;
};

export const SettingsTabs: React.FC<SettingsTabsProps> = ({
    activeTab,
    t,
    onActiveTabChange,
}) => (
    <div role="tablist" className="flex tabs tabs-lift">
        {settingsTabs.map((tab) => (
            <button
                key={tab}
                type="button"
                data-testid={settingsTabTestIds[tab]}
                onClick={() => onActiveTabChange(tab)}
                role="tab"
                className={clsx('tab', {
                    'tab-active': activeTab === tab,
                })}
            >
                {t(`tabs.${tab}`)}
            </button>
        ))}
    </div>
);
