import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectsStore } from '../projects/projects.store.js';
import { readImportedTemplates } from './imported-templates.store.js';
import {
    templateStorageJournalSchema,
    templateStorageSavedSchema,
} from './template-storage.schema.js';
import { TemplateStorageService } from './template-storage.service.js';

const files = vi.hoisted(() => ({
    lstat: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    readlink: vi.fn(),
    rm: vi.fn(),
    readdir: vi.fn(),
    open: vi.fn(),
    access: vi.fn(),
    statfs: vi.fn(),
    mkdir: vi.fn(),
    symlink: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn(),
    realpath: vi.fn(),
    chmod: vi.fn(),
}));

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('./template-storage.schema.js', () => ({
    templateStorageJournalSchema: { safeParse: vi.fn() },
    templateStorageSavedSchema: { safeParse: vi.fn() },
}));
vi.mock('node:fs', () => ({ promises: files, constants: { W_OK: 2 } }));
vi.mock('../config/current-app-config.js', () => ({
    getCurrentAppConfig: () => ({
        paths: {
            configDir: path.resolve('fixture-config'),
            templateDir: path.resolve(
                'fixture-home',
                'Godot',
                'ExportTemplates',
            ),
        },
    }),
}));
vi.mock('./template-runtime.util.js', () => ({
    getSharedTemplateRoot: () =>
        path.resolve('fixture-godot', 'export_templates'),
}));
vi.mock('./imported-templates.store.js', () => ({
    importedTemplateRoot: () =>
        path.resolve('fixture-config', 'export-templates'),
    importedTemplateDefaultRoot: () =>
        path.resolve('fixture-home', 'Godot', 'ExportTemplates'),
    readImportedTemplates: vi.fn(),
    importedTemplateFiles: (build: { setId: string; directoryName: string }) =>
        path.resolve(
            'fixture-config',
            'export-templates',
            'imported',
            build.setId,
            build.directoryName,
        ),
}));
vi.mock('./template-files.util.js', () => ({
    areTemplateConnectionsActive: () => false,
    areTemplatesMutating: () => false,
    reserveTemplateOperation: vi.fn(async () => () => undefined),
    setTemplatesMutating: vi.fn(),
    isTemplateIdentity: (value: string) =>
        /^\d+\.\d+\.[a-zA-Z][\w.-]*$/.test(value),
}));
vi.mock('./template-editor-running.util.js', () => ({
    assertTemplateEditorsClosed: vi.fn(),
}));

const config = path.resolve('fixture-config');
const state = path.join(config, 'template-storage.json');
const journal = path.join(config, 'template-storage-move.json');
const official = path.resolve('fixture-godot', 'export_templates');
const imported = path.resolve('fixture-config', 'export-templates');
const importedDefault = path.resolve(
    'fixture-home',
    'Godot',
    'ExportTemplates',
);
const destination = path.resolve('destination', 'templates');
let sourceContents: Buffer | undefined;

/** Makes a filesystem stat.
 * @param kind - Entry type.
 * @param size - File length.
 */
function entry(kind: 'file' | 'directory' | 'link', size = 0) {
    return {
        isFile: () => kind === 'file',
        isDirectory: () => kind === 'directory',
        isSymbolicLink: () => kind === 'link',
        size,
        mode: 0o100644,
    };
}

/** Makes a Node-style filesystem error.
 * @param code - Error code.
 */
function failure(code: string) {
    return Object.assign(new Error(code), { code });
}

/** Makes a service with no affected projects or pending work. */
function service() {
    return new TemplateStorageService(
        { list: async () => [] } as unknown as ProjectsStore,
        () => false,
        async () => [],
    );
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(templateStorageSavedSchema.safeParse).mockImplementation(
        (value) => ({ success: true, data: value }) as never,
    );
    vi.mocked(templateStorageJournalSchema.safeParse).mockImplementation(
        (value) =>
            ({
                success: true,
                data: {
                    restore: false,
                    projectLinks: [],
                    ...(value as object),
                },
            }) as never,
    );
    sourceContents = undefined;
    files.lstat.mockImplementation(async (filename: string) => {
        if (filename === official || filename === path.dirname(destination))
            return entry('directory');
        if (filename === path.join(official, 'version.txt') && sourceContents)
            return entry('file', sourceContents.length);
        throw failure('ENOENT');
    });
    files.stat.mockRejectedValue(failure('ENOENT'));
    files.readdir.mockImplementation(async (filename: string) =>
        filename === official && sourceContents ? ['version.txt'] : [],
    );
    files.realpath.mockImplementation(async (filename: string) => filename);
    files.access.mockResolvedValue(undefined);
    files.statfs.mockRejectedValue(failure('ENOSYS'));
    files.mkdir.mockResolvedValue(undefined);
    files.symlink.mockResolvedValue(undefined);
    files.rename.mockResolvedValue(undefined);
    files.rm.mockResolvedValue(undefined);
    files.open.mockImplementation(async (_filename: string, flags: string) => {
        if (flags === 'r' && sourceContents)
            return {
                read: async (
                    buffer: Buffer,
                    _offset: number,
                    _length: number,
                    position: number,
                ) => ({
                    bytesRead: sourceContents?.copy(buffer, 0, position) ?? 0,
                }),
                close: async () => undefined,
            };
        return {
            writeFile: async () => undefined,
            sync: async () => undefined,
            close: async () => undefined,
        };
    });
    vi.mocked(readImportedTemplates).mockResolvedValue({
        schemaVersion: 1,
        builds: [],
    });
});

describe('managed template storage', () => {
    it('reports an unavailable managed drive without treating it as empty', async () => {
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === state) return entry('file');
            if (filename === official) return entry('link');
            throw failure('ENOENT');
        });
        files.readFile.mockResolvedValue(
            JSON.stringify({ official: path.resolve('external-templates') }),
        );
        files.readlink.mockResolvedValue(path.resolve('external-templates'));

        const storage = service();
        expect(
            (await storage.getSettings()).locations.find(
                (item) => item.kind === 'official',
            ),
        ).toMatchObject({
            storagePath: path.resolve('external-templates'),
            status: 'unavailable',
        });
        await expect(storage.assertAvailable('official')).rejects.toThrow(
            'storage.errors.unavailable',
        );
    });

    it('refuses an unknown canonical link', async () => {
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === official) return entry('link');
            throw failure('ENOENT');
        });
        await expect(service().assertAvailable('official')).rejects.toThrow(
            'storage.errors.attention',
        );
    });

    it('reports a failed imported bootstrap as attention', async () => {
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === state) return entry('file');
            if (filename === official) return entry('directory');
            throw failure('ENOENT');
        });
        files.readFile.mockResolvedValue(
            JSON.stringify({ importedBootstrapIssue: true }),
        );
        const storage = service();
        expect(
            (await storage.getSettings()).locations.find(
                (item) => item.kind === 'imported',
            )?.status,
        ).toBe('attention');
        await expect(storage.assertAvailable('imported')).rejects.toThrow(
            'storage.errors.attention',
        );
    });

    it('surfaces a corrupt recovery record without changing files', async () => {
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === journal) return entry('file');
            if (filename === official) return entry('directory');
            throw failure('ENOENT');
        });
        files.readFile.mockResolvedValue('{not-json');
        const storage = service();
        expect((await storage.getSettings()).recoveryRequired).toBe(true);
        await expect(storage.recover()).rejects.toThrow();
        expect(files.rm).not.toHaveBeenCalled();
    });
});

describe('fresh imported storage', () => {
    it('creates the physical default and stable canonical link', async () => {
        await service().bootstrapImportedDefault();
        expect(files.mkdir).toHaveBeenCalledWith(importedDefault);
        expect(files.symlink).toHaveBeenCalledWith(
            importedDefault,
            imported,
            expect.any(String),
        );
        expect(files.rename).toHaveBeenCalledWith(
            expect.stringContaining('template-storage.json.'),
            state,
        );
    });

    it('preserves an occupied default and creates an empty canonical fallback', async () => {
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === importedDefault) return entry('directory');
            throw failure('ENOENT');
        });
        files.readdir.mockImplementation(async (filename: string) =>
            filename === importedDefault ? ['existing'] : [],
        );
        await service().bootstrapImportedDefault();
        expect(files.mkdir).toHaveBeenCalledWith(imported);
        expect(files.symlink).not.toHaveBeenCalled();
        expect(files.rm).not.toHaveBeenCalledWith(
            importedDefault,
            expect.anything(),
        );
    });

    it('falls back to the empty canonical library if the first link fails', async () => {
        files.symlink.mockRejectedValueOnce(failure('EPERM'));
        await service().bootstrapImportedDefault();
        expect(files.mkdir).toHaveBeenCalledWith(importedDefault);
        expect(files.mkdir).toHaveBeenCalledWith(imported);
        expect(files.rm).not.toHaveBeenCalledWith(
            importedDefault,
            expect.anything(),
        );
    });
});

describe('move reviews', () => {
    it('rejects a nested destination whose name starts with two dots', async () => {
        await expect(
            service().prepare('official', path.join(official, '..archive')),
        ).rejects.toThrow('storage.errors.destination');
        expect(files.mkdir).not.toHaveBeenCalled();
        expect(files.rename).not.toHaveBeenCalled();
    });

    it('allows an unrelated sibling destination whose name starts with two dots', async () => {
        const target = path.join(path.dirname(official), '..archive');
        const original = files.lstat.getMockImplementation();
        files.lstat.mockImplementation(async (filename: string) =>
            filename === path.dirname(target)
                ? entry('directory')
                : original?.(filename),
        );

        await expect(
            service().prepare('official', target),
        ).resolves.toMatchObject({
            source: official,
            destination: target,
        });
    });

    it('rejects a same-size source edit after issuing the review token', async () => {
        sourceContents = Buffer.from('abcd');
        const storage = service();
        const review = await storage.prepare('official', destination);
        expect(review.fileCount).toBe(1);

        sourceContents = Buffer.from('wxyz');
        await expect(storage.start(review.token)).rejects.toThrow(
            'storage.errors.changed',
        );
        expect(files.rm).not.toHaveBeenCalledWith(
            destination,
            expect.anything(),
        );
    });

    it('rejects another start while the first start is validating', async () => {
        sourceContents = Buffer.from('abcd');
        const storage = service();
        const firstReview = await storage.prepare('official', destination);
        const secondReview = await storage.prepare('official', destination);
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const original = files.lstat.getMockImplementation();
        let waitForJournal = true;
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === journal && waitForJournal) {
                waitForJournal = false;
                await gate;
            }
            return original?.(filename);
        });

        const first = storage.start(firstReview.token);
        await expect(storage.start(secondReview.token)).rejects.toThrow(
            'storage.errors.busy',
        );
        sourceContents = Buffer.from('wxyz');
        release();
        await expect(first).rejects.toThrow('storage.errors.changed');
    });

    it('reports insufficient space for Official sets without starting a move', async () => {
        sourceContents = Buffer.from('data');
        const original = files.lstat.getMockImplementation();
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === path.join(official, '4.4.stable'))
                return entry('directory');
            if (filename === path.join(official, '4.4.stable', 'web.zip'))
                return entry('file', 4);
            return original?.(filename);
        });
        files.readdir.mockImplementation(async (filename: string) =>
            filename === official
                ? ['4.4.stable']
                : filename === path.join(official, '4.4.stable')
                  ? ['web.zip']
                  : [],
        );
        files.statfs.mockResolvedValue({ bavail: 8 * 1024 * 1024, bsize: 1 });

        const storage = service();
        const review = await storage.prepare('official', destination);
        expect(review).toMatchObject({
            templateCount: 1,
            fileCount: 1,
            sizeBytes: 4,
            spaceSufficient: false,
        });
        await expect(storage.start(review.token)).rejects.toThrow(
            'storage.errors.destination',
        );
        expect(files.rm).not.toHaveBeenCalledWith(
            destination,
            expect.anything(),
        );
    });

    it('counts imported builds when available space is unknown', async () => {
        vi.mocked(readImportedTemplates).mockResolvedValue({
            schemaVersion: 1,
            builds: [{ id: 'one' }, { id: 'two' }],
        } as Awaited<ReturnType<typeof readImportedTemplates>>);
        const review = await service().prepare('imported', destination);
        expect(review).toMatchObject({
            templateCount: 2,
            fileCount: 0,
            sizeBytes: 0,
            availableBytes: null,
            spaceSufficient: null,
        });
    });
});

describe('interrupted move recovery', () => {
    const id = '00000000-0000-4000-8000-000000000003';

    /** Models a committed move whose old backup may have been partly removed.
     * @param names - Files that survive in the old backup.
     * @param changedMode - Whether a surviving file has different permissions.
     */
    function committedWithBackup(names: string[], changedMode = false) {
        const backup = `${official}.launcher-storage-${id}`;
        sourceContents = Buffer.from('x');
        const hash =
            '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881';
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === journal || filename === state)
                return entry('file');
            if (filename === official) return entry('link');
            if (filename === destination || filename === backup)
                return entry('directory');
            if (filename === path.join(destination, 'version.txt'))
                return entry('file', 1);
            if (names.some((name) => filename === path.join(backup, name)))
                return changedMode
                    ? { ...entry('file', 1), mode: 0o100600 }
                    : entry('file', 1);
            throw failure('ENOENT');
        });
        files.readFile.mockImplementation(async (filename: string) =>
            filename === state
                ? JSON.stringify({
                      official: destination,
                      managedRoots: [official],
                  })
                : JSON.stringify({
                      id,
                      kind: 'official',
                      source: official,
                      canonical: official,
                      destination,
                      backup,
                      destinationCreated: true,
                      restore: false,
                      entries: [
                          {
                              relative: 'version.txt',
                              type: 'file',
                              size: 1,
                              mode: 0o644,
                              hash,
                          },
                      ],
                      projectLinks: [],
                      phase: 'linked',
                  }),
        );
        files.readlink.mockResolvedValue(destination);
        files.readdir.mockImplementation(async (filename: string) =>
            filename === destination
                ? ['version.txt']
                : filename === backup
                  ? names
                  : [],
        );
        const open = files.open.getMockImplementation();
        files.open.mockImplementation(
            async (filename: string, flags: string) =>
                filename === config
                    ? {
                          sync: async () => undefined,
                          close: async () => undefined,
                      }
                    : open?.(filename, flags),
        );
        return backup;
    }

    it('finishes committed backup cleanup after an interrupted recursive removal', async () => {
        const backup = committedWithBackup([]);
        await service().recover();
        expect(files.rm).toHaveBeenCalledWith(backup, { recursive: true });
        expect(files.rm).toHaveBeenCalledWith(journal, { force: true });
    });

    it.each([
        ['added file', ['extra.txt'], false],
        ['changed file mode', ['version.txt'], true],
    ])(
        'preserves a committed backup with an %s',
        async (_case, names, changedMode) => {
            const backup = committedWithBackup(names, changedMode);
            await expect(service().recover()).rejects.toThrow(
                'storage.errors.recovery',
            );
            expect(files.rm).not.toHaveBeenCalledWith(backup, {
                recursive: true,
            });
            expect(files.rm).not.toHaveBeenCalledWith(journal, { force: true });
        },
    );

    it('finishes a restore after old external storage was partly removed', async () => {
        const source = path.resolve('external-templates');
        const restore = `${official}.launcher-restore-${id}`;
        const expected = ['4.4.stable', '4.5.stable'].map((relative) => ({
            relative,
            type: 'directory',
            size: 0,
            mode: 0o644,
        }));
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === journal || filename === state)
                return entry('file');
            if (
                filename === official ||
                filename === source ||
                expected.some(
                    (item) =>
                        filename === path.join(official, item.relative) ||
                        filename === path.join(source, item.relative),
                )
            )
                return entry('directory');
            throw failure('ENOENT');
        });
        files.readFile.mockImplementation(async (filename: string) =>
            filename === state
                ? JSON.stringify({ official: source })
                : JSON.stringify({
                      id,
                      kind: 'official',
                      source,
                      canonical: official,
                      destination: restore,
                      backup: `${official}.launcher-storage-${id}`,
                      destinationCreated: true,
                      restore: true,
                      entries: expected,
                      projectLinks: [],
                      phase: 'linked',
                  }),
        );
        files.readdir.mockImplementation(async (filename: string) =>
            filename === official
                ? expected.map((item) => item.relative)
                : filename === source
                  ? ['4.4.stable']
                  : [],
        );

        await service().recover();
        expect(files.rm).toHaveBeenCalledWith(source, { recursive: true });
        expect(files.rm).toHaveBeenCalledWith(journal, { force: true });
    });

    /** Makes an interrupted move record readable through the public recovery API.
     * @param names - Current destination entries.
     * @param expected - Entries owned by the interrupted move.
     * @param projectLinks - Saved project links to validate.
     */
    function interrupted(
        names: string[],
        expected: Array<{
            relative: string;
            type: 'directory';
            size: number;
            mode: number;
        }>,
        projectLinks: Array<{
            link: string;
            before: string;
            after: string;
        }> = [],
    ) {
        const original = files.lstat.getMockImplementation();
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === journal) return entry('file');
            if (filename === destination) return entry('directory');
            if (names.some((name) => filename === path.join(destination, name)))
                return entry('directory');
            return original?.(filename);
        });
        files.readdir.mockImplementation(async (filename: string) =>
            filename === destination ? names : [],
        );
        files.readFile.mockImplementation(async (filename: string) =>
            filename === journal
                ? JSON.stringify({
                      id,
                      kind: 'official',
                      source: official,
                      canonical: official,
                      destination,
                      backup: `${official}.launcher-storage-${id}`,
                      destinationCreated: false,
                      restore: false,
                      entries: expected,
                      projectLinks,
                      phase: 'copying',
                  })
                : '{}',
        );
    }

    it('leaves unrecognised user contents untouched and retains the journal', async () => {
        interrupted(['user-folder'], []);
        await expect(service().recover()).rejects.toThrow(
            'storage.errors.recovery',
        );
        expect(files.rm).not.toHaveBeenCalled();
    });

    it('rejects a forged project link before touching storage', async () => {
        interrupted(
            [],
            [],
            [
                {
                    link: path.resolve('outside', '4.4.stable'),
                    before: path.join(official, '4.4.stable'),
                    after: path.join(destination, '4.4.stable'),
                },
            ],
        );
        await expect(service().recover()).rejects.toThrow(
            'storage.errors.recovery',
        );
        expect(files.rm).not.toHaveBeenCalled();
    });

    it('preserves both stores when the canonical path is occupied by a foreign link', async () => {
        interrupted([], []);
        const original = files.lstat.getMockImplementation();
        files.lstat.mockImplementation(async (filename: string) =>
            filename === official ? entry('link') : original?.(filename),
        );
        files.readlink.mockResolvedValue(path.resolve('foreign-templates'));
        await expect(service().recover()).rejects.toThrow(
            'storage.errors.recovery',
        );
        expect(files.rm).not.toHaveBeenCalled();
    });

    it('keeps the old imported store when an active project link has changed', async () => {
        const source = path.resolve('old-imported-templates');
        const versionLink = path.resolve(
            'editor',
            'editor_data',
            'export_templates',
            '4.4.stable',
        );
        const relative = path.join('imported', '4.4.stable', 'Readable');
        const id = '00000000-0000-4000-8000-000000000004';
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === journal || filename === state)
                return entry('file');
            if (filename === imported || filename === versionLink)
                return entry('link');
            if (filename === destination || filename === source)
                return entry('directory');
            throw failure('ENOENT');
        });
        files.readFile.mockImplementation(async (filename: string) =>
            filename === state
                ? JSON.stringify({ imported: source })
                : JSON.stringify({
                      id,
                      kind: 'imported',
                      source,
                      canonical: imported,
                      destination,
                      backup: `${imported}.launcher-storage-${id}`,
                      destinationCreated: true,
                      restore: false,
                      entries: [],
                      projectLinks: [
                          {
                              link: versionLink,
                              before: path.join(source, relative),
                              after: path.join(destination, relative),
                          },
                      ],
                      phase: 'linked',
                  }),
        );
        files.readlink.mockImplementation(async (filename: string) =>
            filename === imported ? destination : path.resolve('foreign-build'),
        );
        files.readdir.mockResolvedValue([]);

        await expect(service().recover()).rejects.toThrow(
            'storage.errors.recovery',
        );
        expect(files.rm).not.toHaveBeenCalledWith(source, expect.anything());
        expect(files.unlink).not.toHaveBeenCalled();
    });

    it('removes only owned contents from a pre-existing destination', async () => {
        interrupted(
            ['staged'],
            [{ relative: 'staged', type: 'directory', size: 0, mode: 0o644 }],
        );
        await service().recover();
        expect(files.rm).toHaveBeenCalledWith(
            path.join(destination, 'staged'),
            { recursive: true },
        );
        expect(files.rm).not.toHaveBeenCalledWith(
            destination,
            expect.anything(),
        );
    });
});

describe('storage through linked parents', () => {
    const physicalParent = path.resolve('physical-godot');
    const physicalImported = path.join(physicalParent, 'ExportTemplates');
    const id = '00000000-0000-4000-8000-000000000005';

    /** Resolves only the default storage parent, leaving the final entry literal. */
    function aliasDefaultParent() {
        files.realpath.mockImplementation(async (filename: string) =>
            filename === path.dirname(importedDefault)
                ? physicalParent
                : filename,
        );
    }

    it.each(['copying', 'linked'] as const)(
        'recovers a %s move recorded with an aliased saved source',
        async (phase) => {
            aliasDefaultParent();
            files.lstat.mockImplementation(async (filename: string) => {
                if (filename === state || filename === journal)
                    return entry('file');
                if (filename === imported) return entry('link');
                if (filename === physicalImported || filename === destination)
                    return entry('directory');
                throw failure('ENOENT');
            });
            files.readFile.mockImplementation(async (filename: string) =>
                JSON.stringify(
                    filename === state
                        ? { imported: importedDefault }
                        : {
                              id,
                              kind: 'imported',
                              source: physicalImported,
                              canonical: imported,
                              destination,
                              backup: `${imported}.launcher-storage-${id}`,
                              destinationCreated: true,
                              entries: [],
                              phase,
                          },
                ),
            );
            files.readlink.mockResolvedValue(
                phase === 'copying' ? importedDefault : destination,
            );

            await service().recover();

            expect(files.rm).toHaveBeenCalledWith(journal, { force: true });
            expect(files.rm).toHaveBeenCalledWith(
                phase === 'copying' ? destination : physicalImported,
                { recursive: true },
            );
            expect(files.rm).not.toHaveBeenCalledWith(
                phase === 'copying' ? physicalImported : destination,
                { recursive: true },
            );
        },
    );

    it('recognises the same imported location through a physical link target', async () => {
        aliasDefaultParent();
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === state) return entry('file');
            if (filename === imported) return entry('link');
            if (filename === importedDefault) return entry('directory');
            throw failure('ENOENT');
        });
        files.readFile.mockResolvedValue(
            JSON.stringify({ imported: importedDefault }),
        );
        files.readlink.mockResolvedValue(physicalImported);
        files.stat.mockResolvedValue(entry('directory'));

        expect(
            (await service().getSettings()).locations.find(
                (item) => item.kind === 'imported',
            )?.status,
        ).toBe('healthy');
    });

    it('does not follow a foreign final link to bless it as managed storage', async () => {
        aliasDefaultParent();
        const foreign = path.resolve('foreign-link');
        const realpath = files.realpath.getMockImplementation();
        files.realpath.mockImplementation(async (filename: string) =>
            filename === foreign ? physicalImported : realpath?.(filename),
        );
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === state) return entry('file');
            if (filename === imported || filename === foreign)
                return entry('link');
            throw failure('ENOENT');
        });
        files.readFile.mockResolvedValue(
            JSON.stringify({ imported: importedDefault }),
        );
        files.readlink.mockResolvedValue(foreign);

        await expect(service().assertAvailable('imported')).rejects.toThrow(
            'storage.errors.attention',
        );
        expect(files.rm).not.toHaveBeenCalled();
        expect(files.realpath).not.toHaveBeenCalledWith(foreign);
    });

    it('still reports a missing drive when its parents cannot be resolved', async () => {
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === state) return entry('file');
            if (filename === imported) return entry('link');
            throw failure('ENOENT');
        });
        files.readFile.mockResolvedValue(
            JSON.stringify({ imported: physicalImported }),
        );
        files.readlink.mockResolvedValue(physicalImported);
        files.realpath.mockRejectedValue(failure('ENOENT'));

        expect(
            (await service().getSettings()).locations.find(
                (item) => item.kind === 'imported',
            )?.status,
        ).toBe('unavailable');
        expect(files.mkdir).not.toHaveBeenCalled();
    });

    it('recognises restoring Official storage through an aliased default parent', async () => {
        const physicalOfficial = path.join(
            physicalParent,
            path.basename(official),
        );
        const source = path.resolve('external-official');
        files.realpath.mockImplementation(async (filename: string) =>
            filename === path.dirname(official) ? physicalParent : filename,
        );
        files.lstat.mockImplementation(async (filename: string) => {
            if (filename === state) return entry('file');
            if (filename === official || filename === physicalOfficial)
                return entry('link');
            if (
                filename === source ||
                filename === physicalParent ||
                filename === path.dirname(official)
            )
                return entry('directory');
            throw failure('ENOENT');
        });
        files.readFile.mockResolvedValue(JSON.stringify({ official: source }));
        files.readlink.mockResolvedValue(source);
        files.stat.mockResolvedValue(entry('directory'));

        expect(await service().prepare('official', official)).toMatchObject({
            source,
            destination: physicalOfficial,
            fileCount: 0,
        });
        expect(files.unlink).not.toHaveBeenCalled();
    });
});
