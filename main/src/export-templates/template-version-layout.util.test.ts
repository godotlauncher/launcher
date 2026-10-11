import * as fs from 'node:fs';
import path from 'node:path';
import type {
    ImportedTemplateBuild,
    ImportedTemplateLibrary,
} from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveImportedTemplate } from './imported-templates.store.js';
import { templateLstat } from './template-files.util.js';
import {
    managedTemplateVersionTarget,
    synchroniseTemplateVersionLayout,
} from './template-version-layout.util.js';
import { writeTemplateVersionLayout } from './template-version-migration.store.js';

vi.mock('./template-version-migration.store.js', () => ({
    writeTemplateVersionLayout: vi.fn(),
}));

vi.mock('node:fs', () => ({
    promises: {
        readdir: vi.fn(),
        readlink: vi.fn(),
        realpath: vi.fn(),
        mkdir: vi.fn(),
        unlink: vi.fn(),
        symlink: vi.fn(),
    },
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    templateLstat: vi.fn(),
}));
vi.mock('./imported-templates.store.js', () => ({
    importedTemplateRoot: () => path.resolve('imports'),
    importedTemplateFiles: (build: ImportedTemplateBuild) =>
        path.resolve('imports', 'imported', build.setId, build.directoryName),
    resolveImportedTemplate: vi.fn(),
}));
const editor = path.resolve('editor');
const root = path.join(editor, 'editor_data', 'export_templates');
const shared = path.resolve('shared');
const owned = '4.4.stable';
const deferred = '4.5.stable';
const transaction = '10000000-0000-4000-8000-000000000001';
const library: ImportedTemplateLibrary = { schemaVersion: 1, builds: [] };
const entries = new Map<string, 'directory' | 'link'>();
const links = new Map<string, string>();

beforeEach(() => {
    vi.resetAllMocks();
    entries.clear();
    links.clear();
    for (const directory of [
        editor,
        path.join(editor, 'editor_data'),
        root,
        shared,
        path.resolve('imports'),
    ])
        entries.set(directory, 'directory');
    entries.set(path.join(root, owned), 'link');
    entries.set(path.join(root, deferred), 'directory');
    entries.set(path.join(shared, owned), 'directory');
    links.set(path.join(root, owned), path.join(shared, owned));
    vi.mocked(templateLstat).mockImplementation(async (filename) => {
        const kind = entries.get(filename);
        return kind
            ? ({
                  isDirectory: () => kind === 'directory',
                  isSymbolicLink: () => kind === 'link',
              } as fs.Stats)
            : undefined;
    });
    vi.mocked(fs.promises.readdir).mockResolvedValue([
        owned,
        deferred,
    ] as never);
    vi.mocked(fs.promises.readlink).mockImplementation(
        async (filename) => links.get(String(filename)) as string,
    );
    vi.mocked(fs.promises.realpath).mockImplementation(async (filename) =>
        String(filename),
    );
});

describe('per-version connection ownership', () => {
    it('connects a newly selected absent version and records ownership first', async () => {
        const selected = '4.6.stable';
        const imported = {
            setId: selected,
            directoryName: 'saved',
        } as ImportedTemplateBuild;
        const destination = path.resolve(
            'imports',
            'imported',
            selected,
            'saved',
        );
        entries.set(destination, 'directory');
        vi.mocked(resolveImportedTemplate).mockImplementation((_library, id) =>
            id === selected ? imported : undefined,
        );
        await synchroniseTemplateVersionLayout(
            editor,
            shared,
            library,
            { [selected]: 'saved' },
            {
                version: 1,
                root: 'active',
                managed: { [owned]: transaction },
            },
        );
        expect(fs.promises.symlink).toHaveBeenCalledWith(
            destination,
            path.join(root, selected),
            process.platform === 'win32' ? 'junction' : 'dir',
        );
        expect(writeTemplateVersionLayout).toHaveBeenCalledWith(
            editor,
            expect.objectContaining({
                managed: expect.objectContaining({
                    [selected]: expect.any(String),
                }),
            }),
        );
        expect(
            vi.mocked(writeTemplateVersionLayout).mock.invocationCallOrder[0],
        ).toBeLessThan(
            vi.mocked(fs.promises.symlink).mock.invocationCallOrder[0],
        );
    });
    it('connects an absent current editor version to shared templates after migration', async () => {
        const current = '4.6.stable';
        await synchroniseTemplateVersionLayout(
            editor,
            shared,
            library,
            {},
            {
                version: 1,
                root: 'active',
                managed: { [owned]: transaction },
            },
            current,
        );
        expect(fs.promises.symlink).toHaveBeenCalledWith(
            path.join(shared, current),
            path.join(root, current),
            process.platform === 'win32' ? 'junction' : 'dir',
        );
    });
    it('keeps a deferred local folder even when its version is current or selected', async () => {
        await synchroniseTemplateVersionLayout(
            editor,
            shared,
            library,
            { [deferred]: 'official' },
            {
                version: 1,
                root: 'active',
                managed: { [owned]: transaction },
            },
            deferred,
        );
        expect(fs.promises.symlink).not.toHaveBeenCalled();
        expect(writeTemplateVersionLayout).not.toHaveBeenCalled();
    });
    it('leaves unrelated root links untouched without reading their targets', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            owned,
            deferred,
            'notes-link',
        ] as never);
        entries.set(path.join(root, 'notes-link'), 'link');
        links.set(path.join(root, 'notes-link'), path.resolve('user-notes'));
        await synchroniseTemplateVersionLayout(
            editor,
            shared,
            library,
            {},
            {
                version: 1,
                root: 'active',
                managed: { [owned]: transaction },
            },
        );
        expect(fs.promises.readlink).not.toHaveBeenCalledWith(
            path.join(root, 'notes-link'),
        );
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
    it('preserves an owned shared link and every real folder left for later', async () => {
        await synchroniseTemplateVersionLayout(
            editor,
            shared,
            library,
            {},
            {
                version: 1,
                root: 'active',
                managed: { [owned]: transaction },
            },
        );
        expect(fs.promises.unlink).not.toHaveBeenCalled();
        expect(fs.promises.symlink).not.toHaveBeenCalled();
        expect(entries.get(path.join(root, deferred))).toBe('directory');
    });
    it('refuses an unrecorded version link before changing any connections', async () => {
        entries.set(path.join(root, deferred), 'link');
        links.set(path.join(root, deferred), path.join(shared, deferred));
        await expect(
            synchroniseTemplateVersionLayout(
                editor,
                shared,
                library,
                {},
                {
                    version: 1,
                    root: 'active',
                    managed: { [owned]: transaction },
                },
            ),
        ).rejects.toThrow('errors.connection');
        expect(fs.promises.mkdir).not.toHaveBeenCalled();
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
    it('preflights all managed versions before replacing an earlier link', async () => {
        vi.mocked(resolveImportedTemplate).mockReturnValue({
            setId: owned,
            directoryName: 'saved',
        } as ImportedTemplateBuild);
        entries.set(
            path.resolve('imports', 'imported', owned, 'saved'),
            'directory',
        );
        await expect(
            synchroniseTemplateVersionLayout(
                editor,
                shared,
                library,
                {},
                {
                    version: 1,
                    root: 'active',
                    managed: { [owned]: transaction, [deferred]: transaction },
                },
            ),
        ).rejects.toThrow('library.unmanaged');
        expect(fs.promises.mkdir).not.toHaveBeenCalled();
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
    it('refuses a redirected shared version destination', async () => {
        entries.set(path.join(shared, owned), 'link');
        await expect(
            synchroniseTemplateVersionLayout(
                editor,
                shared,
                library,
                {},
                {
                    version: 1,
                    root: 'active',
                    managed: { [owned]: transaction },
                },
            ),
        ).rejects.toThrow('errors.unsafe');
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
    it('does not accept an imported path outside this version', async () => {
        links.set(
            path.join(root, owned),
            path.resolve('imports', 'imported', deferred, 'saved'),
        );
        expect(
            await managedTemplateVersionTarget(path.join(root, owned), shared),
        ).toBeUndefined();
        links.set(
            path.join(root, owned),
            path.resolve('imports', 'imported', `${owned}-other`, 'saved'),
        );
        expect(
            await managedTemplateVersionTarget(path.join(root, owned), shared),
        ).toBeUndefined();
    });
    it('accepts the physical root of a relocated imported library', async () => {
        const physical = path.resolve('physical-imports');
        links.set(
            path.join(root, owned),
            path.join(physical, 'imported', owned, 'saved'),
        );
        vi.mocked(fs.promises.realpath).mockImplementation(async (filename) =>
            filename === path.resolve('imports') ? physical : String(filename),
        );
        expect(
            await managedTemplateVersionTarget(path.join(root, owned), shared),
        ).toBe(path.join(physical, 'imported', owned, 'saved'));
    });
});
