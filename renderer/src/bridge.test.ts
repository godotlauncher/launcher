import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    appBridge,
    codeEditorIntegrationBridge,
    editorCatalogBridge,
    editorInstallsBridge,
    getPathForFile,
    gitBridge,
    gitLfsBridge,
    projectsBridge,
    subscribeAppEvent,
    toolIntegrationBridge,
} from './bridge.js';

type TestElectronApi = {
    getPathForFile: (file: File) => string;
    getPlatform: () => Promise<string>;
    getOnboardingRecommendedLocations: () => Promise<{
        projectsLocation: string;
        editorLocation: string;
    }>;
    rendererReady: () => Promise<void>;
    subscribeProjects: (callback: (projects: unknown[]) => void) => () => void;
    'codeEditorIntegration.listIntegrationSettings': () => Promise<unknown[]>;
    'codeEditorIntegration.rescanIntegration': (
        integrationId: string,
    ) => Promise<unknown>;
    'codeEditorIntegration.updateIntegrationSettings': (
        integrationId: string,
        settings: unknown,
    ) => Promise<unknown>;
    'codeEditorIntegration.setDefaultIntegration': (
        integrationId: string,
    ) => Promise<unknown[]>;
    'codeEditorIntegration.validateIntegrationPath': (
        integrationId: string,
        pathToValidate: string,
    ) => Promise<unknown>;
    'editorCatalog.getCatalog': () => Promise<unknown>;
    'editorCatalog.getReleaseById': (id: string) => Promise<unknown>;
    'editorCatalog.refreshCatalog': () => Promise<unknown>;
    'editorInstalls.getInstalledEditors': () => Promise<unknown[]>;
    'editorInstalls.installEditor': (...args: unknown[]) => Promise<unknown>;
    'editorInstalls.reinstallEditor': (...args: unknown[]) => Promise<unknown>;
    'editorInstalls.cancelInstall': (jobId: string) => Promise<unknown>;
    'editorInstalls.removeEditor': (...args: unknown[]) => Promise<unknown>;
    'editorInstalls.registerCustomEditor': (
        ...args: unknown[]
    ) => Promise<unknown>;
    'editorInstalls.openProjectManager': (...args: unknown[]) => Promise<void>;
    'editorInstalls.revalidateInstalledEditors': () => Promise<unknown[]>;
    'git.getGlobalIdentity': () => Promise<unknown>;
    'git.getIdentitySettings': () => Promise<unknown>;
    'git.saveGlobalIdentity': (identity: unknown) => Promise<unknown>;
    'git.saveProjectIdentityPreset': (preset: unknown) => Promise<unknown>;
    'gitLfs.getTrackingPolicy': () => Promise<unknown>;
    'projects.createProject': (...args: unknown[]) => Promise<unknown>;
    'projects.getProjectsDetails': () => Promise<unknown[]>;
    'toolIntegration.listIntegrations': () => Promise<unknown[]>;
    'toolIntegration.rescanIntegrations': () => Promise<unknown[]>;
    'toolIntegration.refreshIntegration': (toolId: string) => Promise<unknown>;
    'toolIntegration.rescanIntegration': (toolId: string) => Promise<unknown>;
};

describe('renderer bridge', () => {
    const getPlatform = vi.fn(async () => 'win32');
    const getOnboardingRecommendedLocations = vi.fn(async () => ({
        projectsLocation: 'C:\\Users\\Mario\\Godot\\Projects',
        editorLocation: 'C:\\Users\\Mario\\Godot\\Editors',
    }));
    const getPath = vi.fn(() => '/projects/example/project.godot');
    const rendererReady = vi.fn(async () => undefined);
    const listIntegrationSettings = vi.fn(async () => []);
    const rescanIntegration = vi.fn(async () => ({}));
    const updateIntegrationSettings = vi.fn(async () => ({
        enabled: false,
        customPath: null,
        execFlagsOverride: '',
    }));
    const setDefaultIntegration = vi.fn(async () => []);
    const validateIntegrationPath = vi.fn(async () => ({ valid: true }));
    const getCatalog = vi.fn(async () => ({ releases: [], providers: [] }));
    const getReleaseById = vi.fn(async () => null);
    const refreshCatalog = vi.fn(async () => ({ releases: [], providers: [] }));
    const getInstalledEditors = vi.fn(async () => []);
    const installEditor = vi.fn(async () => ({ success: true }));
    const reinstallEditor = vi.fn(async () => ({ success: true }));
    const cancelInstall = vi.fn(async (jobId: string) => ({
        jobId,
        status: 'cancelled',
    }));
    const removeEditor = vi.fn(async () => ({ success: true }));
    const registerCustomEditor = vi.fn(async () => ({ success: true }));
    const openProjectManager = vi.fn(async () => undefined);
    const revalidateInstalledEditors = vi.fn(async () => []);
    const getGlobalIdentity = vi.fn(async () => ({
        name: 'Mario',
        email: 'mario@example.com',
    }));
    const getIdentitySettings = vi.fn(async () => ({
        globalIdentity: await getGlobalIdentity(),
        projectPreset: null,
    }));
    const saveGlobalIdentity = vi.fn(async (identity) => ({
        success: true,
        identity,
    }));
    const saveProjectIdentityPreset = vi.fn(async (preset) => ({
        success: true,
        preset,
    }));
    const getGitLfsTrackingPolicy = vi.fn(async () => ({
        id: 'godot-documentation-defaults',
        groups: [],
    }));
    const createProject = vi.fn(async () => ({ success: false }));
    const getProjectsDetails = vi.fn(async () => []);
    const listToolIntegrations = vi.fn(async () => []);
    const rescanToolIntegrations = vi.fn(async () => []);
    const refreshToolIntegration = vi.fn(async () => ({}));
    const rescanToolIntegration = vi.fn(async () => ({}));
    const unsubscribe = vi.fn();
    const subscribeProjects = vi.fn(
        (listener: (projects: unknown[]) => void) => {
            projectsListener = listener;
            return unsubscribe;
        },
    );
    let projectsListener: ((projects: unknown[]) => void) | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        projectsListener = undefined;

        const electron: TestElectronApi = {
            getPlatform,
            getOnboardingRecommendedLocations,
            getPathForFile: getPath,
            rendererReady,
            'codeEditorIntegration.listIntegrationSettings':
                listIntegrationSettings,
            'codeEditorIntegration.rescanIntegration': rescanIntegration,
            'codeEditorIntegration.updateIntegrationSettings':
                updateIntegrationSettings,
            'codeEditorIntegration.setDefaultIntegration':
                setDefaultIntegration,
            'codeEditorIntegration.validateIntegrationPath':
                validateIntegrationPath,
            'editorCatalog.getCatalog': getCatalog,
            'editorCatalog.getReleaseById': getReleaseById,
            'editorCatalog.refreshCatalog': refreshCatalog,
            'editorInstalls.getInstalledEditors': getInstalledEditors,
            'editorInstalls.installEditor': installEditor,
            'editorInstalls.reinstallEditor': reinstallEditor,
            'editorInstalls.cancelInstall': cancelInstall,
            'editorInstalls.removeEditor': removeEditor,
            'editorInstalls.registerCustomEditor': registerCustomEditor,
            'editorInstalls.openProjectManager': openProjectManager,
            'editorInstalls.revalidateInstalledEditors':
                revalidateInstalledEditors,
            'git.getGlobalIdentity': getGlobalIdentity,
            'git.getIdentitySettings': getIdentitySettings,
            'git.saveGlobalIdentity': saveGlobalIdentity,
            'git.saveProjectIdentityPreset': saveProjectIdentityPreset,
            'gitLfs.getTrackingPolicy': getGitLfsTrackingPolicy,
            'projects.createProject': createProject,
            'projects.getProjectsDetails': getProjectsDetails,
            'toolIntegration.listIntegrations': listToolIntegrations,
            'toolIntegration.rescanIntegrations': rescanToolIntegrations,
            'toolIntegration.refreshIntegration': refreshToolIntegration,
            'toolIntegration.rescanIntegration': rescanToolIntegration,
            subscribeProjects,
        };

        (
            globalThis as unknown as { window: { electron: TestElectronApi } }
        ).window = {
            electron,
        };
    });

    it('delegates controller requests through the app namespace', async () => {
        await expect(appBridge.getPlatform()).resolves.toBe('win32');
        await expect(
            appBridge.getOnboardingRecommendedLocations(),
        ).resolves.toEqual({
            projectsLocation: 'C:\\Users\\Mario\\Godot\\Projects',
            editorLocation: 'C:\\Users\\Mario\\Godot\\Editors',
        });
        expect(getPlatform).toHaveBeenCalledOnce();
        expect(getOnboardingRecommendedLocations).toHaveBeenCalledOnce();
    });

    it('notifies the main process when the renderer is ready', async () => {
        await appBridge.rendererReady();

        expect(rendererReady).toHaveBeenCalledOnce();
    });

    it('delegates through the code editor integration namespace', async () => {
        await codeEditorIntegrationBridge.listIntegrationSettings();
        await codeEditorIntegrationBridge.rescanIntegration('vscode');
        await codeEditorIntegrationBridge.updateIntegrationSettings('vscode', {
            enabled: false,
            customPath: null,
            execFlagsOverride: '',
        });
        await codeEditorIntegrationBridge.setDefaultIntegration('vscode');
        await codeEditorIntegrationBridge.validateIntegrationPath(
            'vscode',
            '/custom/code',
        );

        expect(validateIntegrationPath).toHaveBeenCalledWith(
            'vscode',
            '/custom/code',
        );
        expect(listIntegrationSettings).toHaveBeenCalledOnce();
        expect(rescanIntegration).toHaveBeenCalledWith('vscode');
        expect(updateIntegrationSettings).toHaveBeenCalledWith('vscode', {
            enabled: false,
            customPath: null,
            execFlagsOverride: '',
        });
        expect(setDefaultIntegration).toHaveBeenCalledWith('vscode');
    });

    it('delegates through the editor catalog namespace', async () => {
        await editorCatalogBridge.getCatalog();
        await editorCatalogBridge.getReleaseById('official-stable:4.5-stable');
        await editorCatalogBridge.refreshCatalog();

        expect(getCatalog).toHaveBeenCalledOnce();
        expect(getReleaseById).toHaveBeenCalledWith(
            'official-stable:4.5-stable',
        );
        expect(refreshCatalog).toHaveBeenCalledOnce();
    });

    it('delegates through the editor installs namespace', async () => {
        await editorInstallsBridge.getInstalledEditors();
        await editorInstallsBridge.cancelInstall('editor-install-1');
        await editorInstallsBridge.revalidateInstalledEditors();

        expect(getInstalledEditors).toHaveBeenCalledOnce();
        expect(cancelInstall).toHaveBeenCalledWith('editor-install-1');
        expect(revalidateInstalledEditors).toHaveBeenCalledOnce();
    });

    it('delegates through the tool integration namespace', async () => {
        await toolIntegrationBridge.listIntegrations();
        await toolIntegrationBridge.rescanIntegrations();
        await toolIntegrationBridge.refreshIntegration('git');
        await toolIntegrationBridge.rescanIntegration('git');

        expect(listToolIntegrations).toHaveBeenCalledOnce();
        expect(rescanToolIntegrations).toHaveBeenCalledOnce();
        expect(refreshToolIntegration).toHaveBeenCalledWith('git');
        expect(rescanToolIntegration).toHaveBeenCalledWith('git');
    });

    it('delegates through the Git namespace', async () => {
        await expect(gitBridge.getGlobalIdentity()).resolves.toEqual({
            name: 'Mario',
            email: 'mario@example.com',
        });

        expect(getGlobalIdentity).toHaveBeenCalledOnce();

        await gitBridge.getIdentitySettings();
        await gitBridge.saveGlobalIdentity({
            name: 'Mario',
            email: 'mario@example.com',
        });
        await gitBridge.saveProjectIdentityPreset(null);

        expect(getIdentitySettings).toHaveBeenCalledOnce();
        expect(saveGlobalIdentity).toHaveBeenCalledOnce();
        expect(saveProjectIdentityPreset).toHaveBeenCalledWith(null);
    });

    it('delegates through the Git LFS namespace', async () => {
        await expect(gitLfsBridge.getTrackingPolicy()).resolves.toEqual({
            id: 'godot-documentation-defaults',
            groups: [],
        });

        expect(getGitLfsTrackingPolicy).toHaveBeenCalledOnce();
    });

    it('delegates through the projects namespace', async () => {
        await expect(projectsBridge.getProjectsDetails()).resolves.toEqual([]);

        expect(getProjectsDetails).toHaveBeenCalledOnce();
    });

    it('forwards parent repository consent through the projects namespace', async () => {
        const release = {
            version: '4.6.0',
        } as Parameters<typeof projectsBridge.createProject>[1];
        const consent = { root: '/workspace/parent' };

        await projectsBridge.createProject(
            'Captured Project',
            release,
            'COMPATIBLE',
            'vscode',
            true,
            '/workspace/parent/Captured Project',
            { initialCommit: 'create' },
            undefined,
            consent,
        );

        expect(createProject).toHaveBeenCalledWith(
            'Captured Project',
            release,
            'COMPATIBLE',
            'vscode',
            true,
            '/workspace/parent/Captured Project',
            { initialCommit: 'create' },
            undefined,
            consent,
        );
    });

    it('multiplexes application events through one transport listener', () => {
        const firstCallback = vi.fn();
        const secondCallback = vi.fn();
        const disposeFirst = subscribeAppEvent(
            'projects-updated',
            firstCallback,
        );
        const disposeSecond = subscribeAppEvent(
            'projects-updated',
            secondCallback,
        );
        const projects = [{ name: 'Example' }];

        projectsListener?.(projects);

        expect(subscribeProjects).toHaveBeenCalledOnce();
        expect(firstCallback).toHaveBeenCalledWith(projects);
        expect(secondCallback).toHaveBeenCalledWith(projects);

        disposeFirst();
        projectsListener?.([{ name: 'Second' }]);
        disposeSecond();
        projectsListener?.([{ name: 'Third' }]);

        expect(firstCallback).toHaveBeenCalledOnce();
        expect(secondCallback).toHaveBeenCalledTimes(2);
        expect(unsubscribe).not.toHaveBeenCalled();
    });

    it('delegates native file paths to the preload transport', () => {
        const file = { name: 'project.godot' } as File;

        expect(getPathForFile(file)).toBe('/projects/example/project.godot');
        expect(getPath).toHaveBeenCalledWith(file);
    });
});
