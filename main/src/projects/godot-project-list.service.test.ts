import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    open: vi.fn(),
    stat: vi.fn(),
    realpath: vi.fn(),
    inspect: vi.fn(),
}));
vi.mock('node:fs', () => ({
    promises: { open: mocks.open, stat: mocks.stat, realpath: mocks.realpath },
}));
vi.mock('../config/current-app-config.js', () => ({
    getCurrentAppConfig: () => ({ e2eFixtures: false }),
}));
vi.mock('./project-import.service.js', () => ({
    ProjectImportService: class {},
}));

import { GodotProjectListService } from './godot-project-list.service.js';

const source = path.resolve('source', 'projects.cfg');
const service = new GodotProjectListService({
    inspectProjectImports: mocks.inspect,
} as never);

/** Supplies a read-only handle backed by one source fixture.
 * @param text - Source bytes exposed to the bounded reader.
 */
function supply(text: string) {
    const bytes = Buffer.from(text);
    let position = 0;
    const close = vi.fn();
    mocks.open.mockResolvedValue({
        stat: vi.fn().mockResolvedValue({ isFile: () => true }),
        read: vi.fn(async (buffer: Buffer, offset: number, length: number) => {
            const count = Math.min(length, bytes.length - position);
            bytes.copy(buffer, offset, position, position + count);
            position += count;
            return { bytesRead: count };
        }),
        close,
    });
    return close;
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.realpath.mockImplementation(async (value) => value);
    mocks.inspect.mockImplementation(async (files: string[]) =>
        files.map((projectFilePath) => ({
            projectFilePath,
            name: '',
            error: 'Unavailable',
        })),
    );
});

describe('GodotProjectListService.read', () => {
    it('inspects canonical paths once while retaining unavailable registrations and source-based fallback names', async () => {
        const original = path.resolve('games', 'Original');
        const alias = path.resolve('games', 'Alias');
        const missing = path.resolve('games', 'Missing');
        const close = supply(
            `[${original}]\nfavorite=true\n[${alias}]\nfavorite=false\n[${missing}]\nfavorite=false`,
        );
        mocks.realpath.mockImplementation(async (directory) => {
            if (directory === missing) throw new Error('missing');
            return original;
        });
        const result = await service.read(source, 'read-1');
        expect(result.status).toBe('complete');
        expect(mocks.inspect).toHaveBeenCalledWith([
            path.join(original, 'project.godot'),
            path.join(missing, 'project.godot'),
        ]);
        expect(result.inspections.map((row) => row.name)).toEqual([
            'Original',
            'Missing',
        ]);
        expect(close).toHaveBeenCalledOnce();
    });
    it('returns an explicit incomplete result at the existing inspection limit', async () => {
        supply(
            Array.from(
                { length: 101 },
                (_, i) =>
                    `[${path.resolve('games', `game-${i}`)}]\nfavorite=false`,
            ).join('\n'),
        );
        const result = await service.read(source, 'read-1');
        expect(result.status).toBe('limited');
        expect(result.projects).toHaveLength(100);
        expect(mocks.inspect.mock.calls[0][0]).toHaveLength(100);
    });
    it('rejects malformed or oversized source bytes before inspecting any project and closes the handle', async () => {
        for (const text of ['invalid source', 'x'.repeat(1_048_577)]) {
            const close = supply(text);
            expect((await service.read(source, 'read-1')).status).toBe(
                'failed',
            );
            expect(close).toHaveBeenCalledOnce();
        }
        expect(mocks.inspect).not.toHaveBeenCalled();
    });
    it('rejects relative source paths without filesystem reads', async () => {
        expect((await service.read('projects.cfg', 'read-1')).status).toBe(
            'failed',
        );
        expect(mocks.open).not.toHaveBeenCalled();
    });
    it('reports unavailable sources without hiding the failure as an empty success', async () => {
        mocks.open.mockRejectedValue(new Error('Permission denied'));
        expect(await service.read(source, 'read-1')).toMatchObject({
            status: 'failed',
            projects: [],
        });
        expect(mocks.inspect).not.toHaveBeenCalled();
    });
});
