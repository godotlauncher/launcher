import type {
    CodeEditorIntegrationSettings,
    ProjectDetails,
} from '@shared/contracts';
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
    codeEditorId: null,
    withGit: false,
    valid: true,
};

const availableVSCodeSettings: CodeEditorIntegrationSettings = {
    integration: {
        id: 'vscode',
        displayName: 'Visual Studio Code',
        capabilities: { dotnet: true },
    },
    isDefault: true,
    enabled: true,
    customPath: null,
    defaultExecFlags: '{project}',
    execFlagsOverride: null,
    resolvedExecFlags: '{project}',
    installation: {
        integrationId: 'vscode',
        path: '/applications/code',
        version: null,
    },
    resolvedGodotExecPath: '/applications/code',
};

function renderProjectsTable(
    rows: ProjectDetails[],
    codeEditorSettings: CodeEditorIntegrationSettings[] = [
        availableVSCodeSettings,
    ],
    locale = 'en',
): string {
    return renderToStaticMarkup(
        <ProjectsTable
            rows={rows}
            loading={false}
            locale={locale}
            busyProjects={[]}
            codeEditorSettings={codeEditorSettings}
            sortData={{ field: 'name', order: 'asc' }}
            onSortChange={vi.fn()}
            isInstalledRelease={vi.fn(() => true)}
            isProjectEditorDownloading={vi.fn(() => false)}
            onLaunchProject={vi.fn()}
            onChangeEditor={vi.fn()}
            onProjectMoreOptions={vi.fn()}
            t={(key, options) =>
                options?.editor ? `${key}: ${options.editor}` : key
            }
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

    it('renders a neutral marker for any selected code editor', () => {
        const html = renderProjectsTable([
            { ...baseProject, codeEditorId: 'vscode' },
        ]);

        expect(html).toContain('vscode.svg');
        expect(html).toContain('table.codeEditorProject: Visual Studio Code');
        expect(html).toContain('role="img"');
        expect(html).toContain('alt=""');
    });

    it('renders a warning marker when the selected code editor is unavailable', () => {
        const html = renderProjectsTable(
            [{ ...baseProject, codeEditorId: 'vscode' }],
            [{ ...availableVSCodeSettings, installation: null }],
        );

        expect(html).toContain(
            'table.codeEditorUnavailable: Visual Studio Code',
        );
        expect(html).toContain('data-tooltip-trigger=""');
        expect(html).toContain('lucide-triangle-alert');
        expect(html).toContain('stroke-warning');
        expect(html).not.toContain('vscode.svg');
        expect(html).not.toContain('table.codeEditorProject');
    });

    it('renders a localized relative modified time', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));

        try {
            const project = {
                ...baseProject,
                last_opened: new Date('2026-08-02T10:00:00Z'),
            };

            const englishHtml = renderProjectsTable(
                [project],
                [availableVSCodeSettings],
                'en',
            );
            const germanHtml = renderProjectsTable(
                [project],
                [availableVSCodeSettings],
                'de',
            );

            expect(englishHtml).toContain('2 hours ago');
            expect(germanHtml).toContain('vor 2 Stunden');
        } finally {
            vi.useRealTimers();
        }
    });

    it('renders a neutral marker for a missing modified time', () => {
        expect(renderProjectsTable([baseProject])).toContain('<p>-</p>');
    });
});
