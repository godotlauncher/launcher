import type { ProjectDetails } from '@shared/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectFoldersMenu } from './project-folders-menu.component';

vi.mock('../../../components/ui/action-menu.component', () => ({
    ActionMenu: ({
        open,
        items,
    }: {
        open: boolean;
        items: Array<{
            key: string;
            label?: ReactNode;
            disabled?: boolean;
        }>;
    }) =>
        open ? (
            <div>
                {items.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        disabled={item.disabled}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        ) : null,
}));

const project: ProjectDetails = {
    name: 'Demo',
    path: '/projects/demo',
    version: '4.2',
    version_number: 4.2,
    renderer: 'FORWARD_PLUS',
    editor_settings_path: '/editors/Demo/editor_data',
    editor_settings_file: '/editors/Demo/editor_data/editor_settings-4.2.tres',
    last_opened: null,
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
    valid: true,
};

describe('ProjectFoldersMenu', () => {
    it('renders both project folder destinations', () => {
        const html = renderToStaticMarkup(
            <ProjectFoldersMenu
                project={project}
                anchorRect={{
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    width: 0,
                    height: 0,
                }}
                t={(key) => key}
                githubUrl={null}
                onClose={vi.fn()}
                onOpenProjectFolder={vi.fn()}
                onOpenEditorSettingsFolder={vi.fn()}
                onOpenGitHub={vi.fn()}
            />,
        );

        expect(html).toContain('project.openProjectFolder');
        expect(html).toContain('project.openEditorSettingsFolder');
        expect(html).not.toContain('project.openTerminal');
        expect(html).not.toContain('project.openInGitHub');
    });

    it('disables destinations with missing paths', () => {
        const html = renderToStaticMarkup(
            <ProjectFoldersMenu
                project={{
                    ...project,
                    path: '',
                    editor_settings_path: '',
                }}
                anchorRect={{
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    width: 0,
                    height: 0,
                }}
                t={(key) => key}
                githubUrl={null}
                onClose={vi.fn()}
                onOpenProjectFolder={vi.fn()}
                onOpenEditorSettingsFolder={vi.fn()}
                onOpenGitHub={vi.fn()}
            />,
        );

        expect(html.match(/disabled=""/g)).toHaveLength(2);
    });

    it('renders the GitHub destination when one is cached', () => {
        const html = renderToStaticMarkup(
            <ProjectFoldersMenu
                project={project}
                anchorRect={{
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    width: 0,
                    height: 0,
                }}
                t={(key) => key}
                githubUrl="https://github.com/example/demo"
                onClose={vi.fn()}
                onOpenProjectFolder={vi.fn()}
                onOpenEditorSettingsFolder={vi.fn()}
                onOpenGitHub={vi.fn()}
            />,
        );

        expect(html).toContain('project.openInGitHub');
    });
});
