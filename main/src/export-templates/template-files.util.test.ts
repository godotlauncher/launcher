import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    areTemplateConnectionsActive,
    connectEmptyTemplateFolder,
    isTemplateIdentity,
    readTemplateTree,
    resolveTemplateRoot,
    safeTemplateSegment,
    sumTemplateFiles,
    templateFingerprint,
    templateLstat,
} from './template-files.util.js';

vi.mock('node:fs', () => ({
    createReadStream: vi.fn(),
    promises: {
        lstat: vi.fn(),
        readlink: vi.fn(),
        readdir: vi.fn(),
        mkdir: vi.fn(),
        rmdir: vi.fn(),
        symlink: vi.fn(),
    },
}));
const stat = (directory: boolean, link = false) =>
    ({ isDirectory: () => directory, isSymbolicLink: () => link }) as fs.Stats;

/** Creates a promise whose settlement is controlled by the test. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

beforeEach(() => {
    vi.resetAllMocks();
});
describe('Godot template storage', () => {
    it('resolves each platform without mixing settings and templates', () => {
        expect(
            resolveTemplateRoot('win32', 'C:\\Users\\Example', {
                APPDATA: 'C:\\Users\\Example\\AppData\\Roaming',
            }),
        ).toBe('C:\\Users\\Example\\AppData\\Roaming\\Godot\\export_templates');
        expect(resolveTemplateRoot('darwin', '/home/example', {})).toBe(
            '/home/example/Library/Application Support/Godot/export_templates',
        );
        expect(
            resolveTemplateRoot('linux', '/home/example', {
                XDG_DATA_HOME: '/data',
            }),
        ).toBe('/data/godot/export_templates');
        expect(
            resolveTemplateRoot('linux', '/home/example', {
                XDG_DATA_HOME: 'relative',
            }),
        ).toBe('/home/example/.local/share/godot/export_templates');
        expect(() => resolveTemplateRoot('win32', '', {})).toThrow('location');
    });
    it.each(['../escape', 'C:\\escape', 'CON', 'thing.', 'a/b', 'a:b', ''])(
        'rejects unsafe components: %s',
        (value) => {
            expect(safeTemplateSegment(value)).toBe(false);
        },
    );
    it('preserves the full template identity including edition and prerelease suffixes', () => {
        for (const id of [
            '4.0.stable',
            '4.4.1.stable.mono',
            '4.7.rc1',
            '4.5.dev.double',
        ])
            expect(isTemplateIdentity(id)).toBe(true);
        expect(isTemplateIdentity('4.4-stable')).toBe(false);
    });
    it('does not treat permission errors as a missing folder', async () => {
        vi.mocked(fs.promises.lstat).mockRejectedValue({ code: 'EACCES' });
        await expect(templateLstat('folder')).rejects.toMatchObject({
            code: 'EACCES',
        });
    });
    it('preserves a non-empty project folder', async () => {
        vi.mocked(fs.promises.lstat).mockResolvedValue(stat(true));
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        await connectEmptyTemplateFolder(
            path.resolve('project'),
            {},
            path.resolve('shared'),
        );
        expect(fs.promises.rmdir).not.toHaveBeenCalled();
        expect(fs.promises.symlink).not.toHaveBeenCalled();
    });
    it('preserves an existing foreign link', async () => {
        vi.mocked(fs.promises.lstat).mockResolvedValue(stat(false, true));
        vi.mocked(fs.promises.readlink).mockResolvedValue(
            path.resolve('other'),
        );
        await connectEmptyTemplateFolder(
            path.resolve('project'),
            {},
            path.resolve('shared'),
        );
        expect(fs.promises.symlink).not.toHaveBeenCalled();
        expect(fs.promises.rmdir).not.toHaveBeenCalled();
    });
    it('links only the template child when no local directory exists', async () => {
        vi.mocked(fs.promises.lstat).mockRejectedValue({ code: 'ENOENT' });
        const root = path.resolve('shared');
        const editor = path.resolve('project');
        await connectEmptyTemplateFolder(editor, {}, root);
        expect(fs.promises.symlink).toHaveBeenCalledWith(
            root,
            path.join(editor, 'editor_data', 'export_templates'),
            process.platform === 'win32' ? 'junction' : 'dir',
        );
    });
    it('tracks an automatic connection until its deferred filesystem work succeeds', async () => {
        const lstat = deferred<fs.Stats>();
        vi.mocked(fs.promises.lstat)
            .mockImplementationOnce(() => lstat.promise)
            .mockRejectedValue({ code: 'ENOENT' });

        const connecting = connectEmptyTemplateFolder(
            path.resolve('project'),
            {},
            path.resolve('shared'),
        );
        expect(areTemplateConnectionsActive()).toBe(true);

        lstat.resolve(stat(true));
        await connecting;

        expect(areTemplateConnectionsActive()).toBe(false);
    });
    it('clears the automatic connection count when linking fails', async () => {
        vi.mocked(fs.promises.lstat).mockRejectedValue({ code: 'ENOENT' });
        vi.mocked(fs.promises.symlink).mockRejectedValue(
            new Error('permission'),
        );

        await expect(
            connectEmptyTemplateFolder(
                path.resolve('project'),
                {},
                path.resolve('shared'),
            ),
        ).rejects.toThrow('permission');

        expect(areTemplateConnectionsActive()).toBe(false);
    });
    it('restores an empty local folder when link creation fails', async () => {
        vi.mocked(fs.promises.lstat)
            .mockResolvedValueOnce(stat(true))
            .mockResolvedValueOnce(stat(true))
            .mockResolvedValueOnce(stat(true))
            .mockRejectedValueOnce({ code: 'ENOENT' });
        vi.mocked(fs.promises.readdir).mockResolvedValue([]);
        vi.mocked(fs.promises.symlink).mockRejectedValue(
            new Error('permission'),
        );
        const editor = path.resolve('project');
        await expect(
            connectEmptyTemplateFolder(editor, {}, path.resolve('shared')),
        ).rejects.toThrow('permission');
        expect(fs.promises.mkdir).toHaveBeenLastCalledWith(
            path.join(editor, 'editor_data', 'export_templates'),
        );
    });
    it('does not connect a custom editor automatically', async () => {
        await connectEmptyTemplateFolder(
            path.resolve('project'),
            { source: 'custom' },
            path.resolve('shared'),
        );
        expect(fs.promises.lstat).not.toHaveBeenCalled();
    });
    it('preserves a linked editor_data parent', async () => {
        vi.mocked(fs.promises.lstat).mockResolvedValue(stat(false, true));
        await connectEmptyTemplateFolder(
            path.resolve('project'),
            {},
            path.resolve('shared'),
        );
        expect(fs.promises.mkdir).not.toHaveBeenCalled();
        expect(fs.promises.symlink).not.toHaveBeenCalled();
    });
    it('rejects permissions changed while hashing a file', async () => {
        const fileStat = {
            isSymbolicLink: () => false,
            isDirectory: () => false,
            isFile: () => true,
            size: 1,
            mtimeMs: 1,
            ino: 1,
            mode: 0o644,
        } as fs.Stats;
        vi.mocked(fs.promises.lstat)
            .mockResolvedValueOnce(stat(true))
            .mockResolvedValueOnce(fileStat)
            .mockResolvedValueOnce({ ...fileStat, mode: 0o444 } as fs.Stats);
        vi.mocked(fs.promises.readdir).mockResolvedValue(['template'] as never);
        vi.mocked(fs.createReadStream).mockReturnValue(
            Readable.from(['a']) as fs.ReadStream,
        );
        await expect(
            readTemplateTree(path.resolve('templates'), true),
        ).rejects.toThrow('changed');
    });

    it('fingerprints independently of traversal ordering and detects changed bytes and permissions', () => {
        const a = { relative: 'a.txt', size: 1, hash: 'a', mode: 0o644 };
        const b = { ...a, relative: 'a/b.txt' };
        expect(templateFingerprint([a, b])).toBe(templateFingerprint([b, a]));
        expect(templateFingerprint([a])).not.toBe(
            templateFingerprint([{ ...a, hash: 'b' }]),
        );
        expect(templateFingerprint([a])).not.toBe(
            templateFingerprint([{ ...a, mode: 0o444 }]),
        );
        expect(templateFingerprint([a], 1)).toBe(
            templateFingerprint([{ ...a, mode: 0o444 }], 1),
        );
    });
});

describe('template folder totals', () => {
    it('counts metadata and unrecognised regular files without following symlinks', async () => {
        const root = path.resolve('totals');
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '.DS_Store',
            'unknown.bin',
            'linked',
        ] as never);
        vi.mocked(fs.promises.lstat).mockImplementation(
            async (filename) =>
                ({
                    isDirectory: () => String(filename) === root,
                    isSymbolicLink: () =>
                        path.basename(String(filename)) === 'linked',
                    isFile: () => String(filename) !== root,
                    size:
                        path.basename(String(filename)) === '.DS_Store' ? 4 : 6,
                }) as fs.Stats,
        );
        expect(await sumTemplateFiles(root)).toEqual({
            bytes: 10,
            incomplete: false,
        });
    });
    it('marks totals incomplete when a folder cannot be read', async () => {
        vi.mocked(fs.promises.lstat).mockRejectedValue(
            Object.assign(new Error('Permission denied'), { code: 'EACCES' }),
        );
        expect(await sumTemplateFiles(path.resolve('totals'))).toEqual({
            bytes: 0,
            incomplete: true,
        });
    });
});

vi.mock('./template-paths.util.js', () => ({
    projectOfficialTemplateRoot: (editor: string) =>
        path.join(editor, 'editor_data', 'export_templates'),
}));
