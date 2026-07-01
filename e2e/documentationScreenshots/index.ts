import type { ScreenshotConfig } from './types';
import { HELP_SCREENSHOTS } from './screenshots.help';
import { INSTALLS_SCREENSHOTS } from './screenshots.installs';
import { PROJECT_SCREENSHOTS } from './screenshots.projects';
import { SETTINGS_SCREENSHOTS } from './screenshots.settings';

export const SCREENSHOTS: ScreenshotConfig[] = [
    ...PROJECT_SCREENSHOTS,
    ...INSTALLS_SCREENSHOTS,
    ...SETTINGS_SCREENSHOTS,
    ...HELP_SCREENSHOTS,
];
