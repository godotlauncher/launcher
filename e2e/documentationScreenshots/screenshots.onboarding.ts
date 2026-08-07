import type { ElectronApplication } from '@playwright/test';
import { prepareOnboardingScreenshot } from './runtime';
import type {
    ElectronPage,
    OnboardingScreenshotPlatform,
    OnboardingScreenshotStep,
    ScreenshotConfig,
} from './types';

function onboardingScreenshot(
    fileBase: string,
    description: string,
    platform: OnboardingScreenshotPlatform,
    step: OnboardingScreenshotStep,
    viewportHeight = 600,
    trayAvailable = true,
): ScreenshotConfig {
    return {
        fileBase,
        description,
        viewportHeight,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await prepareOnboardingScreenshot(
                page,
                electronApp,
                platform,
                step,
                trayAvailable,
            );
        },
    };
}

export const ONBOARDING_SCREENSHOTS: ScreenshotConfig[] = [
    onboardingScreenshot(
        'screen_onboarding_welcome',
        'Onboarding (Welcome step)',
        'darwin',
        'welcome',
    ),
    onboardingScreenshot(
        'screen_onboarding_appearance',
        'Onboarding (Appearance step)',
        'darwin',
        'appearance',
    ),
    onboardingScreenshot(
        'screen_onboarding_setup_windows',
        'Onboarding (Setup step on Windows)',
        'win32',
        'setup',
        760,
    ),
    onboardingScreenshot(
        'screen_onboarding_setup_macos',
        'Onboarding (Setup step on macOS)',
        'darwin',
        'setup',
        700,
    ),
    onboardingScreenshot(
        'screen_onboarding_setup_linux',
        'Onboarding (Setup step on Linux)',
        'linux',
        'setup',
        700,
    ),
    onboardingScreenshot(
        'screen_onboarding_preferences',
        'Onboarding (Preferences step)',
        'win32',
        'preferences',
        720,
    ),
    onboardingScreenshot(
        'screen_onboarding_preferences_linux',
        'Onboarding (Preferences step on Linux)',
        'linux',
        'preferences',
        680,
    ),
    onboardingScreenshot(
        'screen_onboarding_preferences_linux_tray_unavailable',
        'Onboarding (Preferences step when the Linux tray is unavailable)',
        'linux',
        'preferences',
        760,
        false,
    ),
];
