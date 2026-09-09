import type {
    GitIdentity,
    GitIdentitySettings,
    ProjectGitIdentityPreset,
} from '@shared/contracts';

export type GitIdentityForm = GitIdentity;

export type ProjectGitIdentityPresetForm = GitIdentity & {
    useForNewRepositories: boolean;
};

export type GitIdentitySettingsForm = {
    globalIdentity: GitIdentityForm;
    projectPreset: ProjectGitIdentityPresetForm;
};

/**
 * Creates editable identity forms from the persisted settings response.
 *
 * @param settings - Current global identity and optional project preset.
 * @returns Editable global and preset fields.
 */
export function createGitIdentitySettingsForm(
    settings: GitIdentitySettings,
): GitIdentitySettingsForm {
    return {
        globalIdentity: { ...settings.globalIdentity },
        projectPreset: settings.projectPreset
            ? { ...settings.projectPreset }
            : { name: '', email: '', useForNewRepositories: false },
    };
}

/**
 * Normalizes a complete global identity form.
 *
 * @param form - Editable identity values.
 * @returns Trimmed identity, or null when either value is empty.
 */
export function normalizeGitIdentityForm(
    form: GitIdentityForm,
): GitIdentity | null {
    const name = form.name.trim();
    const email = form.email.trim();
    return name && email ? { name, email } : null;
}

/**
 * Normalizes a complete project preset form.
 *
 * @param form - Editable preset values and automatic-use choice.
 * @returns Trimmed preset, or null when either identity value is empty.
 */
export function normalizeProjectGitIdentityPresetForm(
    form: ProjectGitIdentityPresetForm,
): ProjectGitIdentityPreset | null {
    const identity = normalizeGitIdentityForm(form);
    return identity
        ? { ...identity, useForNewRepositories: form.useForNewRepositories }
        : null;
}

/**
 * Checks whether two identity values are equal after trimming.
 *
 * @param left - First identity value.
 * @param right - Second identity value.
 * @returns Whether both normalized values match.
 */
export function gitIdentitiesEqual(
    left: GitIdentity,
    right: GitIdentity,
): boolean {
    return (
        left.name.trim() === right.name.trim() &&
        left.email.trim() === right.email.trim()
    );
}
