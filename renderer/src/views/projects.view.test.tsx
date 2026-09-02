import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsView } from './projects.view.tsx';

const projectState = vi.hoisted(() => ({
    projects: [] as ProjectDetails[],
    loading: false,
}));
const releaseState = vi.hoisted(() => ({
    installedReleases: [] as InstalledRelease[],
    downloadingReleases: [] as Array<{ version: string; mono: boolean }>,
    loading: false,
    initialized: true,
}));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router')>()),
    useNavigate: () => navigate,
}));

vi.mock('../hooks/useAlerts', () => ({
    useAlerts: () => ({
        addAlert: vi.fn(),
        addCustomConfirm: vi.fn(),
    }),
}));

vi.mock('../hooks/useAppNavigation', () => ({
    useAppNavigation: () => ({
        setCurrentView: vi.fn(),
        openExternalLink: vi.fn(),
    }),
}));

vi.mock('../hooks/usePreferences', () => ({
    usePreferences: () => ({
        preferences: {
            projects_location: '/Users/test/GodotProjects',
            confirm_project_remove: true,
        },
        updatePreferences: vi.fn(),
    }),
}));

vi.mock('../hooks/useRelease', () => ({
    useRelease: () => ({
        installedReleases: releaseState.installedReleases,
        availableReleases: [],
        availablePrereleases: [],
        downloadingReleases: releaseState.downloadingReleases,
        installRelease: vi.fn(),
        isInstalledRelease: vi.fn(() => false),
        loading: releaseState.loading,
        initialized: releaseState.initialized,
        checkAllReleasesValid: vi.fn(),
    }),
}));

vi.mock('../hooks/useProjects', () => ({
    useProjects: () => ({
        projects: projectState.projects,
        projectGitHubUrls: new Map(),
        codeEditorSettings: [],
        setProjectEditor: vi.fn(),
        setProjectWindowed: vi.fn(),
        setProjectPinned: vi.fn(),
        reorderPinnedProjects: vi.fn(),
        setProjectCodeEditor: vi.fn(),
        resetProjectCodeEditorConfig: vi.fn(),
        initializeProjectGit: vi.fn(),
        exportProjectEditorSettings: vi.fn(),
        importProjectEditorSettings: vi.fn(),
        addProject: vi.fn(),
        queueProjectEditorRepairs: vi.fn(),
        launchProject: vi.fn(),
        openProjectFolder: vi.fn(),
        openProjectEditorFolder: vi.fn(),
        renameProject: vi.fn(),
        getProjectGodotName: vi.fn(),
        removeProject: vi.fn(),
        refreshProjects: vi.fn(),
        loading: projectState.loading,
    }),
}));

vi.mock('./projects/hooks/useProjectActions', () => ({
    useProjectActions: () => ({
        projectActionsMenu: null,
        setProjectActionsMenu: vi.fn(),
        onProjectMoreOptions: vi.fn(),
        runProjectAction: vi.fn(),
        showRecoveredCodeEditorConfigWarning: vi.fn(),
        handleToggleProjectPinned: vi.fn(),
        handleImportEditorSettings: vi.fn(),
        handleRemoveProject: vi.fn(),
        showProjectActionError: vi.fn(),
    }),
}));

vi.mock('./projects/hooks/useAddProjectWorkflow', () => ({
    useAddProjectWorkflow: () => ({
        handleAddProjectResult: vi.fn(),
        onAddProject: vi.fn(),
        projectEditorInstallTargets: [],
    }),
}));

vi.mock('./projects/hooks/useProjectDropImport', () => ({
    useProjectDropImport: () => ({
        isDraggingOver: false,
        loadingProgress: undefined,
        handleDragEnter: vi.fn(),
        handleDragOver: vi.fn(),
        handleDragLeave: vi.fn(),
        handleDrop: vi.fn(),
    }),
}));

vi.mock('./projects/components/projectActionsMenu.component', () => ({
    ProjectActionsMenu: () => null,
}));
vi.mock('./projects/components/projectFoldersMenu.component', () => ({
    ProjectFoldersMenu: () => null,
}));
vi.mock('./subViews/createProjectDrawer.subview', () => ({
    CreateProjectDrawer: () => null,
}));
vi.mock('./subViews/projectSettingsDrawer.subview', () => ({
    ProjectSettingsDrawer: () => null,
}));

vi.mock('react-i18next', () => {
    const dictionary: Record<string, string> = {
        'projects:title': 'Projects',
        'projects:search.placeholder': 'Search',
        'projects:buttons.add': 'Add',
        'projects:buttons.newProject': 'New Project',
        'projects:emptyState.addExistingProject': 'Add an existing project',
        'projects:emptyState.withoutEditor.heading':
            'Install Godot to start a project',
        'projects:emptyState.withoutEditor.description':
            'Godot Launcher needs an editor before it can create or run projects.',
        'projects:emptyState.withoutEditor.installEditor': 'Install an editor',
        'projects:emptyState.withoutEditor.installingDescription':
            'Your editor is installing. You can create a project as soon as it is ready.',
        'projects:emptyState.withoutEditor.installingEditor':
            'Installing editor...',
        'projects:emptyState.withEditor.heading': 'Start your first project',
        'projects:emptyState.withEditor.description':
            'Create something new, or add a project already on this computer.',
        'projects:emptyState.withEditor.newProject': 'New Project',
        'common:buttons.copyPath': 'Copy path',
        'common:success': 'Copied',
    };

    return {
        useTranslation: (namespaces?: string[]) => ({
            t: (key: string, opts?: { ns?: string }) => {
                const namespace =
                    opts?.ns ??
                    (Array.isArray(namespaces) ? namespaces[0] : namespaces);
                return dictionary[`${namespace}:${key}`] ?? key;
            },
            i18n: { resolvedLanguage: 'en', language: 'en' },
        }),
        Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    };
});

describe('ProjectsView', () => {
    beforeEach(() => {
        navigate.mockClear();
        projectState.projects = [];
        projectState.loading = false;
        releaseState.installedReleases = [];
        releaseState.downloadingReleases = [];
        releaseState.loading = false;
        releaseState.initialized = true;
    });

    it('guides users to install Godot when both collections are empty', () => {
        const html = renderToStaticMarkup(<ProjectsView />);

        expect(html).toContain('lucide-hard-drive-download');
        expect(html).toContain('Install Godot to start a project');
        expect(html).toContain('Install an editor');
        expect(html).toContain('Add an existing project');
        expect(html).toContain('/Users/test/GodotProjects');
        expect(html).not.toContain('inputProjectSearch');
        expect(html).not.toContain('btnProjectAdd');
        expect(html).not.toContain('btnProjectCreate');
        expect(html).not.toContain('No projects found');
    });

    it('guides users to create a project when an editor is available', () => {
        releaseState.installedReleases = [{} as InstalledRelease];

        const html = renderToStaticMarkup(<ProjectsView />);

        expect(html).toContain('lucide-folder-plus');
        expect(html).toContain('Start your first project');
        expect(html).toContain('New Project');
        expect(html).toContain('Add an existing project');
        expect(html).not.toContain('inputProjectSearch');
        expect(html).not.toContain('btnProjectAdd');
        expect(html).not.toContain('btnProjectCreate');
    });

    it('does not treat an invalid editor as available for project creation', () => {
        releaseState.installedReleases = [{ valid: false } as InstalledRelease];

        const html = renderToStaticMarkup(<ProjectsView />);

        expect(html).toContain('Install Godot to start a project');
        expect(html).not.toContain('Start your first project');
    });

    it('waits for an installing editor without exposing project list chrome', () => {
        releaseState.downloadingReleases = [
            { version: '4.7-stable', mono: false },
        ];

        const html = renderToStaticMarkup(<ProjectsView />);

        expect(html).toContain('Your editor is installing.');
        expect(html).toContain('Installing editor...');
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain('disabled=""');
        expect(html).toContain('Add an existing project');
        expect(html).not.toContain('inputProjectSearch');
        expect(html).not.toContain('btnProjectCreate');
    });
});
