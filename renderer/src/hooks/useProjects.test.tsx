import type {
    CreateProjectGitOptions,
    CreateProjectParentRepositoryConsent,
    CreateProjectPublicationOptions,
    InstalledRelease,
    ProjectDetails,
} from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSettingsDraft } from './project-settings-save.types';
import { ProjectsProvider, useProjects } from './useProjects.tsx';

const mocks = vi.hoisted(() => ({
    createProject: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('../bridge.ts', () => ({
    appBridge: {},
    codeEditorIntegrationBridge: {},
    projectsBridge: {
        createProject: mocks.createProject,
    },
    subscribeAppEvent: vi.fn(() => () => {}),
}));

vi.mock('./useAlerts', () => ({
    useAlerts: () => ({
        addAlert: vi.fn(),
        addCustomConfirm: vi.fn(),
    }),
}));

vi.mock('./useRelease', () => ({
    useRelease: () => ({ installRelease: vi.fn() }),
}));

describe('useProjects', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.createProject.mockResolvedValue({ success: false });
    });

    /**
     * Captures the projects context through a server-rendered test component.
     *
     * @returns The rendered project operations.
     */
    function renderHook(): ReturnType<typeof useProjects> {
        let captured: ReturnType<typeof useProjects> | undefined;

        const Capture = () => {
            captured = useProjects();
            return null;
        };

        renderToStaticMarkup(
            <ProjectsProvider>
                <Capture />
            </ProjectsProvider>,
        );

        if (!captured) {
            throw new Error('Hook was not rendered');
        }
        return captured;
    }

    it('locks each pending project independently and allows retry after failure', async () => {
        const hook = renderHook();
        const draft: ProjectSettingsDraft = {
            name: 'Draft',
            renameGodotProject: false,
            windowed: true,
            codeEditorId: null,
            codeEditorTouched: false,
            releaseSelection: {
                source: 'installed',
                key: '4.6:std',
                release: { version: '4.6' } as InstalledRelease,
            },
        };
        let rejectInstallation!: (error: Error) => void;
        const installation = new Promise<ProjectDetails>((_resolve, reject) => {
            rejectInstallation = reject;
        });
        const save = vi.fn(() => installation);
        hook.startSettingsSave('/project', draft, save);
        hook.clearSettingsSave('/project');
        hook.startSettingsSave('/project', draft, save);
        expect(save).toHaveBeenCalledTimes(1);
        const otherSave = vi.fn(
            async () => ({ name: 'Other' }) as ProjectDetails,
        );
        hook.startSettingsSave('/other', draft, otherSave);
        expect(otherSave).toHaveBeenCalledOnce();
        rejectInstallation(new Error('Install failed'));
        await Promise.resolve();
        const retry = vi.fn(async () => ({ name: 'Draft' }) as ProjectDetails);
        hook.startSettingsSave('/project', draft, retry);
        expect(retry).toHaveBeenCalledOnce();
    });

    it('forwards parent repository consent to the Create Project bridge', async () => {
        const hook = renderHook();
        const release = { version: '4.6.0' } as InstalledRelease;
        const gitOptions: CreateProjectGitOptions = {
            initialCommit: 'create',
        };
        const publication: CreateProjectPublicationOptions = {
            providerId: 'github',
            connectionId: 'connection-id',
            accessTargetId: 'godotlauncher',
            repositoryName: 'captured-project',
        };
        const consent: CreateProjectParentRepositoryConsent = {
            root: '/workspace/parent',
        };

        await hook.createProject(
            'Captured Project',
            release,
            'COMPATIBLE',
            'vscode',
            true,
            '/workspace/parent/Captured Project',
            gitOptions,
            publication,
            consent,
        );

        expect(mocks.createProject).toHaveBeenCalledWith(
            'Captured Project',
            release,
            'COMPATIBLE',
            'vscode',
            true,
            '/workspace/parent/Captured Project',
            gitOptions,
            publication,
            consent,
        );
    });
});
