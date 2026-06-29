import type {
    CustomEngineManifest,
    CustomEngineManifestArch,
    CustomEngineManifestPlatformName,
} from '@shared';

export type CustomEditorManifestFormState = {
    outputDirectory: string;
    name: string;
    version: string;
    baseVersion: string;
    flavor: string;
    prerelease: boolean;
    platforms: Record<
        CustomEngineManifestPlatformName,
        CustomEditorManifestPlatformFormState
    >;
};

export type CustomEditorManifestPlatformFormState = {
    arch: CustomEngineManifestArch;
    editorPath: string;
    consolePath: string;
    expanded: boolean;
};

export type CustomEditorManifestField = keyof CustomEditorManifestFormState;
export type CustomEditorManifestValidationErrors = Partial<
    Record<string, string>
>;

export type IncludedCustomEditorManifestPlatform =
    CustomEditorManifestPlatformFormState & {
        platform: CustomEngineManifestPlatformName;
    };

const requiredFields: CustomEditorManifestField[] = [
    'outputDirectory',
    'name',
    'version',
    'baseVersion',
    'flavor',
];

export const validationMessageFieldOrder: string[] = [
    ...requiredFields,
    'platforms',
];

const baseVersionPattern = /^\d+\.\d+$/;
export const CUSTOM_ENGINE_MANIFEST_SCHEMA_URL =
    'https://raw.githubusercontent.com/godotlauncher/launcher/main/schemas/v1/engine-manifest.json';
export const manifestPlatformNames: CustomEngineManifestPlatformName[] = [
    'windows',
    'linux',
    'macos',
];

export function createDefaultCustomEditorManifestFormState(): CustomEditorManifestFormState {
    return {
        outputDirectory: '',
        name: '',
        version: '',
        baseVersion: '',
        flavor: 'gdscript',
        prerelease: false,
        platforms: createDefaultPlatformFormState(),
    };
}

export function createDefaultPlatformFormState(): Record<
    CustomEngineManifestPlatformName,
    CustomEditorManifestPlatformFormState
> {
    return {
        windows: {
            arch: 'x64',
            editorPath: '',
            consolePath: '',
            expanded: true,
        },
        linux: {
            arch: 'x64',
            editorPath: '',
            consolePath: '',
            expanded: false,
        },
        macos: {
            arch: 'x64',
            editorPath: '',
            consolePath: '',
            expanded: false,
        },
    };
}

export function nodePlatformToManifestPlatform(
    platform: string,
): CustomEngineManifestPlatformName {
    switch (platform) {
        case 'darwin':
            return 'macos';
        case 'linux':
            return 'linux';
        default:
            return 'windows';
    }
}

export function validateCustomEditorManifestForm(
    form: CustomEditorManifestFormState,
): CustomEditorManifestValidationErrors {
    const errors: CustomEditorManifestValidationErrors = {};

    requiredFields.forEach((field) => {
        if (String(form[field]).trim().length === 0) {
            errors[field] = 'required';
        }
    });

    if (
        form.baseVersion.trim().length > 0 &&
        !baseVersionPattern.test(form.baseVersion.trim())
    ) {
        errors.baseVersion = 'baseVersion';
    }

    if (getIncludedPlatforms(form).length === 0) {
        errors.platforms = 'required';
    }

    return errors;
}

export function validateCustomEditorManifestField(
    field: string,
    form: CustomEditorManifestFormState,
): string | undefined {
    if (requiredFields.includes(field as CustomEditorManifestField)) {
        const value = form[field as CustomEditorManifestField];
        if (String(value).trim().length === 0) {
            return 'required';
        }
    }

    if (
        field === 'baseVersion' &&
        form.baseVersion.trim().length > 0 &&
        !baseVersionPattern.test(form.baseVersion.trim())
    ) {
        return 'baseVersion';
    }

    if (field === 'platforms' && getIncludedPlatforms(form).length === 0) {
        return 'required';
    }

    const platformPathMatch = field.match(
        /^platforms\.(windows|linux|macos)\.(editorPath|consolePath)$/,
    );
    if (platformPathMatch) {
        const platform =
            platformPathMatch[1] as CustomEngineManifestPlatformName;
        const platformForm = form.platforms[platform];

        if (
            platformForm.consolePath.trim().length > 0 &&
            platformForm.editorPath.trim().length === 0
        ) {
            return 'required';
        }
    }

    return undefined;
}

export function getIncludedPlatforms(
    form: CustomEditorManifestFormState,
): IncludedCustomEditorManifestPlatform[] {
    return manifestPlatformNames
        .map((platform) => ({
            platform,
            ...form.platforms[platform],
        }))
        .filter((platformForm) => platformForm.editorPath.trim().length > 0);
}

export function buildCustomEngineManifest(
    form: CustomEditorManifestFormState,
): CustomEngineManifest {
    return {
        $schema: CUSTOM_ENGINE_MANIFEST_SCHEMA_URL,
        schema_version: 1,
        version: form.version.trim(),
        name: form.name.trim(),
        base_version: form.baseVersion.trim(),
        prerelease: form.prerelease,
        flavor: form.flavor.trim(),
        config_version: 5,
        platforms: getIncludedPlatforms(form).map((platformForm) => {
            const consolePath = platformForm.consolePath.trim();

            return {
                platform: platformForm.platform,
                arch: platformForm.arch,
                paths: {
                    editor: platformForm.editorPath.trim(),
                    ...(consolePath.length > 0 ? { console: consolePath } : {}),
                },
            };
        }),
    };
}

export async function resolveExistingDialogDefaultPath(
    candidatePath: string,
    fallbackPath: string,
    pathExists: (pathToCheck: string) => Promise<boolean>,
): Promise<string> {
    const trimmedCandidatePath = candidatePath.trim();
    if (trimmedCandidatePath.length === 0) {
        return fallbackPath;
    }

    try {
        return (await pathExists(trimmedCandidatePath))
            ? trimmedCandidatePath
            : fallbackPath;
    } catch {
        return fallbackPath;
    }
}
