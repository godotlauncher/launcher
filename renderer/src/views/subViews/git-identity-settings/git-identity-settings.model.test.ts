import { describe, expect, it } from 'vitest';
import {
    createGitIdentitySettingsForm,
    gitIdentitiesEqual,
    normalizeGitIdentityForm,
    normalizeProjectGitIdentityPresetForm,
} from './git-identity-settings.model.js';

describe('Git identity settings model', () => {
    it('creates blank opt-in-off preset fields when none is stored', () => {
        expect(
            createGitIdentitySettingsForm({
                globalIdentity: { name: 'Global', email: '' },
                projectPreset: null,
            }),
        ).toEqual({
            globalIdentity: { name: 'Global', email: '' },
            projectPreset: {
                name: '',
                email: '',
                useForNewRepositories: false,
            },
        });
    });

    it('trims complete identities and rejects partial identities', () => {
        expect(
            normalizeGitIdentityForm({
                name: '  Example User ',
                email: ' user@example.com ',
            }),
        ).toEqual({ name: 'Example User', email: 'user@example.com' });
        expect(
            normalizeGitIdentityForm({ name: 'Example User', email: ' ' }),
        ).toBeNull();
    });

    it('preserves automatic use while normalizing a preset', () => {
        expect(
            normalizeProjectGitIdentityPresetForm({
                name: ' Project User ',
                email: ' project@example.com ',
                useForNewRepositories: true,
            }),
        ).toEqual({
            name: 'Project User',
            email: 'project@example.com',
            useForNewRepositories: true,
        });
    });

    it('compares identity values after trimming', () => {
        expect(
            gitIdentitiesEqual(
                { name: ' Example ', email: ' user@example.com ' },
                { name: 'Example', email: 'user@example.com' },
            ),
        ).toBe(true);
    });
});
