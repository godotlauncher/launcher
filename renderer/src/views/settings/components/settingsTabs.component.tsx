import clsx from 'clsx';
import type React from 'react';
import { type SettingsTab, settingsTabs } from '../../../routes';

type Translate = (key: string) => string;

const settingsTabTestIds: Record<SettingsTab, string> = {
    projects: 'tabProjects',
    installs: 'tabInstalls',
    appearance: 'tabAppearance',
    behavior: 'tabBehavior',
    codeEditors: 'tabCodeEditors',
    tools: 'tabTools',
    connections: 'tabConnections',
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
    <div
        role="tablist"
        className="flex w-full flex-nowrap tabs tabs-lift overflow-x-auto"
    >
        {settingsTabs.map((tab) => (
            <button
                key={tab}
                type="button"
                data-testid={settingsTabTestIds[tab]}
                onClick={() => onActiveTabChange(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={clsx('tab shrink-0', {
                    'tab-active': activeTab === tab,
                })}
            >
                {t(`tabs.${tab}`)}
            </button>
        ))}
        <span
            className="tab min-w-4 flex-1 pointer-events-none"
            data-testid="settingsTabRailEnd"
            aria-hidden="true"
        />
    </div>
);
