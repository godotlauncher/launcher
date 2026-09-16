import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    checkTemplateCapacity,
    isSharedTemplateLink,
    readTemplateTree,
    templateConnectionStatus,
    templateFingerprint,
    templateLstat,
} from './template-files.util.js';
import {
    commitTemplateTransaction,
    discardTemplateMigration,
    type PreparedTemplateSet,
    recoverTemplateTransaction,
    restoreTemplateMigration,
    stageTemplateSets,
} from './template-transaction.util.js';

vi.mock('node:fs', () => ({
    constants: { COPYFILE_EXCL: 1 },
    promises: {
        mkdir: vi.fn(),
        copyFile: vi.fn(),
        chmod: vi.fn(),
        rename: vi.fn(),
        lstat: vi.fn(),
        readFile: vi.fn(),
        rm: vi.fn(),
        open: vi.fn(),
        realpath: vi.fn(),
        symlink: vi.fn(),
        unlink: vi.fn(),
        readdir: vi.fn(),
        rmdir: vi.fn(),
    },
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    checkTemplateCapacity: vi.fn(),
    templateLstat: vi.fn(),
    readTemplateTree: vi.fn(),
    isSharedTemplateLink: vi.fn(),
    templateConnectionStatus: vi.fn(),
}));
const root = path.resolve('shared');
const work = path.resolve('work');
const file = { relative: 'version.txt', hash: 'a', size: 10, mode: 0o644 };
let set: PreparedTemplateSet;
beforeEach(() => {
    vi.resetAllMocks();
    set = {
        id: '4.4.stable',
        source: path.resolve('source'),
        incoming: [file],
        before: [file],
        existed: true,
    };
    vi.mocked(templateLstat).mockResolvedValue({
        isDirectory: () => true,
    } as fs.Stats);
    vi.mocked(readTemplateTree).mockResolvedValue([file]);
    vi.mocked(fs.promises.realpath).mockImplementation(async (filename) =>
        String(filename),
    );
});

describe('template merge staging', () => {
    it('keeps identical sets for final validation without allocating or copying a replacement', async () => {
        const entries = await stageTemplateSets(root, work, [set], {});
        expect(entries).toEqual([
            {
                id: set.id,
                existed: true,
                before: templateFingerprint([file]),
                after: templateFingerprint([file]),
            },
        ]);
        expect(fs.promises.copyFile).not.toHaveBeenCalled();
        expect(fs.promises.mkdir).not.toHaveBeenCalled();
        expect(checkTemplateCapacity).not.toHaveBeenCalled();
    });

    it('stages selected removals and additions while retaining other installed files', async () => {
        const keep = { ...file, relative: 'macos.zip', hash: 'keep' };
        const remove = {
            ...file,
            relative: 'linux_debug.x86_64',
            hash: 'remove',
        };
        const add = { ...file, relative: 'linux_release.x86_64', hash: 'add' };
        set.before = [file, keep, remove];
        set.incoming = [add];
        set.removed = [remove.relative];
        const expected = [add, keep, file];
        vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
            directory === set.source
                ? set.incoming
                : directory === path.join(root, set.id)
                  ? set.before
                  : expected,
        );
        const entries = await stageTemplateSets(root, work, [set], {});
        expect(entries[0].after).toBe(templateFingerprint(expected));
        expect(fs.promises.copyFile).toHaveBeenCalledTimes(3);
        expect(fs.promises.copyFile).not.toHaveBeenCalledWith(
            path.join(root, set.id, remove.relative),
            expect.anything(),
            expect.anything(),
        );
    });
    it('removes the version directory when its last template is unchecked', async () => {
        const remove = { ...file, relative: 'macos.zip' };
        set.before = [file, remove];
        set.incoming = [];
        set.removed = [remove.relative];
        vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
            directory === set.source ? [] : set.before,
        );
        const entries = await stageTemplateSets(root, work, [set], {});
        expect(entries).toEqual([
            {
                id: set.id,
                existed: true,
                before: templateFingerprint(set.before),
                after: null,
            },
        ]);
        expect(fs.promises.copyFile).not.toHaveBeenCalled();
    });

    it('requires conflict choices even when keeping the shared set needs no replacement', async () => {
        set.incoming = [{ ...file, hash: 'b' }];
        vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
            directory === set.source ? set.incoming : set.before,
        );
        await expect(stageTemplateSets(root, work, [set], {})).rejects.toThrow(
            'decision',
        );
        const entries = await stageTemplateSets(root, work, [set], {
            [`${set.id}/${file.relative}`]: 'shared',
        });
        expect(entries[0].after).toBe(entries[0].before);
        expect(fs.promises.copyFile).not.toHaveBeenCalled();
    });

    it('requires an explicit migration choice before adding a local-only file', async () => {
        set.before = [];
        set.existed = false;
        vi.mocked(templateLstat).mockResolvedValue(undefined);
        vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
            directory === set.source ? set.incoming : [],
        );
        const key = `${set.id}/${file.relative}`;
        await expect(
            stageTemplateSets(root, work, [set], {}, undefined, new Set([key])),
        ).rejects.toThrow('decision');

        const omitted = await stageTemplateSets(
            root,
            work,
            [set],
            { [key]: 'shared' },
            undefined,
            new Set([key]),
        );
        expect(omitted).toEqual([
            {
                id: set.id,
                existed: false,
                before: templateFingerprint([]),
                after: templateFingerprint([]),
            },
        ]);
        expect(fs.promises.copyFile).not.toHaveBeenCalled();
    });

    it('requires an explicit migration choice for a permission-only difference', async () => {
        set.incoming = [{ ...file, mode: 0o755 }];
        const key = `${set.id}/${file.relative}`;
        vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
            directory === set.source ? set.incoming : set.before,
        );

        await expect(
            stageTemplateSets(root, work, [set], {}, undefined, new Set([key])),
        ).rejects.toThrow('decision');
    });

    it('validates an absent unchanged set without looking for staged files', async () => {
        const empty = templateFingerprint([]);
        let persisted = '';
        vi.mocked(templateLstat).mockResolvedValue(undefined);
        vi.mocked(readTemplateTree).mockResolvedValue([]);
        vi.mocked(fs.promises.open).mockResolvedValue({
            writeFile: vi.fn(async (contents: string) => {
                persisted = contents;
            }),
            sync: vi.fn(),
            close: vi.fn(),
        } as unknown as fs.promises.FileHandle);
        vi.mocked(fs.promises.lstat).mockResolvedValue({
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 100,
        } as fs.Stats);
        vi.mocked(fs.promises.readFile).mockImplementation(
            async () => persisted,
        );

        await commitTemplateTransaction(root, work, {
            version: 2,
            phase: 'committing',
            sets: [
                {
                    id: set.id,
                    existed: false,
                    before: empty,
                    after: empty,
                },
            ],
        });

        expect(fs.promises.rename).not.toHaveBeenCalledWith(
            path.join(work, 'new', set.id),
            path.join(root, set.id),
        );
    });

    it('rejects a newly appeared set after an absent use-shared review', async () => {
        const empty = templateFingerprint([]);
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === path.join(root, set.id)
                ? ({ isDirectory: () => true } as fs.Stats)
                : undefined,
        );

        await expect(
            commitTemplateTransaction(root, work, {
                version: 2,
                phase: 'committing',
                sets: [
                    {
                        id: set.id,
                        existed: false,
                        before: empty,
                        after: empty,
                    },
                ],
            }),
        ).rejects.toThrow('changed');
        expect(fs.promises.open).not.toHaveBeenCalled();
    });

    it('commits an unchanged set with permission-aware recovery metadata', async () => {
        const entries = await stageTemplateSets(root, work, [set], {});
        let persisted = '';
        const writeFile = vi.fn(async (contents: string) => {
            persisted = contents;
        });
        vi.mocked(fs.promises.open).mockResolvedValue({
            writeFile,
            sync: vi.fn(),
            close: vi.fn(),
        } as unknown as fs.promises.FileHandle);
        vi.mocked(fs.promises.lstat).mockResolvedValue({
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 100,
        } as fs.Stats);
        vi.mocked(fs.promises.readFile).mockImplementation(
            async () => persisted,
        );
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === path.join(root, set.id) ? ({} as fs.Stats) : undefined,
        );
        await commitTemplateTransaction(root, work, {
            version: 2,
            phase: 'committing',
            sets: entries,
        });
        expect(JSON.parse(persisted)).toMatchObject({
            version: 2,
            phase: 'complete',
            sets: entries,
        });
        expect(fs.promises.rename).toHaveBeenCalledTimes(2);
        expect(fs.promises.rename).toHaveBeenCalledWith(
            path.join(work, 'journal.next'),
            path.join(work, 'journal.json'),
        );
        expect(fs.promises.rm).toHaveBeenCalledWith(work, { recursive: true });
    });

    it.each([{ hash: 'external edit' }, { mode: 0o444 }])(
        'rejects external changes %o at the final commit boundary',
        async (change) => {
            const entries = await stageTemplateSets(root, work, [set], {});
            vi.mocked(readTemplateTree).mockResolvedValue([
                { ...file, ...change },
            ]);
            vi.mocked(templateLstat).mockImplementation(async (filename) =>
                filename === path.join(root, set.id)
                    ? ({} as fs.Stats)
                    : undefined,
            );
            await expect(
                commitTemplateTransaction(root, work, {
                    version: 2,
                    phase: 'committing',
                    sets: entries,
                }),
            ).rejects.toThrow('changed');
            expect(fs.promises.rename).not.toHaveBeenCalled();
        },
    );

    it.each(['source', 'shared'])(
        'rejects permission changes to the %s files after review',
        async (changed) => {
            vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
                (directory === set.source) === (changed === 'source')
                    ? [{ ...file, mode: 0o444 }]
                    : [file],
            );
            await expect(
                stageTemplateSets(root, work, [set], {}),
            ).rejects.toThrow('changed');
            expect(fs.promises.copyFile).not.toHaveBeenCalled();
        },
    );

    it('checks capacity for the merged output and preserves shared permissions on identical files', async () => {
        const added = {
            ...file,
            relative: 'linux_release.x86_64',
            hash: 'b',
            size: 20,
        };
        set.incoming = [{ ...file, mode: 0o777 }, added];
        vi.mocked(readTemplateTree).mockImplementation(async (directory) => {
            if (directory === set.source) return set.incoming;
            if (directory === path.join(root, set.id)) return set.before;
            return [added, file];
        });
        await stageTemplateSets(root, work, [set], {});
        expect(checkTemplateCapacity).toHaveBeenCalledWith(work, 30);
        expect(fs.promises.copyFile).toHaveBeenCalledTimes(2);
        expect(fs.promises.chmod).toHaveBeenCalledWith(
            path.join(work, 'new', set.id, file.relative),
            0o644,
        );
    });
});

describe('retained migration originals', () => {
    const local = path.resolve('project', 'editor_data', 'export_templates');
    const backup = `${local}.launcher-${path.basename(work)}`;
    const changed = { ...file, hash: 'changed' };
    let saved: string;
    const rememberSeparate = vi.fn();
    beforeEach(() => {
        rememberSeparate.mockReset();
        saved = JSON.stringify({
            version: 2,
            phase: 'complete',
            retainBackup: true,
            projectPath: path.resolve('project'),
            localPath: local,
            sourceHash: templateFingerprint([file]),
            backupBytes: 20,
            sets: [
                {
                    id: '4.4.stable',
                    existed: true,
                    before: templateFingerprint([file]),
                    after: templateFingerprint([changed]),
                },
            ],
        });
        vi.mocked(fs.promises.lstat).mockResolvedValue({
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 100,
        } as fs.Stats);
        vi.mocked(fs.promises.readFile).mockImplementation(async () => saved);
        vi.mocked(fs.promises.open).mockResolvedValue({
            writeFile: vi.fn(async (text: string) => {
                saved = text;
            }),
            sync: vi.fn(),
            close: vi.fn(),
        } as unknown as fs.promises.FileHandle);
        vi.mocked(isSharedTemplateLink).mockResolvedValue(true);
        vi.mocked(readTemplateTree).mockImplementation(async (name) =>
            name === path.join(root, '4.4.stable') ? [changed] : [file],
        );
    });
    it('keeps successful migration originals without rereading contents during recovery discovery', async () => {
        await recoverTemplateTransaction(root, work, local);
        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(readTemplateTree).not.toHaveBeenCalled();
    });
    it('restores project and shared originals after persisting a recoverable rollback', async () => {
        await restoreTemplateMigration(root, work, root, rememberSeparate);
        expect(rememberSeparate).toHaveBeenCalledOnce();
        expect(JSON.parse(saved)).toMatchObject({
            phase: 'committing',
            retainBackup: false,
        });
        expect(fs.promises.rename).toHaveBeenCalledWith(backup, local);
        expect(fs.promises.rename).toHaveBeenCalledWith(
            path.join(work, 'old', '4.4.stable'),
            path.join(root, '4.4.stable'),
        );
        expect(fs.promises.rm).toHaveBeenCalledWith(work, { recursive: true });
    });
    it('leaves subsequently added files in sets untouched by the migration', async () => {
        const journal = JSON.parse(saved);
        journal.sets.push({
            id: '4.5.stable',
            existed: false,
            before: templateFingerprint([]),
            after: templateFingerprint([]),
        });
        saved = JSON.stringify(journal);
        await restoreTemplateMigration(root, work, root, rememberSeparate);
        expect(fs.promises.rm).not.toHaveBeenCalledWith(
            path.join(root, '4.5.stable'),
            expect.anything(),
        );
        expect(
            JSON.parse(saved).sets.map((entry: { id: string }) => entry.id),
        ).toEqual(['4.4.stable']);
    });
    it('refuses changed shared contents before detaching the project or updating its preference', async () => {
        vi.mocked(readTemplateTree).mockImplementation(async (name) =>
            name === path.join(root, '4.4.stable')
                ? [{ ...file, hash: 'newer' }]
                : [file],
        );
        await expect(
            restoreTemplateMigration(root, work, root, rememberSeparate),
        ).rejects.toThrow('errors.changed');
        expect(rememberSeparate).not.toHaveBeenCalled();
        expect(fs.promises.rename).not.toHaveBeenCalled();
        expect(fs.promises.unlink).not.toHaveBeenCalled();
        expect(fs.promises.rm).not.toHaveBeenCalled();
    });
    it('refuses modified originals rather than destroying newer files', async () => {
        vi.mocked(readTemplateTree).mockResolvedValue([changed]);
        await expect(
            discardTemplateMigration(root, work, root),
        ).rejects.toThrow('errors.changed');
        expect(fs.promises.rm).not.toHaveBeenCalled();
    });
    it('explicit cleanup removes only backups, keeping current shared files', async () => {
        // Cleanup remains available after the project has been detached or restored.
        vi.mocked(isSharedTemplateLink).mockResolvedValue(false);
        await discardTemplateMigration(root, work, root);
        expect(fs.promises.rm).toHaveBeenCalledWith(backup, {
            recursive: true,
        });
        expect(fs.promises.rm).toHaveBeenCalledWith(work, { recursive: true });
        expect(fs.promises.rm).not.toHaveBeenCalledWith(
            path.join(root, '4.4.stable'),
            expect.anything(),
        );
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
});

describe('template journal recovery', () => {
    it('persists the canonical local location before moving the project folder', async () => {
        const local = path.resolve(
            'project',
            'editor_data',
            'export_templates',
        );
        const canonicalParent = path.resolve(
            'canonical-project',
            'editor_data',
        );
        const canonicalLocal = path.join(canonicalParent, 'export_templates');
        let persisted = '';
        vi.mocked(fs.promises.realpath).mockImplementation(async (filename) =>
            filename === path.dirname(local)
                ? canonicalParent
                : String(filename),
        );
        vi.mocked(fs.promises.open).mockResolvedValue({
            writeFile: vi.fn(async (contents: string) => {
                persisted = contents;
            }),
            sync: vi.fn(),
            close: vi.fn(),
        } as unknown as fs.promises.FileHandle);
        vi.mocked(fs.promises.lstat).mockResolvedValue({
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 100,
        } as fs.Stats);
        vi.mocked(fs.promises.readFile).mockImplementation(
            async () => persisted,
        );
        vi.mocked(templateLstat).mockResolvedValue(undefined);
        vi.mocked(templateConnectionStatus).mockResolvedValue('local');
        vi.mocked(isSharedTemplateLink).mockResolvedValue(true);
        vi.mocked(fs.promises.rename).mockImplementation(async (source) => {
            if (source === canonicalLocal) {
                expect(JSON.parse(persisted)).toMatchObject({
                    localPath: canonicalLocal,
                    phase: 'committing',
                });
            }
        });

        await commitTemplateTransaction(
            root,
            work,
            {
                version: 2,
                phase: 'committing',
                projectPath: path.resolve('project'),
                sourceHash: templateFingerprint([file]),
                sets: [],
            },
            local,
        );

        expect(fs.promises.rename).toHaveBeenCalledWith(
            canonicalLocal,
            `${canonicalLocal}.launcher-${path.basename(work)}`,
        );
        expect(JSON.parse(persisted)).toMatchObject({
            localPath: canonicalLocal,
            phase: 'complete',
        });
    });

    it.each(['committing', 'complete'] as const)(
        'uses the saved location for %s recovery after a custom editor detaches the link',
        async (phase) => {
            const local = path.resolve(
                'original-editor',
                'editor_data',
                'export_templates',
            );
            const backup = `${local}.launcher-${path.basename(work)}`;
            vi.mocked(fs.promises.lstat).mockResolvedValue({
                isFile: () => true,
                isSymbolicLink: () => false,
                size: 100,
            } as fs.Stats);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify({
                    version: 2,
                    phase,
                    projectPath: path.resolve('project'),
                    localPath: local,
                    sourceHash: templateFingerprint([file]),
                    sets: [
                        {
                            id: set.id,
                            existed: true,
                            before: templateFingerprint([file]),
                            after: templateFingerprint([file]),
                        },
                    ],
                }),
            );
            vi.mocked(templateLstat).mockImplementation(async (filename) =>
                filename === backup || filename === local
                    ? ({} as fs.Stats)
                    : undefined,
            );
            vi.mocked(isSharedTemplateLink).mockResolvedValue(false);
            vi.mocked(templateConnectionStatus).mockResolvedValue('local');
            vi.mocked(fs.promises.readdir).mockResolvedValue([]);

            await recoverTemplateTransaction(
                root,
                work,
                path.resolve('new-editor', 'editor_data', 'export_templates'),
            );

            if (phase === 'committing') {
                expect(fs.promises.rmdir).toHaveBeenCalledWith(local);
                expect(fs.promises.rename).toHaveBeenCalledWith(backup, local);
            } else {
                expect(fs.promises.rmdir).not.toHaveBeenCalled();
                expect(fs.promises.rm).toHaveBeenCalledWith(backup, {
                    recursive: true,
                });
            }
            expect(fs.promises.rm).toHaveBeenCalledWith(work, {
                recursive: true,
            });
        },
    );

    it.each(['committing', 'complete'] as const)(
        'preserves new custom-editor files during %s recovery',
        async (phase) => {
            const local = path.resolve(
                'project',
                'editor_data',
                'export_templates',
            );
            const backup = `${local}.launcher-${path.basename(work)}`;
            vi.mocked(fs.promises.lstat).mockResolvedValue({
                isFile: () => true,
                isSymbolicLink: () => false,
                size: 100,
            } as fs.Stats);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify({
                    version: 2,
                    phase,
                    projectPath: path.resolve('project'),
                    localPath: local,
                    sourceHash: templateFingerprint([file]),
                    sets: [],
                }),
            );
            vi.mocked(templateLstat).mockImplementation(async (filename) =>
                filename === backup || filename === local
                    ? ({} as fs.Stats)
                    : undefined,
            );
            vi.mocked(templateConnectionStatus).mockResolvedValue('local');
            vi.mocked(fs.promises.readdir).mockResolvedValue([
                'custom-template',
            ] as never);

            await expect(
                recoverTemplateTransaction(root, work),
            ).rejects.toThrow('changed');

            expect(fs.promises.rm).not.toHaveBeenCalled();
            expect(fs.promises.rmdir).not.toHaveBeenCalled();
            expect(fs.promises.rename).not.toHaveBeenCalled();
        },
    );

    it('preserves the detached project backup if committed shared files changed', async () => {
        const local = path.resolve(
            'project',
            'editor_data',
            'export_templates',
        );
        const backup = `${local}.launcher-${path.basename(work)}`;
        vi.mocked(fs.promises.lstat).mockResolvedValue({
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 100,
        } as fs.Stats);
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify({
                version: 2,
                phase: 'complete',
                projectPath: path.resolve('project'),
                localPath: local,
                sourceHash: templateFingerprint([file]),
                sets: [
                    {
                        id: set.id,
                        existed: true,
                        before: templateFingerprint([file]),
                        after: templateFingerprint([file]),
                    },
                ],
            }),
        );
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === backup || filename === local
                ? ({} as fs.Stats)
                : undefined,
        );
        vi.mocked(templateConnectionStatus).mockResolvedValue('local');
        vi.mocked(fs.promises.readdir).mockResolvedValue([]);
        vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
            directory === backup ? [file] : [{ ...file, hash: 'changed' }],
        );

        await expect(recoverTemplateTransaction(root, work)).rejects.toThrow(
            'changed',
        );

        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(fs.promises.rmdir).not.toHaveBeenCalled();
        expect(fs.promises.rename).not.toHaveBeenCalled();
    });

    it.each(['relative', 'wrong child', 'redirected parent', 'shared overlap'])(
        'preserves files when a saved recovery location has a %s',
        async (kind) => {
            const local =
                kind === 'relative'
                    ? path.join('editor_data', 'export_templates')
                    : kind === 'wrong child'
                      ? path.resolve('project', 'editor_data', 'settings')
                      : kind === 'shared overlap'
                        ? path.join(root, 'editor_data', 'export_templates')
                        : path.resolve(
                              'project',
                              'editor_data',
                              'export_templates',
                          );
            vi.mocked(fs.promises.lstat).mockResolvedValue({
                isFile: () => true,
                isSymbolicLink: () => false,
                size: 100,
            } as fs.Stats);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify({
                    version: 2,
                    phase: 'committing',
                    projectPath: path.resolve('project'),
                    localPath: local,
                    sourceHash: templateFingerprint([file]),
                    sets: [],
                }),
            );
            if (kind === 'redirected parent')
                vi.mocked(fs.promises.realpath).mockResolvedValue(
                    path.resolve('other', 'editor_data'),
                );

            await expect(
                recoverTemplateTransaction(root, work),
            ).rejects.toThrow();

            expect(fs.promises.rm).not.toHaveBeenCalled();
            expect(fs.promises.rename).not.toHaveBeenCalled();
            expect(fs.promises.unlink).not.toHaveBeenCalled();
        },
    );
    it.each([
        { version: undefined, mode: 0o644, changed: false },
        { version: undefined, mode: 0o444, changed: false },
        { version: 2 as const, mode: 0o644, changed: false },
        { version: 2 as const, mode: 0o444, changed: true },
    ])(
        'recovers version $version with mode $mode (changed: $changed)',
        async ({ version, mode, changed }) => {
            const backup = path.join(work, 'old', set.id);
            const target = path.join(root, set.id);
            // The unversioned digest is the original SHA-256 of content-only triples.
            const before =
                version === 2
                    ? templateFingerprint([file])
                    : '31b23ea5c81ab7a5278222d4ed2a0c78d38b4030d91662e9c871e84327486ce6';
            vi.mocked(fs.promises.lstat).mockResolvedValue({
                isFile: () => true,
                isSymbolicLink: () => false,
                size: 100,
            } as fs.Stats);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify({
                    version,
                    phase: 'committing',
                    sets: [{ id: set.id, existed: true, before, after: null }],
                }),
            );
            vi.mocked(templateLstat).mockImplementation(async (filename) =>
                filename === backup ? ({} as fs.Stats) : undefined,
            );
            vi.mocked(readTemplateTree).mockResolvedValue([{ ...file, mode }]);
            const result = recoverTemplateTransaction(root, work);
            if (changed) {
                await expect(result).rejects.toThrow('changed');
                expect(fs.promises.rename).not.toHaveBeenCalled();
                expect(fs.promises.rm).not.toHaveBeenCalled();
            } else {
                await expect(result).resolves.toBeUndefined();
                expect(fs.promises.rename).toHaveBeenCalledWith(backup, target);
                expect(fs.promises.rm).toHaveBeenCalledWith(work, {
                    recursive: true,
                });
            }
        },
    );

    it('preserves a newly installed target whose permissions changed before rollback', async () => {
        vi.mocked(fs.promises.lstat).mockResolvedValue({
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 100,
        } as fs.Stats);
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify({
                version: 2,
                phase: 'committing',
                sets: [
                    {
                        id: set.id,
                        existed: false,
                        before: templateFingerprint([]),
                        after: templateFingerprint([file]),
                    },
                ],
            }),
        );
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === path.join(root, set.id) ? ({} as fs.Stats) : undefined,
        );
        vi.mocked(readTemplateTree).mockResolvedValue([
            { ...file, mode: 0o444 },
        ]);
        await expect(recoverTemplateTransaction(root, work)).rejects.toThrow(
            'changed',
        );
        expect(fs.promises.rm).not.toHaveBeenCalled();
    });

    it('preserves a project backup whose permissions changed before cleanup', async () => {
        const local = path.resolve(
            'project',
            'editor_data',
            'export_templates',
        );
        vi.mocked(fs.promises.lstat).mockResolvedValue({
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 100,
        } as fs.Stats);
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify({
                version: 2,
                phase: 'complete',
                projectPath: path.resolve('project'),
                localPath: local,
                sourceHash: templateFingerprint([file]),
                sets: [],
            }),
        );
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === `${local}.launcher-${path.basename(work)}`
                ? ({} as fs.Stats)
                : undefined,
        );
        vi.mocked(readTemplateTree).mockResolvedValue([
            { ...file, mode: 0o444 },
        ]);
        await expect(
            recoverTemplateTransaction(root, work, local),
        ).rejects.toThrow('changed');
        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(fs.promises.rename).not.toHaveBeenCalled();
    });
});
