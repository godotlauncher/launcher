import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtomicJsonFileAdapter } from '../json-store/atomic-json-file.adapter.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { ProjectTagService } from './project-tag.service.js';
import { normaliseProjectTags, ProjectTagStore } from './project-tag.store.js';

vi.mock('../mainWindow.js', () => ({ getMainWindow: () => null }));
vi.mock('../utils.js', () => ({ ipcWebContentsSend: vi.fn() }));

describe('ProjectTagService', () => {
    let temporaryDirectory: string;
    let filePath: string;
    let store: ProjectTagStore;
    let service: ProjectTagService;
    const projectPath = path.resolve('projects', 'game', 'project.godot');
    const otherPath = path.resolve('projects', 'other', 'project.godot');
    const projects = { list: vi.fn() };

    beforeEach(async () => {
        temporaryDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'launcher-project-tags-'),
        );
        filePath = path.join(temporaryDirectory, 'project-tags.json');
        store = new ProjectTagStore(
            new JsonStoreCoordinatorService(new AtomicJsonFileAdapter()),
            filePath,
        );
        service = new ProjectTagService(store, projects as never);
        projects.list.mockResolvedValue([
            { path: projectPath },
            { path: otherPath },
        ] as ProjectDetails[]);
    });

    afterEach(async () => {
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
        projects.list.mockReset();
    });

    it('trims, reuses case-insensitive names, and deduplicates assignments', async () => {
        const first = await service.setProjectTags(projectPath, [
            { name: '  Art  ' },
            { name: 'art' },
        ]);
        expect(first.tags).toMatchObject([{ name: 'Art', colour: 0 }]);
        expect(first.assignments[projectPath]).toEqual([first.tags[0].id]);

        const second = await service.setProjectTags(otherPath, [
            { name: 'ART' },
            { id: first.tags[0].id },
        ]);
        expect(second.tags).toEqual(first.tags);
        expect(second.assignments[otherPath]).toEqual([first.tags[0].id]);
    });

    it('recolours an existing tag for every assigned project without changing IDs', async () => {
        const first = await service.setProjectTags(projectPath, [
            { name: 'Art' },
            { name: 'Music' },
        ]);
        await service.setProjectTags(otherPath, [{ id: first.tags[0].id }]);

        const changed = await service.setProjectTags(projectPath, [
            { id: first.tags[0].id, colour: 12 },
            { id: first.tags[1].id },
        ]);
        expect(changed.tags).toEqual([
            { ...first.tags[0], colour: 12 },
            first.tags[1],
        ]);
        expect(changed.assignments[projectPath]).toEqual(
            first.assignments[projectPath],
        );
        expect(changed.assignments[otherPath]).toEqual([first.tags[0].id]);
        expect(await store.snapshot()).toEqual(changed);
    });

    it('uses explicit preset colour zero for a new tag and preserves it when omitted', async () => {
        const created = await service.setProjectTags(projectPath, [
            { name: 'Art', colour: 0 },
            { name: 'Music', colour: 23 },
        ]);
        expect(created.tags.map((tag) => tag.colour)).toEqual([0, 23]);

        const recoloured = await service.setProjectTags(projectPath, [
            { name: 'ART', colour: 7 },
            { id: created.tags[1].id },
        ]);
        const unchanged = await service.setProjectTags(otherPath, [
            { name: 'art' },
        ]);
        expect(recoloured.tags.map((tag) => tag.colour)).toEqual([7, 23]);
        expect(unchanged.tags.map((tag) => tag.colour)).toEqual([7, 23]);
    });

    it.each([NaN, null, 1.5, -1, 30, '3', undefined])(
        'rejects invalid preset colour %s without writing',
        async (colour) => {
            await expect(
                service.setProjectTags(projectPath, [
                    { name: 'Art', colour } as never,
                ]),
            ).rejects.toMatchObject({ code: 'invalid-colour' });
            expect(await store.snapshot()).toEqual({
                tags: [],
                assignments: {},
            });
            await expect(fs.stat(filePath)).rejects.toMatchObject({
                code: 'ENOENT',
            });
        },
    );

    it('rolls back earlier creation and recolouring when a later item is malformed', async () => {
        const original = await service.setProjectTags(otherPath, [
            { name: 'Art' },
        ]);
        await expect(
            service.setProjectTags(projectPath, [
                { id: original.tags[0].id, colour: 18 },
                { name: 'Music', colour: 4 },
                { name: 'Broken', colour: 30 },
            ]),
        ).rejects.toMatchObject({ code: 'invalid-colour' });
        expect(await store.snapshot()).toEqual(original);
    });

    it('rejects extra selection fields and mixed IDs and names', async () => {
        await expect(
            service.setProjectTags(projectPath, [
                { name: 'Art', colour: 2, extra: true } as never,
            ]),
        ).rejects.toMatchObject({ code: 'invalid-selection' });
        await expect(
            service.setProjectTags(projectPath, [
                { id: 'x', name: 'Art' } as never,
            ]),
        ).rejects.toMatchObject({ code: 'invalid-selection' });
        expect(await store.snapshot()).toEqual({ tags: [], assignments: {} });
    });

    it('rejects invalid input without saving provisional tags or assignments', async () => {
        await expect(
            service.setProjectTags(projectPath, [
                { name: 'Art' },
                { id: 'missing' },
            ]),
        ).rejects.toMatchObject({ code: 'unknown-tag' });
        await expect(
            service.setProjectTags(projectPath, [{ name: ' ' }]),
        ).rejects.toMatchObject({ code: 'blank-name' });
        await expect(
            service.setProjectTags(otherPath, [{ id: '' }]),
        ).rejects.toMatchObject({ code: 'unknown-tag' });
        await expect(
            service.setProjectTags('not-registered', [{ name: 'Art' }]),
        ).rejects.toMatchObject({ code: 'invalid-project' });
        expect(await service.getSnapshot()).toEqual({
            tags: [],
            assignments: {},
        });
        await expect(fs.stat(filePath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    it('serialises concurrent saves and allocates preset colours', async () => {
        const [first, second] = await Promise.all([
            service.setProjectTags(projectPath, [{ name: 'Art' }]),
            service.setProjectTags(otherPath, [{ name: 'Music' }]),
        ]);
        const snapshot = await service.getSnapshot();
        expect(first.tags).toHaveLength(1);
        expect(second.tags).toHaveLength(2);
        expect(snapshot.tags.map((tag) => tag.colour)).toEqual([0, 1]);
        expect(snapshot.assignments[projectPath]).toHaveLength(1);
        expect(snapshot.assignments[otherPath]).toHaveLength(1);
    });

    it('cycles through exactly 30 preset colour IDs', async () => {
        const selection = Array.from({ length: 31 }, (_, index) => ({
            name: `Tag ${index}`,
        }));
        const snapshot = await service.setProjectTags(projectPath, selection);
        expect(snapshot.tags.map((tag) => tag.colour)).toEqual([
            ...Array.from({ length: 30 }, (_, index) => index),
            0,
        ]);
    });

    it('persists state and keeps unused tags when a project is removed', async () => {
        const original = await service.setProjectTags(projectPath, [
            { name: 'Art' },
        ]);
        await service.removeProjectAssignments(projectPath);
        const reopened = new ProjectTagStore(
            new JsonStoreCoordinatorService(new AtomicJsonFileAdapter()),
            filePath,
        );
        expect(await reopened.snapshot()).toEqual({
            tags: original.tags,
            assignments: {},
        });
    });

    it('retries orphan cleanup on reading without removing unused catalogue tags', async () => {
        const original = await service.setProjectTags(projectPath, [
            { name: 'Art' },
        ]);
        projects.list.mockResolvedValue([{ path: otherPath }]);
        expect(await service.getSnapshot()).toEqual({
            tags: original.tags,
            assignments: {},
        });
        expect(await store.snapshot()).toEqual({
            tags: original.tags,
            assignments: {},
        });
    });

    it('normalises malformed stored entries on reopening', async () => {
        await fs.writeFile(
            filePath,
            JSON.stringify({
                tags: [
                    { id: 'a', name: ' Art ', colour: 2 },
                    { id: 'b', name: 'art', colour: 4 },
                ],
                assignments: { [projectPath]: ['a', 'b', 'a'] },
            }),
        );
        const reopened = new ProjectTagStore(
            new JsonStoreCoordinatorService(new AtomicJsonFileAdapter()),
            filePath,
        );
        expect(await reopened.snapshot()).toEqual({
            tags: [{ id: 'a', name: 'Art', colour: 2 }],
            assignments: { [projectPath]: ['a'] },
        });
    });
});

describe('normaliseProjectTags', () => {
    it('drops malformed and duplicate stored entries without changing valid IDs', () => {
        expect(
            normaliseProjectTags({
                tags: [
                    { id: 'a', name: ' Art ', colour: 2 },
                    { id: 'b', name: 'art', colour: 3 },
                    { id: 'c', name: 'Music', colour: 30 },
                ],
                assignments: { project: ['a', 'a', 'b', 'missing'] },
            }),
        ).toEqual({
            tags: [{ id: 'a', name: 'Art', colour: 2 }],
            assignments: { project: ['a'] },
        });
    });
});
