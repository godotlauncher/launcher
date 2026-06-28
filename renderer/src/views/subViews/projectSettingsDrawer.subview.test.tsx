import type { ProjectDetails } from '@shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    canRenameGodotProject,
    hasProjectRenameChanges,
    validateProjectRenameName,
} from './projectSettingsDrawer/projectSettings.model';
import { ProjectSettingsDrawer } from './projectSettingsDrawer.subview';

vi.mock('react-i18next', () => {
    const dictionary: Record<string, string> = {
        'projects:editProject.title': 'Project Settings',
        'projects:editProject.fields.name.label': 'Project name',
        'projects:editProject.fields.name.help':
            'Name shown in Godot Launcher.',
        'projects:editProject.fields.name.placeholder': 'My Project',
        'projects:editProject.fields.path.label': 'Project folder',
        'projects:editProject.godot.renameLabel': 'Also rename Godot project',
        'projects:editProject.godot.loading': 'Checking Godot project...',
        'projects:editProject.godot.unavailable':
            'project.godot is unavailable.',
        'projects:editProject.actions.update': 'Update',
        'projects:editProject.actions.updating': 'Updating...',
        'common:buttons.cancel': 'Cancel',
        'common:buttons.copyPath': 'Copy path',
        'common:success': 'Copied',
    };

    return {
        useTranslation: (namespaces?: string[]) => ({
            t: (key: string, options?: Record<string, unknown>) => {
                const namespace = Array.isArray(namespaces)
                    ? namespaces[0]
                    : namespaces;
                const dictKey = key.includes(':') ? key : `${namespace}:${key}`;
                const value = dictionary[dictKey] ?? key;
                return options
                    ? value.replace(/\{\{(\w+)\}\}/g, (_, token) =>
                          String(options[token] ?? ''),
                      )
                    : value;
            },
        }),
    };
});

const project: ProjectDetails = {
    name: 'Demo',
    path: '/projects/demo',
    version: '4.2',
    version_number: 4.2,
    renderer: 'FORWARD_PLUS',
    editor_settings_path: '/editors/Demo/editor_data',
    editor_settings_file: '/editors/Demo/editor_data/editor_settings-4.2.tres',
    last_opened: null,
    open_windowed: false,
    release: {
        version: '4.2',
        version_number: 4.2,
        install_path: '/godot',
        editor_path: '/godot/godot.exe',
        platform: 'win32',
        arch: 'x86_64',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: null,
        valid: true,
    },
    launch_path: '/editors/Demo/godot.exe',
    config_version: 5,
    withVSCode: false,
    withGit: false,
    valid: true,
};

describe('ProjectSettingsDrawer', () => {
    it('renders the rename form fields and actions', () => {
        const html = renderToStaticMarkup(
            <ProjectSettingsDrawer
                project={project}
                open
                onOpenChange={vi.fn()}
                onRenameProject={vi.fn()}
                getProjectGodotName={vi.fn()}
            />,
        );

        expect(html).toContain('Demo Settings');
        expect(html).not.toContain('Update project naming settings.');
        expect(html).toContain('Project name');
        expect(html).toContain('/projects/demo');
        expect(html).not.toContain('Project folder');
        expect(html).toContain('Also rename Godot project');
        expect(html).toContain('Update');
        expect(html).toContain('Cancel');
    });

    it('validates rename names', () => {
        expect(validateProjectRenameName('')).toBe('required');
        expect(validateProjectRenameName('   ')).toBe('required');
        expect(validateProjectRenameName('Bad\nName')).toBe('invalidName');
        expect(validateProjectRenameName('Good Name')).toBeNull();
    });

    it('enables Godot rename only when the new name differs from Godot', () => {
        expect(canRenameGodotProject('Renamed', 'Demo')).toBe(true);
        expect(canRenameGodotProject('Demo', 'Demo')).toBe(false);
        expect(canRenameGodotProject('Renamed', null)).toBe(false);
        expect(canRenameGodotProject('   ', 'Demo')).toBe(false);
    });

    it('detects launcher and Godot rename changes', () => {
        expect(hasProjectRenameChanges('Demo', 'Demo', 'Renamed', false)).toBe(
            true,
        );
        expect(hasProjectRenameChanges('Demo', 'Godot', 'Demo', true)).toBe(
            true,
        );
        expect(hasProjectRenameChanges('Demo', 'Demo', 'Demo', true)).toBe(
            false,
        );
    });
});
