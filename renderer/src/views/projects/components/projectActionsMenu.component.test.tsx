import type { ProjectDetails } from '@shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectActionsMenu } from './projectActionsMenu.component';

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

describe('ProjectActionsMenu', () => {
    it('renders launch editor and project settings actions', () => {
        const html = renderToStaticMarkup(
            <ProjectActionsMenu
                project={project}
                anchorRect={{
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    width: 0,
                    height: 0,
                }}
                hasVSCode={false}
                hasGit={false}
                t={(key) =>
                    key === 'project.launchEditor'
                        ? 'Edit in Godot'
                        : key === 'project.projectSettings'
                          ? 'Project Settings'
                          : key
                }
                onClose={vi.fn()}
                onLaunchProject={vi.fn()}
                onProjectSettings={vi.fn()}
                onOpenProjectFolder={vi.fn()}
                onOpenEditorSettingsFolder={vi.fn()}
                onToggleWindowed={vi.fn()}
                onToggleVSCode={vi.fn()}
                onInitializeGit={vi.fn()}
                onExportEditorSettings={vi.fn()}
                onImportEditorSettings={vi.fn()}
                onRemoveProject={vi.fn()}
            />,
        );

        expect(html).toContain('Edit in Godot');
        expect(html).toContain('Project Settings');
        expect(html).toContain('lucide-pencil');
        expect(html).toContain('stroke-info');
        expect(html).toContain('lucide-square-pen');
    });
});
