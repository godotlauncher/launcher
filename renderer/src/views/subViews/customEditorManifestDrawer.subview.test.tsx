import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    buildCustomEngineManifest,
    CUSTOM_ENGINE_MANIFEST_SCHEMA_URL,
    createDefaultCustomEditorManifestFormState,
    nodePlatformToManifestPlatform,
    resolveExistingDialogDefaultPath,
    validateCustomEditorManifestField,
    validateCustomEditorManifestForm,
} from './customEditorManifestDrawer/customEditorManifest.model';
import { CustomEditorManifestDrawer } from './customEditorManifestDrawer.subview';

vi.mock('react-i18next', () => {
    const dictionary: Record<string, string> = {
        'installs:customEditor.creator.title': 'Create Custom Editor Manifest',
        'installs:customEditor.creator.description':
            'Create a manifest file for a custom Godot editor and register it immediately.',
        'installs:customEditor.creator.fields.outputDirectory.label':
            'Output folder',
        'installs:customEditor.creator.fields.outputDirectory.help':
            'Folder where the manifest will be written.',
        'installs:customEditor.creator.fields.name.label': 'Display name',
        'installs:customEditor.creator.fields.name.help':
            'Name shown in Godot Launcher.',
        'installs:customEditor.creator.fields.name.placeholder':
            'Acme Godot 4.4 Custom Editor',
        'installs:customEditor.creator.fields.version.label':
            'Manifest version',
        'installs:customEditor.creator.fields.version.help':
            'Unique version identifier.',
        'installs:customEditor.creator.fields.version.placeholder':
            '4.4-custom.1',
        'installs:customEditor.creator.fields.baseVersion.label':
            'Base version',
        'installs:customEditor.creator.fields.baseVersion.help':
            'Godot compatibility version.',
        'installs:customEditor.creator.fields.baseVersion.placeholder': '4.4',
        'installs:customEditor.creator.fields.flavor.label': 'Flavor',
        'installs:customEditor.creator.fields.flavor.help':
            'Use gdscript or dotnet.',
        'installs:customEditor.creator.fields.platform.label': 'Platform',
        'installs:customEditor.creator.fields.platform.help':
            'Operating system.',
        'installs:customEditor.creator.fields.arch.label': 'Architecture',
        'installs:customEditor.creator.fields.arch.help': 'CPU architecture.',
        'installs:customEditor.creator.fields.prerelease.label': 'Prerelease',
        'installs:customEditor.creator.fields.prerelease.help':
            'Mark as prerelease.',
        'installs:customEditor.creator.fields.editorPath.label': 'Editor path',
        'installs:customEditor.creator.fields.editorPath.help':
            'Path to the editor executable.',
        'installs:customEditor.creator.fields.consolePath.label':
            'Console path',
        'installs:customEditor.creator.fields.consolePath.help':
            'Optional console executable.',
        'installs:customEditor.creator.validation.editorPath.required':
            'Add at least one editor path.',
        'installs:customEditor.creator.platforms.windows': 'Windows',
        'installs:customEditor.creator.platforms.linux': 'Linux',
        'installs:customEditor.creator.platforms.macos': 'macOS',
        'installs:customEditor.creator.architectures.universal': 'Universal',
        'installs:customEditor.creator.architectures.x64': 'x64',
        'installs:customEditor.creator.architectures.arm64': 'ARM64',
        'installs:customEditor.creator.constants.title': 'Generated values:',
        'installs:customEditor.creator.constants.description':
            'schema_version is 1 and config_version is 5.',
        'installs:customEditor.creator.actions.createAndRegister':
            'Create and register',
        'installs:customEditor.creator.actions.creating': 'Creating...',
        'common:buttons.cancel': 'Cancel',
    };

    return {
        useTranslation: (namespaces?: string[]) => ({
            t: (key: string) => {
                const dictKey = key.includes(':')
                    ? key
                    : `${Array.isArray(namespaces) ? namespaces[0] : namespaces}:${key}`;
                return dictionary[dictKey] ?? key;
            },
        }),
    };
});

describe('CustomEditorManifestDrawer', () => {
    it('renders all drawer fields, help tooltips, and footer actions', () => {
        const html = renderToStaticMarkup(
            <CustomEditorManifestDrawer
                open
                onOpenChange={vi.fn()}
                onManifestCreated={vi.fn()}
            />,
        );

        expect(html).toContain('Create Custom Editor Manifest');
        expect(html).toContain('Output folder');
        expect(html).toContain('Display name');
        expect(html).toContain('Manifest version');
        expect(html).toContain('Base version');
        expect(html).toContain('Flavor');
        expect(html).toContain('Windows');
        expect(html).toContain('Linux');
        expect(html).toContain('macOS');
        expect(html).toContain('Architecture');
        expect(html).toContain('Prerelease');
        expect(html).toContain('Editor path');
        expect(html).toContain('Console path');
        expect(html).toContain('godotlauncher-editor-manifest.json');
        expect(html).toContain(
            'https://raw.githubusercontent.com/godotlauncher/launcher/main/schemas/v1/engine-manifest.json',
        );
        expect(html).toContain('&quot;platforms&quot;: []');
        expect(html).toContain(
            'data-tip="Folder where the manifest will be written."',
        );
        expect(html).toContain('data-tip="Godot compatibility version."');
        expect(html).toContain('Create and register');
        expect(html).toContain('Cancel');
    });

    it('builds a one-platform manifest and omits empty console paths', () => {
        const manifest = buildCustomEngineManifest({
            ...createDefaultCustomEditorManifestFormState(),
            outputDirectory: '/engines/acme',
            name: 'Acme Godot',
            version: '4.4-custom.1',
            baseVersion: '4.4',
            flavor: 'gdscript',
            platforms: {
                ...createDefaultCustomEditorManifestFormState().platforms,
                linux: {
                    arch: 'x64',
                    editorPath: './Godot',
                    consolePath: '   ',
                    expanded: true,
                },
            },
        });

        expect(manifest).toEqual({
            $schema: CUSTOM_ENGINE_MANIFEST_SCHEMA_URL,
            schema_version: 1,
            version: '4.4-custom.1',
            name: 'Acme Godot',
            base_version: '4.4',
            prerelease: false,
            flavor: 'gdscript',
            config_version: 5,
            platforms: [
                {
                    platform: 'linux',
                    arch: 'x64',
                    paths: {
                        editor: './Godot',
                    },
                },
            ],
        });
    });

    it('defaults platform architectures to x64', () => {
        const state = createDefaultCustomEditorManifestFormState();

        expect(state.platforms.windows.arch).toBe('x64');
        expect(state.platforms.linux.arch).toBe('x64');
        expect(state.platforms.macos.arch).toBe('x64');
    });

    it('includes an optional console path when present', () => {
        const manifest = buildCustomEngineManifest({
            ...createDefaultCustomEditorManifestFormState(),
            outputDirectory: '/engines/acme',
            name: 'Acme Godot',
            version: '4.4-custom.1',
            baseVersion: '4.4',
            flavor: 'dotnet',
            platforms: {
                ...createDefaultCustomEditorManifestFormState().platforms,
                windows: {
                    arch: 'universal',
                    editorPath: './Godot',
                    consolePath: './Godot_console',
                    expanded: true,
                },
            },
        });

        expect(manifest.platforms[0].paths.console).toBe('./Godot_console');
    });

    it('keeps console-only platforms out of the manifest', () => {
        const manifest = buildCustomEngineManifest({
            ...createDefaultCustomEditorManifestFormState(),
            outputDirectory: '/engines/acme',
            name: 'Acme Godot',
            version: '4.4-custom.1',
            baseVersion: '4.4',
            platforms: {
                ...createDefaultCustomEditorManifestFormState().platforms,
                windows: {
                    arch: 'universal',
                    editorPath: '',
                    consolePath: './Godot_console',
                    expanded: true,
                },
            },
        });

        expect(manifest.platforms).toEqual([]);
    });

    it('validates required fields and base version format', () => {
        const emptyErrors = validateCustomEditorManifestForm(
            createDefaultCustomEditorManifestFormState(),
        );

        expect(emptyErrors.outputDirectory).toBe('required');
        expect(emptyErrors.name).toBe('required');
        expect(emptyErrors.version).toBe('required');
        expect(emptyErrors.baseVersion).toBe('required');
        expect(emptyErrors.platforms).toBe('required');

        const baseVersionErrors = validateCustomEditorManifestForm({
            ...createDefaultCustomEditorManifestFormState(),
            outputDirectory: '/engines/acme',
            name: 'Acme Godot',
            version: '4.4-custom.1',
            baseVersion: '4.4.1',
            platforms: {
                ...createDefaultCustomEditorManifestFormState().platforms,
                windows: {
                    arch: 'universal',
                    editorPath: './Godot',
                    consolePath: '',
                    expanded: true,
                },
            },
        });

        expect(baseVersionErrors.baseVersion).toBe('baseVersion');
    });

    it('validates individual fields for blur handling', () => {
        const form = {
            ...createDefaultCustomEditorManifestFormState(),
            baseVersion: '4.4.1',
            platforms: {
                ...createDefaultCustomEditorManifestFormState().platforms,
                windows: {
                    arch: 'universal',
                    editorPath: '',
                    consolePath: './Godot_console',
                    expanded: true,
                },
            },
        } satisfies ReturnType<
            typeof createDefaultCustomEditorManifestFormState
        >;

        expect(validateCustomEditorManifestField('name', form)).toBe(
            'required',
        );
        expect(validateCustomEditorManifestField('baseVersion', form)).toBe(
            'baseVersion',
        );
        expect(
            validateCustomEditorManifestField(
                'platforms.windows.editorPath',
                form,
            ),
        ).toBe('required');
    });

    it('maps node platforms to manifest platforms', () => {
        expect(nodePlatformToManifestPlatform('win32')).toBe('windows');
        expect(nodePlatformToManifestPlatform('linux')).toBe('linux');
        expect(nodePlatformToManifestPlatform('darwin')).toBe('macos');
    });

    it('uses an existing field path as the dialog default path', async () => {
        await expect(
            resolveExistingDialogDefaultPath(
                '  /engines/acme/Godot  ',
                '/engines',
                vi.fn().mockResolvedValue(true),
            ),
        ).resolves.toBe('/engines/acme/Godot');
    });

    it('falls back to the output folder when the field path is empty, missing, or invalid', async () => {
        await expect(
            resolveExistingDialogDefaultPath(
                '   ',
                '/engines',
                vi.fn().mockResolvedValue(true),
            ),
        ).resolves.toBe('/engines');

        await expect(
            resolveExistingDialogDefaultPath(
                '/missing/Godot',
                '/engines',
                vi.fn().mockResolvedValue(false),
            ),
        ).resolves.toBe('/engines');

        await expect(
            resolveExistingDialogDefaultPath(
                'relative/Godot',
                '/engines',
                vi.fn().mockRejectedValue(new Error('Path must be absolute')),
            ),
        ).resolves.toBe('/engines');
    });
});
