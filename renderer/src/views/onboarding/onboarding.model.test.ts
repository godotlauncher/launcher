import type { UserPreferences } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    applyOnboardingRecommendedLocations,
    getNextOnboardingStep,
    getOnboardingDestinationPath,
    getPreviousOnboardingStep,
    isAbsoluteOnboardingPath,
    parseOnboardingStepId,
} from './onboarding.model';

const preferences = {
    prefs_version: 4,
    install_location: '',
    config_location: '',
    projects_location: '',
    post_launch_action: 'close_to_tray',
    auto_check_updates: true,
    receive_beta_updates: false,
    auto_start: true,
    start_in_tray: true,
    confirm_project_remove: true,
    first_run: true,
    windows_enable_symlinks: false,
} satisfies UserPreferences;

describe('onboarding model', () => {
    it('parses stable step identifiers and falls back to welcome', () => {
        expect(parseOnboardingStepId('setup')).toBe('setup');
        expect(parseOnboardingStepId('unknown')).toBe('welcome');
        expect(parseOnboardingStepId(null)).toBe('welcome');
    });

    it('moves within the four onboarding steps without overflowing', () => {
        expect(getNextOnboardingStep('welcome')).toBe('appearance');
        expect(getNextOnboardingStep('appearance')).toBe('setup');
        expect(getNextOnboardingStep('preferences')).toBe('preferences');
        expect(getPreviousOnboardingStep('preferences')).toBe('setup');
        expect(getPreviousOnboardingStep('setup')).toBe('appearance');
        expect(getPreviousOnboardingStep('welcome')).toBe('welcome');
    });

    it('routes new users into the install drawer and existing users to projects', () => {
        expect(getOnboardingDestinationPath([])).toBe('/installs/install');
        expect(getOnboardingDestinationPath([{} as never])).toBe('/projects');
    });

    it('validates absolute paths for Windows and Unix platforms', () => {
        expect(isAbsoluteOnboardingPath('C:\\Godot\\Editors', 'win32')).toBe(
            true,
        );
        expect(isAbsoluteOnboardingPath('\\\\server\\share', 'win32')).toBe(
            true,
        );
        expect(isAbsoluteOnboardingPath('/Users/me/Godot', 'darwin')).toBe(
            true,
        );
        expect(isAbsoluteOnboardingPath('Godot/Editors', 'linux')).toBe(false);
    });

    it.each([
        {
            platform: 'darwin',
            storedProjects: 'C:\\Godot\\Projects',
            storedEditors: 'C:\\Godot\\Editors',
            projectsLocation: '/Users/mario/Godot/Projects',
            editorLocation: '/Users/mario/Godot/Editors',
        },
        {
            platform: 'linux',
            storedProjects: 'C:\\Godot\\Projects',
            storedEditors: '',
            projectsLocation: '/home/mario/Godot/Projects',
            editorLocation: '/home/mario/Godot/Editors',
        },
        {
            platform: 'win32',
            storedProjects: '/Users/mario/Godot/Projects',
            storedEditors: '/Users/mario/Godot/Editors',
            projectsLocation: 'C:\\Users\\Mario\\Godot\\Projects',
            editorLocation: 'C:\\Users\\Mario\\Godot\\Editors',
        },
    ])(
        'uses $platform recommendations for foreign or empty paths',
        ({
            platform,
            storedProjects,
            storedEditors,
            projectsLocation,
            editorLocation,
        }) => {
            const result = applyOnboardingRecommendedLocations(
                {
                    ...preferences,
                    projects_location: storedProjects,
                    install_location: storedEditors,
                },
                platform,
                { projectsLocation, editorLocation },
            );

            expect(result.projects_location).toBe(projectsLocation);
            expect(result.install_location).toBe(editorLocation);
        },
    );

    it('preserves valid custom folders for the current OS', () => {
        const result = applyOnboardingRecommendedLocations(
            {
                ...preferences,
                projects_location: '/Volumes/Work/Godot Projects',
                install_location: '/Volumes/Work/Godot Editors',
            },
            'darwin',
            {
                projectsLocation: '/Users/mario/Godot/Projects',
                editorLocation: '/Users/mario/Godot/Editors',
            },
        );

        expect(result.projects_location).toBe('/Volumes/Work/Godot Projects');
        expect(result.install_location).toBe('/Volumes/Work/Godot Editors');
    });
});
