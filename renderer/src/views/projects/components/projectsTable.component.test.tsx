import type { ProjectDetails } from '@shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsTable } from './projectsTable.component';

const baseProject: ProjectDetails = {
    name: 'Sample Project',
    version: '4.3-stable',
    version_number: 4.3,
    renderer: 'FORWARD_PLUS',
    path: '/projects/sample',
    editor_settings_path: '',
    editor_settings_file: '',
    last_opened: null,
    release: {
        version: '4.3-stable',
        version_number: 4.3,
        install_path: '/install/4.3',
        editor_path: '/install/4.3/Godot',
        platform: 'darwin',
        arch: 'arm64',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: null,
        valid: true,
    },
    launch_path: '/install/4.3/Godot',
    config_version: 5,
    withVSCode: false,
    withGit: false,
    valid: true,
};

function renderProjectsTable(rows: ProjectDetails[]): string {
    return renderToStaticMarkup(
        <ProjectsTable
            rows={rows}
            loading={false}
            busyProjects={[]}
            sortData={{ field: 'name', order: 'asc' }}
            onSortChange={vi.fn()}
            isInstalledRelease={vi.fn(() => true)}
            isProjectEditorDownloading={vi.fn(() => false)}
            onLaunchProject={vi.fn()}
            onChangeEditor={vi.fn()}
            onProjectMoreOptions={vi.fn()}
            t={(key) => key}
        />,
    );
}

describe('ProjectsTable', () => {
    it('renders a project icon when icon_path is present', () => {
        const html = renderProjectsTable([
            {
                ...baseProject,
                icon_path: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
            },
        ]);

        expect(html).toContain(
            'src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="',
        );
        expect(html).toContain('aria-label="Launch Sample Project"');
        expect(html).toContain('w-full h-full object-contain');
        expect(html).toContain('Sample Project');
    });

    it('renders a centered image-off icon when icon_path is absent', () => {
        const html = renderProjectsTable([baseProject]);

        expect(html).not.toContain('<img src="data:image');
        expect(html).toContain('lucide-image-off');
        expect(html).toContain('aria-label="Launch Sample Project"');
    });
});
