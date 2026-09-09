import type {
    CodeEditorIntegrationSettings,
    ProjectDetails,
    ReleaseSummary,
} from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectSections } from '../projects-view.model';
import { ProjectsList } from './projects-list.component';

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

const downloadableRelease: ReleaseSummary = {
    version: '4.3-stable',
    version_number: 4.3,
    name: '4.3-stable',
    published_at: null,
    draft: false,
    prerelease: false,
    assets: [
        {
            name: '4.3-standard',
            download_url: 'https://example.com/4.3-standard.zip',
            platform_tags: ['darwin', 'arm64'],
            mono: false,
        },
    ],
};

type RenderOptions = {
    viewMode?: 'cards' | 'list';
    isInstalledRelease?: (version: string, mono: boolean) => boolean;
    isProjectEditorDownloading?: (project: ProjectDetails) => boolean;
    getDownloadableProjectEditor?: (
        project: ProjectDetails,
    ) => ReleaseSummary | undefined;
};

/**
 * Renders a project collection with controlled status callbacks.
 * @param sections - Project groups to render.
 * @param codeEditorSettings - Available code editor settings.
 * @param locale - Relative-time locale.
 * @param pinnedReorderingDisabled - Whether search disables reordering.
 * @param projectGitHubUrls - Cached repository URLs.
 * @param translate - Translation stub.
 * @param options - View and editor status overrides.
 */
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
    options: RenderOptions = {},
): string {
    return renderToStaticMarkup(
        <ProjectsList
            viewMode={options.viewMode}
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
            isInstalledRelease={options.isInstalledRelease ?? vi.fn(() => true)}
            isProjectEditorDownloading={
                options.isProjectEditorDownloading ?? vi.fn(() => false)
            }
            getDownloadableProjectEditor={
                options.getDownloadableProjectEditor ?? vi.fn(() => undefined)
            }
            onInstallRequiredProjectEditor={vi.fn()}
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
    it('keeps compact identity launch separate from path and action controls', () => {
        const html = renderProjectsList(
            { newProjects: [baseProject] },
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            { viewMode: 'list' },
        );
        expect(html).toContain('data-project-view="list"');
        expect(html).toContain('btnLaunchCompactProject');
        expect(html).not.toContain('btnEditProjectInGodot');
        expect(html).toContain('btnCopyProjectPath_new_');
        expect(html).toContain('btnProjectSettings');
        expect(html).toContain('btnProjectFolders');
        expect(html).toContain('card.notOpened');
        const launchButton = html.match(
            /<button[^>]*data-testid="btnLaunchCompactProject"[^>]*>[\s\S]*?<\/button>/,
        )?.[0];
        expect(launchButton).toContain('Sample Project');
        expect(launchButton).not.toContain('/projects/sample');
    });

    it('keeps missing-editor recovery and disabled launch in List view', () => {
        const html = renderProjectsList(
            { newProjects: [baseProject] },
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            {
                viewMode: 'list',
                isInstalledRelease: () => false,
                getDownloadableProjectEditor: () => downloadableRelease,
            },
        );
        expect(html).toMatch(
            /data-testid="btnLaunchCompactProject"[^>]*disabled/,
        );
        expect(html).toContain('btnInstallRequiredProjectEditor');
        expect(html).toContain('table.invalidReasons.missingEditor');
    });

    it('shows one missing-editor warning beside the compact version', () => {
        const html = renderProjectsList(
            {
                newProjects: [
                    {
                        ...baseProject,
                        valid: false,
                        invalid_reason: 'missing_editor',
                    },
                ],
            },
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            { viewMode: 'list', isInstalledRelease: () => false },
        );
        expect(html.match(/lucide-triangle-alert/g)).toHaveLength(1);
        expect(html).toMatch(
            /data-testid="compactProjectEditorVersion"[^>]*text-warning/,
        );
        expect(html).toContain('4.3-stable');
    });

    it('retains a distinct missing-project warning when the editor is also absent', () => {
        const html = renderProjectsList(
            {
                newProjects: [
                    {
                        ...baseProject,
                        valid: false,
                        invalid_reason: 'missing_project_file',
                    },
                ],
            },
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            { viewMode: 'list', isInstalledRelease: () => false },
        );
        expect(html.match(/lucide-triangle-alert/g)).toHaveLength(2);
        expect(html).toContain('table.invalidReasons.missingProjectFile');
        expect(html).toContain('table.invalidReasons.missingEditor');
    });

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

    it('renders unavailable code editors as warnings', () => {
        const html = renderProjectsList(
            {
                newProjects: [{ ...baseProject, codeEditorId: 'vscode' }],
            },
            [{ ...availableVSCodeSettings, installation: null }],
        );

        expect(html).toContain('Visual Studio Code');
    });

    it('offers an exact missing official editor download with its accessible label', () => {
        const missingProject: ProjectDetails = {
            ...baseProject,
            valid: false,
            invalid_reason: 'missing_editor',
            release: {
                ...baseProject.release,
                valid: false,
                source: 'official',
            },
        };

        const html = renderProjectsList(
            { newProjects: [missingProject] },
            [availableVSCodeSettings],
            'en',
            false,
            new Map(),
            (key) =>
                key === 'card.installRequiredEditor'
                    ? 'Install required editor'
                    : key,
            {
                isInstalledRelease: vi.fn(() => false),
                getDownloadableProjectEditor: vi.fn(() => downloadableRelease),
            },
        );

        expect(html).toContain('aria-label="Install required editor"');
        expect(html).toContain('card.editInGodot');
    });

    it('disables the editor download action while that editor downloads', () => {
        const missingProject: ProjectDetails = {
            ...baseProject,
            valid: false,
            invalid_reason: 'missing_editor',
            release: {
                ...baseProject.release,
                valid: false,
                source: 'official',
            },
        };
        const sharedMissingProject = {
            ...missingProject,
            name: 'Second Missing Editor Project',
            path: '/projects/second-missing-editor',
        };

        const html = renderProjectsList(
            { newProjects: [missingProject, sharedMissingProject] },
            [availableVSCodeSettings],
            'en',
            false,
            new Map(),
            undefined,
            {
                isInstalledRelease: vi.fn(() => false),
                isProjectEditorDownloading: vi.fn(() => true),
                getDownloadableProjectEditor: vi.fn(() => downloadableRelease),
            },
        );

        expect(
            html.match(
                /data-testid="btnInstallRequiredProjectEditor" disabled=""/g,
            ),
        ).toHaveLength(2);
    });

    it('uses the GitHub label for a cached GitHub origin', () => {
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
    });

    it('returns to the Git label without a GitHub origin', () => {
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
