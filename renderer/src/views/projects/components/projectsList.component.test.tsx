import type {
    CodeEditorIntegrationSettings,
    ProjectDetails,
} from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectSections } from '../projectsView.model';
import { ProjectsList } from './projectsList.component';

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

function renderProjectsList(
    sections: Partial<ProjectSections>,
    codeEditorSettings: CodeEditorIntegrationSettings[] = [
        availableVSCodeSettings,
    ],
    locale = 'en',
    pinnedReorderingDisabled = false,
    projectGitHubUrls: ReadonlyMap<string, string> = new Map(),
    translate: (key: string, options?: Record<string, unknown>) => string = (
        key,
        options,
    ) => {
        if (options?.editor) {
            return `${key}: ${options.editor}`;
        }
        if (options?.age) {
            return `${key}: ${options.age}`;
        }
        return key;
    },
): string {
    return renderToStaticMarkup(
        <ProjectsList
            sections={{
                newProjects: [],
                pinnedProjects: [],
                recentProjects: [],
                ...sections,
            }}
            loading={false}
            locale={locale}
            busyProjects={[]}
            projectGitHubUrls={projectGitHubUrls}
            codeEditorSettings={codeEditorSettings}
            highlightedPinnedProjectPath={null}
            pinnedReorderingDisabled={pinnedReorderingDisabled}
            onPinnedHighlightComplete={vi.fn()}
            onReorderPinnedProjects={vi.fn()}
            isInstalledRelease={vi.fn(() => true)}
            isProjectEditorDownloading={vi.fn(() => false)}
            onLaunchProject={vi.fn()}
            onProjectFoldersOptions={vi.fn()}
            onTogglePinned={vi.fn()}
            onProjectSettings={vi.fn()}
            onProjectMoreOptions={vi.fn()}
            t={translate}
        />,
    );
}

describe('ProjectsList', () => {
    it('renders project sections as lists', () => {
        const pinnedProject = { ...baseProject, pinned: true };
        const newProject = {
            ...baseProject,
            name: 'New Project',
            path: '/projects/new',
        };
        const html = renderProjectsList({
            newProjects: [newProject],
            pinnedProjects: [pinnedProject],
        });

        expect(html).toContain('sections.new');
        expect(html).toContain('sections.pinned');
        expect(html).toContain('New Project');
        expect(html).toContain('Sample Project');
        expect(html).toContain('data-project-section="new"');
        expect(html).toContain('data-project-section="pinned"');
        expect(html).not.toContain('<table');
        expect(html).toContain('lucide-pin');
        expect(html).not.toContain('lucide-pin-off');
    });

    it('shows reorder handles only for pinned projects', () => {
        const html = renderProjectsList({
            newProjects: [baseProject],
            pinnedProjects: [
                {
                    ...baseProject,
                    name: 'Pinned Project',
                    path: '/projects/pinned',
                    pinned: true,
                },
            ],
        });

        expect(
            html.match(/data-testid="btnReorderPinnedProject"/g),
        ).toHaveLength(1);
        expect(html).toContain('aria-label="pinning.reorder.label"');
    });

    it('disables pinned reordering while search results are filtered', () => {
        const html = renderProjectsList(
            {
                pinnedProjects: [{ ...baseProject, pinned: true }],
            },
            [availableVSCodeSettings],
            'en',
            true,
        );

        expect(html).toContain(
            'data-testid="btnReorderPinnedProject" disabled=""',
        );
    });

    it('renders project icons and status markers', () => {
        const html = renderProjectsList({
            newProjects: [
                {
                    ...baseProject,
                    icon_path: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
                    codeEditorId: 'vscode',
                    release: { ...baseProject.release, prerelease: true },
                },
            ],
        });

        expect(html).toContain(
            'src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="',
        );
        expect(html).toContain('aria-label="card.openFolders"');
        expect(html).toContain('aria-label="project.pinProject"');
        expect(html).toContain('aria-label="card.projectSettings"');
        expect(html).toContain('card.editInGodot');
        expect(html).toContain('vscode.svg');
        expect(html).toContain('lucide-flask-conical');
    });

    it('renders unavailable code editors as warnings', () => {
        const html = renderProjectsList(
            {
                newProjects: [{ ...baseProject, codeEditorId: 'vscode' }],
            },
            [{ ...availableVSCodeSettings, installation: null }],
        );

        expect(html).toContain('Visual Studio Code');
        expect(html).not.toContain('vscode.svg');
    });

    it('keeps wrapping badges separate from the fixed launch actions', () => {
        const html = renderProjectsList({
            newProjects: [
                {
                    ...baseProject,
                    codeEditorId: 'vscode',
                    withGit: true,
                    open_windowed: true,
                },
            ],
        });

        expect(html).toContain('data-testid="projectBadges"');
        expect(html).toContain('data-testid="projectLaunchActions"');
        expect(html.indexOf('data-testid="projectBadges"')).toBeLessThan(
            html.indexOf('data-testid="projectLaunchActions"'),
        );
        expect(html).toContain('card.windowed');
        expect(html).toContain('>Git<');
        expect(html).toContain('data-testid="gitProjectIcon"');
        expect(html).not.toContain('data-testid="githubProjectIcon"');
    });

    it('uses the GitHub label, icon, and tooltip for a cached GitHub origin', () => {
        const translate = vi.fn((key: string) => key);
        const html = renderProjectsList(
            {
                newProjects: [{ ...baseProject, withGit: true }],
            },
            [availableVSCodeSettings],
            'en',
            false,
            new Map([[baseProject.path, 'https://github.com/example/sample']]),
            translate,
        );

        expect(html).toContain('>GitHub<');
        expect(translate).toHaveBeenCalledWith('table.githubProject');
        expect(html).toContain('data-testid="githubProjectIcon"');
        expect(html).not.toContain('data-testid="gitProjectIcon"');
    });

    it('returns to the Git label, icon, and tooltip without a GitHub origin', () => {
        const translate = vi.fn((key: string) => key);
        const html = renderProjectsList(
            {
                newProjects: [{ ...baseProject, withGit: true }],
            },
            [availableVSCodeSettings],
            'en',
            false,
            new Map(),
            translate,
        );

        expect(html).toContain('>Git<');
        expect(translate).toHaveBeenCalledWith('table.gitProject');
        expect(html).toContain('data-testid="gitProjectIcon"');
        expect(html).not.toContain('data-testid="githubProjectIcon"');
    });

    it('renders localized relative times', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));

        try {
            const recentProject = {
                ...baseProject,
                last_opened: new Date('2026-08-02T10:00:00Z'),
            };

            expect(
                renderProjectsList(
                    { recentProjects: [recentProject] },
                    [availableVSCodeSettings],
                    'de',
                ),
            ).toContain('vor 2 Stunden');
        } finally {
            vi.useRealTimers();
        }
    });

    it('renders the empty state when no section has projects', () => {
        expect(renderProjectsList({})).toContain('sections.empty');
    });
});
