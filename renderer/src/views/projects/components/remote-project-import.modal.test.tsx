import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RemoteProjectImportModal } from './remote-project-import.modal';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('../../../hooks/usePreferences', () => ({
    usePreferences: () => ({
        platform: 'linux',
        preferences: { projects_location: '/projects' },
    }),
}));

vi.mock('../../../hooks/useProjects', () => ({
    useProjects: () => ({
        addProject: vi.fn(),
        codeEditorSettings: [],
        projects: [],
    }),
}));

vi.mock('../../../hooks/useRelease', () => ({
    useRelease: () => ({ getReleaseInstallProgress: vi.fn() }),
}));

vi.mock('../../../bridge', () => ({
    appBridge: { openDirectoryDialog: vi.fn() },
    projectsBridge: {
        cancelRemoteProjectImport: vi.fn(),
        importRemoteProject: vi.fn(),
        inspectPublicGitSource: vi.fn(),
        listConnectedRepositories: vi.fn(),
    },
    subscribeAppEvent: vi.fn(),
}));

const defaultProps = {
    onOpenChange: vi.fn(),
    handleAddProjectResult: vi.fn(),
    editorInstallTargets: [],
};

describe('RemoteProjectImportModal', () => {
    it('keeps public URL entry isolated from the GitHub repository selector', () => {
        const html = renderToStaticMarkup(
            <RemoteProjectImportModal
                {...defaultProps}
                source="public-git-url"
            />,
        );

        expect(html).toContain('role="dialog"');
        expect(html).toContain('addProject.remote.public.urlPlaceholder');
        expect(html).toContain('data-testid="inputPublicGitRepositoryUrl"');
        expect(html).not.toContain(
            'addProject.remote.github.searchPlaceholder',
        );
        expect(html).not.toContain('addProject.remote.github.openConnections');
    });

    it('keeps the GitHub selector isolated from free-form URL entry', () => {
        const html = renderToStaticMarkup(
            <RemoteProjectImportModal {...defaultProps} source="github" />,
        );

        expect(html).toContain('role="dialog"');
        expect(html).toContain('h-[85vh] max-w-5xl');
        expect(html).toContain('addProject.remote.github.searchPlaceholder');
        expect(html).not.toContain('addProject.remote.github.visibility');
        expect(html).not.toContain('addProject.remote.public.urlLabel');
    });

    it('renders nothing when no remote source is selected', () => {
        const html = renderToStaticMarkup(
            <RemoteProjectImportModal {...defaultProps} source={null} />,
        );

        expect(html).toBe('');
    });
});
