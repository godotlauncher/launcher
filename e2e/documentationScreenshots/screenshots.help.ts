import type { ElectronPage, ScreenshotConfig } from './types';

export const HELP_SCREENSHOTS: ScreenshotConfig[] = [
{
        fileBase: 'screen_help_view',
        description: 'Help view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnHelp').click();
            await page.waitForTimeout(600);
        },
    }
];
