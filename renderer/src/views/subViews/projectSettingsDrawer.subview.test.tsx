import type { ProjectDetails } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    canRenameGodotProject,
    hasProjectCodeEditorChanges,
    hasProjectRenameChanges,
    validateProjectRenameName,
} from './projectSettingsDrawer/projectSettings.model';
import { ProjectSettingsDrawer } from './projectSettingsDrawer.subview';

vi.mock('react-i18next', () => {
    const dictionary: Record<string, string> = {
        'projects:editProject.title': 'Project Settings',
        'projects:editProject.drawerTitle': 'Settings for {{project}}',
        'projects:editProject.fields.name.label': 'Project name',
        'projects:editProject.fields.name.help':
            'Name shown in Godot Launcher.',
        'projects:editProject.fields.name.placeholder': 'My Project',
        'projects:editProject.fields.path.label': 'Project folder',
        'projects:editProject.pinned.label': 'Pinned',
        'projects:editProject.tabs.project': 'Project',
        'projects:editProject.tabs.sourceControl': 'Source Control',
        'projects:editProject.tabs.codeEditor': 'Code Editor',
        'projects:editProject.tabs.launch': 'Launch',
        'projects:editProject.godotEditor.title': 'Godot Editor',
        'projects:editProject.godotEditor.help':
            'Choose the Godot version used to edit this project.',
        'projects:editProject.godot.renameLabel': 'Also rename Godot project',
        'projects:editProject.godot.loading': 'Checking Godot project...',
        'projects:editProject.godot.unavailable':
            'project.godot is unavailable.',
        'projects:editProject.codeEditor.title': 'Code Editor',
        'projects:editProject.codeEditor.help':
            'Choose the code editor used for this project.',
        'projects:editProject.codeEditor.none': 'None',
        'projects:editProject.codeEditor.loading': 'Loading code editors...',
        'projects:editProject.codeEditor.loadFailed':
            'Could not load code editors.',
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
    codeEditorId: null,
    withGit: false,
    pinned: true,
    valid: true,
};

describe('ProjectSettingsDrawer', () => {
    it('renders the rename form fields and actions', () => {
        const html = renderToStaticMarkup(
            <ProjectSettingsDrawer
                project={project}
                open
                installedReleases={[project.release]}
                onOpenChange={vi.fn()}
                onRenameProject={vi.fn()}
                onSetProjectEditor={vi.fn()}
                onSetProjectCodeEditor={vi.fn()}
                onSetProjectWindowed={vi.fn()}
                onInitializeProjectGit={vi.fn()}
                getProjectGitIdentity={vi.fn()}
                onSetProjectGitIdentity={vi.fn()}
                onResetProjectCodeEditorConfig={vi.fn()}
                getProjectGodotName={vi.fn()}
            />,
        );

        expect(html).toContain('Settings for Demo');
        expect(html).not.toContain('Update project naming settings.');
        expect(html).toContain('Project name');
        expect(html).toContain('Godot Editor');
        expect(html).toContain('4.2');
        expect(html).toContain('/projects/demo');
        expect(html).not.toContain('Project folder');
        expect(html).toContain('Also rename Godot project');
        expect(html).toContain('Code Editor');
        expect(html).toContain('Source Control');
        expect(html).toContain('Launch');
        expect(html).toContain('Pinned');
        expect(html).not.toContain('Keep this project in the Pinned section.');
        expect(html).toContain('Update');
        expect(html).toContain('Cancel');

        expect(html.indexOf('Also rename Godot project')).toBeGreaterThan(
            html.indexOf('Project name'),
        );
    });

    it('orders Godot editor options with the highest version first', () => {
        const unavailableProject = {
            ...project,
            release: { ...project.release, valid: false },
        };
        const html = renderToStaticMarkup(
            <ProjectSettingsDrawer
                project={unavailableProject}
                open
                installedReleases={[
                    {
                        ...project.release,
                        version: '4.3-stable',
                        version_number: 4.3,
                    },
                    {
                        ...project.release,
                        version: '4.10-stable',
                        version_number: 4.1,
                    },
                ]}
                onOpenChange={vi.fn()}
                onRenameProject={vi.fn()}
                onSetProjectEditor={vi.fn()}
                onSetProjectCodeEditor={vi.fn()}
                onSetProjectWindowed={vi.fn()}
                onInitializeProjectGit={vi.fn()}
                getProjectGitIdentity={vi.fn()}
                onSetProjectGitIdentity={vi.fn()}
                onResetProjectCodeEditorConfig={vi.fn()}
                getProjectGodotName={vi.fn()}
            />,
        );

        const optionsHtml = html.slice(html.indexOf('role="listbox"'));
        expect(optionsHtml.indexOf('4.10-stable')).toBeLessThan(
            optionsHtml.indexOf('4.3-stable'),
        );
        expect(optionsHtml.indexOf('4.3-stable')).toBeLessThan(
            optionsHtml.indexOf('4.2'),
        );
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

    it('treats an explicit None selection as a change when IDs are both null', () => {
        expect(hasProjectCodeEditorChanges(null, null, true)).toBe(true);
        expect(hasProjectCodeEditorChanges(null, null, false)).toBe(false);
        expect(hasProjectCodeEditorChanges('vscode', null, false)).toBe(true);
    });
});
