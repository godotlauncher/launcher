import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    readTemplateTree,
    templateConnectionStatus,
    templateLstat,
} from './template-files.util.js';
import { readTemplateMigrationSource } from './template-migration-source.util.js';

vi.mock('./template-version-migration.store.js', () => ({
    readTemplateVersionLayout: vi.fn(),
    readTemplateVersionMigration: vi.fn(),
    templateVersionMigrationRecoveryId: vi.fn(),
}));
vi.mock('node:fs', () => ({
    promises: { readdir: vi.fn(), realpath: vi.fn() },
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    readTemplateTree: vi.fn(),
    templateConnectionStatus: vi.fn(),
    templateLstat: vi.fn(),
}));
vi.mock('./template-paths.util.js', () => ({
    projectOfficialTemplateRoot: (editor: string) =>
        path.join(editor, 'editor_data', 'export_templates'),
}));

const project = {
    path: path.resolve('project'),
    name: 'Forest',
    launch_path: path.resolve('editor', 'Godot'),
    release: { source: 'official', version: '4.7-stable', mono: true },
} as ProjectDetails;
const local = path.resolve('editor', 'editor_data', 'export_templates');
const root = path.resolve('shared');
const files = [
    {
        relative: '4.7.stable.mono/linux',
        size: 20,
        hash: '',
        mode: 0o755,
        metadata: { mtimeMs: 1, ctimeMs: 1, ino: 1, dev: 1 },
    },
];

/** Returns fictional source metadata without touching the filesystem.
 * @param filename - Fictional project, editor or template path.
 */
function sourceStat(filename: string): fs.Stats {
    return {
        isFile: () =>
            [
                project.launch_path,
                path.join(project.path, 'project.godot'),
            ].includes(filename),
        isDirectory: () => true,
        isSymbolicLink: () => false,
    } as fs.Stats;
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(templateConnectionStatus).mockResolvedValue('local');
    vi.mocked(templateLstat).mockImplementation(async (filename) =>
        sourceStat(filename),
    );
    vi.mocked(fs.promises.readdir).mockResolvedValue([
        '4.7.stable.mono',
        '.DS_Store',
    ] as never);
    vi.mocked(fs.promises.realpath).mockImplementation(async (filename) =>
        filename === root ? root : local,
    );
    vi.mocked(readTemplateTree).mockResolvedValue(files);
});

describe('read-only migration source', () => {
    it('reviews a macOS app bundle without treating it as a regular file', async () => {
        const launchPath = path.resolve('editor', 'Godot.app');
        expect(
            (
                await readTemplateMigrationSource(
                    { ...project, launch_path: launchPath },
                    root,
                )
            ).launchPath,
        ).toBe(launchPath);
    });
    it('reviews existing templates without requiring the editor to be present', async () => {
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === project.launch_path ? undefined : sourceStat(filename),
        );
        expect(
            (await readTemplateMigrationSource(project, root)).files,
        ).toEqual(files);
        expect(templateLstat).not.toHaveBeenCalledWith(project.launch_path);
    });
    it('reads file metadata without opening template contents', async () => {
        const result = await readTemplateMigrationSource(project, root);
        expect(result.files).toEqual(files);
        expect(readTemplateTree).toHaveBeenCalledExactlyOnceWith(
            local,
            false,
            undefined,
            true,
            new Set(),
            { includedRoots: new Set(['4.7.stable.mono']) },
        );
    });

    it('reports project progress while reading metadata', async () => {
        const report = vi.fn();
        const result = await readTemplateMigrationSource(project, root, report);
        expect(result.files).toEqual(files);
        expect(readTemplateTree).toHaveBeenCalledExactlyOnceWith(
            local,
            false,
            undefined,
            true,
            new Set(),
            { includedRoots: new Set(['4.7.stable.mono']) },
        );
        expect(report).toHaveBeenLastCalledWith({
            phase: 'checking',
            projectName: 'Forest',
            completedBytes: 0,
            totalBytes: 0,
        });
    });
    it('captures metadata, permissions, version entries and the editor edition', async () => {
        expect(await readTemplateMigrationSource(project, root)).toEqual({
            projectPath: project.path,
            name: project.name,
            launchPath: project.launch_path,
            setId: '4.7.stable.mono',
            mode: undefined,
            buildSelections: {},
            localRoot: local,
            localRealPath: local,
            sharedRoot: root,
            entries: ['4.7.stable.mono'],
            files,
        });
        expect(readTemplateTree).toHaveBeenCalledExactlyOnceWith(
            local,
            false,
            undefined,
            true,
            new Set(),
            {
                includedRoots: new Set(['4.7.stable.mono']),
            },
        );
    });

    it('does not require or create a missing shared root', async () => {
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === root ? undefined : sourceStat(filename),
        );
        expect(
            (await readTemplateMigrationSource(project, root)).sharedRoot,
        ).toBe(root);
        expect(fs.promises.realpath).not.toHaveBeenCalledWith(root);
    });

    it.each(['shared', 'foreign', 'missing', 'error'] as const)(
        'refuses a %s collection before reading its contents',
        async (status) => {
            vi.mocked(templateConnectionStatus).mockResolvedValue(status);
            await expect(
                readTemplateMigrationSource(project, root),
            ).rejects.toThrow('exportTemplates:errors.connection');
            expect(readTemplateTree).not.toHaveBeenCalled();
        },
    );

    it('refuses custom editors', async () => {
        await expect(
            readTemplateMigrationSource(
                {
                    ...project,
                    release: { ...project.release, source: 'custom' },
                },
                root,
            ),
        ).rejects.toThrow('exportTemplates:errors.connection');
        expect(readTemplateTree).not.toHaveBeenCalled();
    });

    it.each([
        path.dirname(project.launch_path),
        path.join(project.path, 'project.godot'),
    ])(
        'refuses an unavailable project or template environment (%s)',
        async (missing) => {
            vi.mocked(templateLstat).mockImplementation(async (filename) =>
                filename === missing ? undefined : sourceStat(filename),
            );
            await expect(
                readTemplateMigrationSource(project, root),
            ).rejects.toThrow('exportTemplates:errors.connection');
        },
    );

    it('ignores unrelated contents, including entries added while checking versions', async () => {
        vi.mocked(fs.promises.readdir)
            .mockResolvedValueOnce([
                '4.7.stable.mono',
                'notes.txt',
                'custom-folder',
            ] as never)
            .mockResolvedValueOnce([
                '4.7.stable.mono',
                'notes.txt',
                'custom-folder',
                'new-file',
            ] as never);
        const result = await readTemplateMigrationSource(project, root);
        expect(result.entries).toEqual(['4.7.stable.mono']);
        expect(templateLstat).not.toHaveBeenCalledWith(
            path.join(local, 'custom-folder'),
        );
        expect(templateLstat).not.toHaveBeenCalledWith(
            path.join(local, 'notes.txt'),
        );
        expect(readTemplateTree).toHaveBeenCalledWith(
            local,
            false,
            undefined,
            true,
            new Set(),
            {
                includedRoots: new Set(['4.7.stable.mono']),
            },
        );
    });

    it('ignores a regular file with a version-like name', async () => {
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === path.join(local, '4.7.stable.mono')
                ? ({
                      isFile: () => true,
                      isDirectory: () => false,
                      isSymbolicLink: () => false,
                  } as fs.Stats)
                : sourceStat(filename),
        );
        vi.mocked(readTemplateTree).mockResolvedValue([]);
        const result = await readTemplateMigrationSource(project, root);
        expect(result.entries).toEqual([]);
        expect(result.files).toEqual([]);
        expect(readTemplateTree).toHaveBeenCalledWith(
            local,
            false,
            undefined,
            true,
            new Set(),
            {
                includedRoots: new Set(),
            },
        );
    });

    it('refuses unowned version symlinks', async () => {
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === path.join(local, '4.7.stable.mono')
                ? ({
                      isDirectory: () => false,
                      isSymbolicLink: () => true,
                      isFile: () => false,
                  } as fs.Stats)
                : sourceStat(filename),
        );
        await expect(
            readTemplateMigrationSource(project, root),
        ).rejects.toThrow('exportTemplates:errors.unsafe');
    });

    it('refuses version discovery that changes during metadata checking', async () => {
        vi.mocked(fs.promises.readdir)
            .mockResolvedValueOnce(['4.7.stable.mono'] as never)
            .mockResolvedValueOnce(['4.7.stable.mono', '4.6.stable'] as never);
        await expect(
            readTemplateMigrationSource(project, root),
        ).rejects.toThrow('exportTemplates:errors.changed');
    });

    it('refuses a collection redirected during metadata checking', async () => {
        vi.mocked(templateConnectionStatus)
            .mockResolvedValueOnce('local')
            .mockResolvedValueOnce('foreign');
        await expect(
            readTemplateMigrationSource(project, root),
        ).rejects.toThrow('exportTemplates:errors.changed');
    });
    it('refuses a parent folder redirected during metadata checking', async () => {
        vi.mocked(fs.promises.realpath)
            .mockResolvedValueOnce(local)
            .mockResolvedValueOnce(path.resolve('redirected'));
        await expect(
            readTemplateMigrationSource(project, root),
        ).rejects.toThrow('exportTemplates:errors.changed');
    });

    it('propagates an unsafe nested tree instead of publishing a review', async () => {
        vi.mocked(readTemplateTree).mockRejectedValueOnce(
            new Error('exportTemplates:errors.unsafe'),
        );
        await expect(
            readTemplateMigrationSource(project, root),
        ).rejects.toThrow('exportTemplates:errors.unsafe');
    });
});
