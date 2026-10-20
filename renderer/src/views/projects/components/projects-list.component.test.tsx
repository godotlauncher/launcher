import type {
    CodeEditorIntegrationSettings,
    ProjectDetails,
    ProjectSectionKey,
    ReleaseInstallProgress,
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
    terminalAvailable?: boolean;
    groupOrder?: ProjectSectionKey[];
    viewMode?: 'cards' | 'list' | 'dense';
    installProgress?: ReleaseInstallProgress;
    getReleaseInstallProgress?: (
        version: string,
        mono: boolean,
    ) => ReleaseInstallProgress | undefined;
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
 * @param options - View, terminal availability and editor status overrides.
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
            groupOrder={options.groupOrder}
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
            terminalAvailable={options.terminalAvailable ?? true}
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
            getReleaseInstallProgress={
                options.getReleaseInstallProgress ??
                (() => options.installProgress)
            }
            onCancelEditorInstall={vi.fn()}
            onInstallRequiredProjectEditor={vi.fn()}
            onLaunchProject={vi.fn()}
            onOpenCodeEditor={vi.fn()}
            onOpenTerminal={vi.fn()}
            onProjectFoldersOptions={vi.fn()}
            onTogglePinned={vi.fn()}
            onProjectSettings={vi.fn()}
            onProjectMoreOptions={vi.fn()}
            t={translate}
        />,
    );
}

describe('ProjectsList', () => {
    it.each(['cards', 'list', 'dense'] as const)(
        'uses the default and saved group order in %s view',
        (viewMode) => {
            const sections = {
                newProjects: [baseProject],
                pinnedProjects: [
                    { ...baseProject, path: '/pinned', pinned: true },
                ],
                recentProjects: [
                    {
                        ...baseProject,
                        path: '/recent',
                        last_opened: new Date(),
                    },
                ],
            };
            const defaultHtml = renderProjectsList(
                sections,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                { viewMode },
            );
            expect(
                [
                    ...defaultHtml.matchAll(
                        /id="(pinned|new|recents)-projects-heading"/g,
                    ),
                ].map((match) => match[1]),
            ).toEqual(['pinned', 'new', 'recents']);
            const customHtml = renderProjectsList(
                sections,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                { viewMode, groupOrder: ['recents', 'pinned', 'new'] },
            );
            expect(
                [
                    ...customHtml.matchAll(
                        /id="(pinned|new|recents)-projects-heading"/g,
                    ),
                ].map((match) => match[1]),
            ).toEqual(['recents', 'pinned', 'new']);
        },
    );
    it('renders dense identity, version and actions without the compact path line', () => {
        const html = renderProjectsList(
            { newProjects: [baseProject] },
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            { viewMode: 'dense' },
        );
        expect(html).toContain('data-project-view="dense"');
        expect(html).toContain('Sample Project');
        expect(html).toContain('4.3-stable');
        expect(html).toContain('btnLaunchDenseProject');
        for (const action of [
            'btnToggleProjectPinned',
            'btnProjectTerminal',
            'btnProjectFolders',
            'btnProjectSettings',
            'btnProjectMoreOptions',
        ]) {
            expect(html).toContain(action);
        }
        expect(html).not.toContain('btnLaunchCompactProject');
        expect(html).not.toContain('btnCopyProjectPath_');
        expect(html).not.toContain('card.notOpened');
    });

    it.each(['missing', 'downloading'] as const)(
        'keeps dense launch disabled when the editor is %s',
        (state) => {
            const html = renderProjectsList(
                { newProjects: [baseProject] },
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {
                    viewMode: 'dense',
                    isInstalledRelease: () => state !== 'missing',
                    isProjectEditorDownloading: () => state === 'downloading',
                    getDownloadableProjectEditor: () => downloadableRelease,
                },
            );
            expect(html).toMatch(
                /data-testid="btnLaunchDenseProject"[^>]*disabled/,
            );
            expect(html).toContain('4.3-stable');
            if (state === 'missing') {
                expect(html).toContain('btnInstallRequiredProjectEditor');
                expect(html).toContain('table.invalidReasons.missingEditor');
            }
        },
    );

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

    describe.each(['cards', 'list', 'dense'] as const)(
        '%s project opening actions',
        (viewMode) => {
            it.each(['vscode', 'vscodium'] as const)(
                'opens %s directly when the terminal is unavailable',
                (codeEditorId) => {
                    const editorName =
                        codeEditorId === 'vscode'
                            ? 'Visual Studio Code'
                            : 'VSCodium';
                    const editorSettings = {
                        ...availableVSCodeSettings,
                        integration: {
                            ...availableVSCodeSettings.integration,
                            id: codeEditorId,
                            displayName: editorName,
                        },
                    };
                    const html = renderProjectsList(
                        { recentProjects: [{ ...baseProject, codeEditorId }] },
                        [editorSettings],
                        'en',
                        false,
                        new Map(),
                        undefined,
                        { viewMode, terminalAvailable: false },
                    );
                    expect(html).toContain(
                        `aria-label="project.openCodeEditor: ${editorName}"`,
                    );
                    expect(html).toContain(
                        'data-testid="btnProjectCodeEditor"',
                    );
                    expect(html).not.toContain(
                        'data-testid="btnProjectTerminal"',
                    );
                    expect(html).not.toContain(
                        'data-testid="btnProjectOpenTools"',
                    );
                },
            );

            it('retains the terminal and dropdown when both tools are available', () => {
                const html = renderProjectsList(
                    {
                        recentProjects: [
                            { ...baseProject, codeEditorId: 'vscode' },
                        ],
                    },
                    undefined,
                    'en',
                    false,
                    new Map(),
                    undefined,
                    { viewMode, terminalAvailable: true },
                );
                expect(html).toContain('aria-label="project.openTerminal"');
                expect(html).toContain('data-testid="btnProjectOpenTools"');
                expect(html).not.toContain(
                    'data-testid="btnProjectCodeEditor"',
                );
            });

            it('retains the terminal warning action without an associated editor', () => {
                const html = renderProjectsList(
                    { recentProjects: [baseProject] },
                    undefined,
                    'en',
                    false,
                    new Map(),
                    undefined,
                    { viewMode, terminalAvailable: false },
                );
                expect(html).toContain('aria-label="project.openTerminal"');
                expect(html).not.toContain('data-testid="btnProjectOpenTools"');
                expect(html).not.toContain(
                    'data-testid="btnProjectCodeEditor"',
                );
            });
        },
    );

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

    it.each(['cards', 'list', 'dense'] as const)(
        'offers cancellation only for a current cancellable job in %s',
        (viewMode) => {
            const progress: ReleaseInstallProgress = {
                id: 'shared-job',
                version: baseProject.release.version,
                mono: false,
                prerelease: false,
                published_at: null,
                stage: 'downloading',
                canCancel: true,
            };
            const renderProgress = (installProgress?: ReleaseInstallProgress) =>
                renderProjectsList(
                    { newProjects: [baseProject] },
                    [],
                    'en',
                    false,
                    new Map(),
                    undefined,
                    {
                        viewMode,
                        installProgress,
                        isInstalledRelease: () => false,
                        isProjectEditorDownloading: () => true,
                        getDownloadableProjectEditor: () => downloadableRelease,
                    },
                );
            expect(renderProgress(progress)).toContain(
                'aria-label="progress.cancelLabel"',
            );
            expect(
                renderProgress({
                    ...progress,
                    stage: 'cancelling',
                    canCancel: false,
                }),
            ).not.toContain('aria-label="progress.cancelLabel"');
            expect(renderProgress()).not.toContain(
                'aria-label="progress.cancelLabel"',
            );
        },
    );

    it('finds the exact download for a project that stores only an editor branch', () => {
        const progress: ReleaseInstallProgress = {
            id: 'exact-job',
            version: downloadableRelease.version,
            mono: false,
            prerelease: false,
            published_at: null,
            stage: 'downloading',
            canCancel: true,
        };
        const getProgress = vi.fn((version: string, mono: boolean) =>
            version === progress.version && mono === progress.mono
                ? progress
                : undefined,
        );
        const html = renderProjectsList(
            {
                newProjects: [
                    {
                        ...baseProject,
                        release: { ...baseProject.release, version: '4.3' },
                    },
                ],
            },
            [],
            'en',
            false,
            new Map(),
            undefined,
            {
                isInstalledRelease: () => false,
                getDownloadableProjectEditor: () => downloadableRelease,
                getReleaseInstallProgress: getProgress,
            },
        );
        expect(getProgress).toHaveBeenCalledWith(
            downloadableRelease.version,
            false,
        );
        expect(html).toContain('aria-label="progress.cancelLabel"');
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
