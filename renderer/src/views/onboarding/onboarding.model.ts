import type {
    InstalledRelease,
    OnboardingRecommendedLocations,
    UserPreferences,
} from '@shared/contracts';

export const onboardingStepIds = [
    'welcome',
    'appearance',
    'setup',
    'preferences',
] as const;

export type OnboardingStepId = (typeof onboardingStepIds)[number];

export const ONBOARDING_STEP_STORAGE_KEY = 'godot-launcher.onboarding.step';

export function parseOnboardingStepId(
    value: string | null | undefined,
): OnboardingStepId {
    return onboardingStepIds.includes(value as OnboardingStepId)
        ? (value as OnboardingStepId)
        : 'welcome';
}

export function getNextOnboardingStep(
    step: OnboardingStepId,
): OnboardingStepId {
    const index = onboardingStepIds.indexOf(step);
    return onboardingStepIds[Math.min(index + 1, onboardingStepIds.length - 1)];
}

export function getPreviousOnboardingStep(
    step: OnboardingStepId,
): OnboardingStepId {
    const index = onboardingStepIds.indexOf(step);
    return onboardingStepIds[Math.max(index - 1, 0)];
}

export function getOnboardingDestination(
    installedReleases: InstalledRelease[],
): 'installs' | 'projects' {
    return installedReleases.length === 0 ? 'installs' : 'projects';
}

export function isAbsoluteOnboardingPath(
    value: string,
    platform: string,
): boolean {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
        return false;
    }

    if (platform === 'win32') {
        return (
            /^[a-zA-Z]:[\\/]/.test(trimmedValue) ||
            /^\\\\[^\\]+\\[^\\]+/.test(trimmedValue)
        );
    }

    return trimmedValue.startsWith('/');
}

export function applyOnboardingRecommendedLocations(
    preferences: UserPreferences,
    platform: string,
    recommended: OnboardingRecommendedLocations,
): UserPreferences {
    return {
        ...preferences,
        projects_location: isAbsoluteOnboardingPath(
            preferences.projects_location,
            platform,
        )
            ? preferences.projects_location
            : recommended.projectsLocation,
        install_location: isAbsoluteOnboardingPath(
            preferences.install_location,
            platform,
        )
            ? preferences.install_location
            : recommended.editorLocation,
    };
}
