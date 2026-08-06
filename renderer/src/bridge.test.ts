import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    appBridge,
    codeEditorIntegrationBridge,
    getPathForFile,
    subscribeAppEvent,
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
    const unsubscribe = vi.fn();
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
            subscribeProjects: (listener) => {
                projectsListener = listener;
                return unsubscribe;
            },
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

    it('subscribes and unsubscribes from application events', () => {
        const callback = vi.fn();
        const dispose = subscribeAppEvent('projects-updated', callback);
        const projects = [{ name: 'Example' }];

        projectsListener?.(projects);
        dispose();

        expect(callback).toHaveBeenCalledWith(projects);
        expect(unsubscribe).toHaveBeenCalledOnce();
    });

    it('delegates native file paths to the preload transport', () => {
        const file = { name: 'project.godot' } as File;

        expect(getPathForFile(file)).toBe('/projects/example/project.godot');
        expect(getPath).toHaveBeenCalledWith(file);
    });
});
