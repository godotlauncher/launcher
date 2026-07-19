import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appBridge, getPathForFile, subscribeAppEvent } from './bridge.js';

type TestElectronApi = {
    getPathForFile: (file: File) => string;
    getPlatform: () => Promise<string>;
    subscribeProjects: (callback: (projects: unknown[]) => void) => () => void;
};

describe('renderer bridge', () => {
    const getPlatform = vi.fn(async () => 'win32');
    const getPath = vi.fn(() => '/projects/example/project.godot');
    const unsubscribe = vi.fn();
    let projectsListener: ((projects: unknown[]) => void) | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        projectsListener = undefined;

        const electron: TestElectronApi = {
            getPlatform,
            getPathForFile: getPath,
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
        expect(getPlatform).toHaveBeenCalledOnce();
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
