import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AtomicJsonFileAdapter } from '../json-store/atomic-json-file.adapter.js';
import { JsonStoreConflictError } from '../json-store/json-store.types.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { ProjectsStore } from './projects.store.js';

describe('ProjectsStore', () => {
    let temporaryDirectory: string;
    let projectsPath: string;
    let store: ProjectsStore;

    beforeEach(async () => {
        temporaryDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'launcher-projects-store-'),
        );
        projectsPath = path.join(temporaryDirectory, 'projects.json');
        store = new ProjectsStore(
            new JsonStoreCoordinatorService(new AtomicJsonFileAdapter()),
            projectsPath,
        );
    });

    afterEach(async () => {
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
    });

    it('reads the existing project format and normalizes legacy fields', async () => {
        await fs.writeFile(
            projectsPath,
            JSON.stringify([
                {
                    ...createProject('/projects/legacy', null),
                    codeEditorId: undefined,
                    withVSCode: true,
                    pinned: true,
                    pinned_order: -1,
                },
            ]),
            'utf-8',
        );

        const [project] = await store.list();

        expect(project.codeEditorId).toBe('vscode');
        expect(project.last_opened).toBeNull();
        expect(project.pinned).toBe(true);
        expect(project.pinned_order).toBeUndefined();
    });

    it('preserves ascending last-opened order and Date values', async () => {
        await store.replace([
            createProject(
                '/projects/recent',
                new Date('2026-08-18T10:00:00.000Z'),
            ),
            createProject(
                '/projects/older',
                new Date('2026-08-17T10:00:00.000Z'),
            ),
        ]);

        const projects = await store.list();

        expect(projects.map((project) => project.path)).toEqual([
            '/projects/older',
            '/projects/recent',
        ]);
        expect(projects[0].last_opened).toBeInstanceOf(Date);
        expect(projects[1].last_opened).toBeInstanceOf(Date);
    });

    it('replaces duplicate paths and removes exact paths', async () => {
        await store.put(createProject('/projects/game', null));
        await store.put({
            ...createProject('/projects/game', null),
            name: 'Renamed Game',
        });

        expect(await store.list()).toMatchObject([
            { path: '/projects/game', name: 'Renamed Game' },
        ]);
        await expect(store.remove('/projects/game')).resolves.toEqual([]);
    });

    it('updates against the latest queued project list', async () => {
        await store.put(createProject('/projects/game', null));

        const projects = await store.update((current) =>
            current.map((project) => ({ ...project, pinned: true })),
        );

        expect(projects).toMatchObject([
            { path: '/projects/game', pinned: true },
        ]);
        await expect(store.list()).resolves.toMatchObject([
            { path: '/projects/game', pinned: true },
        ]);
    });

    it('rejects replacement from a stale snapshot', async () => {
        const snapshot = await store.snapshot();
        await store.put(createProject('/projects/new', null));

        await expect(
            store.replace(snapshot.projects, {
                expectedVersion: snapshot.version,
            }),
        ).rejects.toBeInstanceOf(JsonStoreConflictError);
    });

    it('recovers a malformed file as an empty list', async () => {
        await fs.writeFile(projectsPath, '{not json', 'utf-8');

        await expect(store.list()).resolves.toEqual([]);
    });
});

/**
 * Creates a complete project fixture.
 *
 * @param projectPath - Project directory path.
 * @param lastOpened - Last launch time.
 * @returns A project fixture accepted by the store.
 */
function createProject(
    projectPath: string,
    lastOpened: Date | null,
): ProjectDetails {
    return {
        name: path.basename(projectPath),
        version: '4.5-stable',
        version_number: 4.5,
        renderer: 'FORWARD_PLUS',
        path: projectPath,
        editor_settings_path: path.join(projectPath, '.godot'),
        editor_settings_file: path.join(
            projectPath,
            '.godot',
            'editor_settings-4.5.tres',
        ),
        last_opened: lastOpened,
        pinned: false,
        release: {
            version: '4.5-stable',
            version_number: 4.5,
            install_path: '/editors/4.5',
            editor_path: '/editors/4.5/godot',
            platform: 'linux',
            arch: 'x86_64',
            mono: false,
            prerelease: false,
            config_version: 5,
            published_at: '2026-01-01T00:00:00.000Z',
            valid: true,
        },
        launch_path: path.join(projectPath, '.godot', 'godot'),
        config_version: 5,
        codeEditorId: null,
        withGit: false,
        valid: true,
    };
}
