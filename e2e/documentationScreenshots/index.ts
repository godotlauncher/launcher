import { HELP_SCREENSHOTS } from './screenshots.help';
import { INSTALLS_SCREENSHOTS } from './screenshots.installs';
import { PROJECT_SCREENSHOTS } from './screenshots.projects';
import { SETTINGS_SCREENSHOTS } from './screenshots.settings';
import type { ScreenshotConfig } from './types';

export const SCREENSHOT_GROUPS = [
    {
        name: 'projects',
        timeout: 180000,
        screenshots: PROJECT_SCREENSHOTS,
    },
    {
        name: 'installs',
        timeout: 150000,
        screenshots: INSTALLS_SCREENSHOTS,
    },
    {
        name: 'settings',
        timeout: 150000,
        screenshots: SETTINGS_SCREENSHOTS,
    },
    {
        name: 'help',
        timeout: 60000,
        screenshots: HELP_SCREENSHOTS,
    },
] satisfies {
    name: string;
    timeout: number;
    screenshots: ScreenshotConfig[];
}[];

export const SCREENSHOTS: ScreenshotConfig[] = [
    ...PROJECT_SCREENSHOTS,
    ...INSTALLS_SCREENSHOTS,
    ...SETTINGS_SCREENSHOTS,
    ...HELP_SCREENSHOTS,
];
