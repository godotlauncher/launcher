import * as fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    importedTemplateFiles,
    resolveImportedTemplate,
} from './imported-templates.store.js';
import { isSharedTemplateLink, templateLstat } from './template-files.util.js';
import { projectOfficialTemplateRoot } from './template-paths.util.js';
import {
    disconnectImportedTemplateView,
    projectTemplateBuilds,
} from './template-projection.util.js';

vi.mock('node:fs', () => ({
    promises: {
        mkdir: vi.fn(),
        readdir: vi.fn(),
        readlink: vi.fn(),
        realpath: vi.fn(),
        rename: vi.fn(),
        unlink: vi.fn(),
        rmdir: vi.fn(),
        symlink: vi.fn(),
    },
}));
vi.mock('./template-files.util.js', () => ({
    templateLstat: vi.fn(),
    isSharedTemplateLink: vi.fn(),
    isTemplateIdentity: (id: string) => /^4\.\d+\.stable(?:\.mono)?$/.test(id),
}));
vi.mock('./template-paths.util.js', () => ({
    projectOfficialTemplateRoot: vi.fn(),
    projectTemplateStorage: (editor: string) =>
        path.join(editor, 'editor_data', 'launcher_export_templates'),
}));
vi.mock('./imported-templates.store.js', () => ({
    importedTemplateRoot: () => path.resolve('imports'),
    resolveImportedTemplate: vi.fn(),
    importedTemplateFiles: vi.fn(),
}));
const editor = path.resolve('editor');
const shared = path.resolve('godot', 'export_templates');
const active = path.join(editor, 'editor_data', 'export_templates');
const next = path.join(
    editor,
    'editor_data',
    '.export_templates.launcher-next',
);
const previous = path.join(
    editor,
    'editor_data',
    '.export_templates.launcher-previous',
);
const target = path.resolve(
    'imports',
    'imported',
    'build',
    'revision',
    'files',
);
const library = { schemaVersion: 1 as const, builds: [] };
const directory = {
    isDirectory: () => true,
    isSymbolicLink: () => false,
} as fs.Stats;
const link = {
    isDirectory: () => false,
    isSymbolicLink: () => true,
} as fs.Stats;
const file = {
    isDirectory: () => false,
    isSymbolicLink: () => false,
} as fs.Stats;
const entries = new Map<string, fs.Stats>();
beforeEach(() => {
    vi.resetAllMocks();
    entries.clear();
    vi.mocked(projectOfficialTemplateRoot).mockReturnValue(active);
    vi.mocked(templateLstat).mockImplementation(async (name) =>
        entries.get(name),
    );
    vi.mocked(isSharedTemplateLink).mockImplementation(
        async (name) => entries.get(name) === link,
    );
    vi.mocked(fs.promises.readdir).mockResolvedValue([]);
    vi.mocked(fs.promises.readlink).mockResolvedValue(target);
    vi.mocked(fs.promises.realpath).mockResolvedValue(target);
    vi.mocked(importedTemplateFiles).mockReturnValue(target);
});
describe('project template layout', () => {
    it('connects Official to the entire existing Godot template root', async () => {
        await projectTemplateBuilds(editor, shared, library, {}, '4.4.stable');
        expect(fs.promises.symlink).toHaveBeenCalledWith(
            shared,
            next,
            expect.any(String),
        );
        expect(fs.promises.rename).toHaveBeenCalledWith(next, active);
        expect(fs.promises.symlink).not.toHaveBeenCalledWith(
            path.join(shared, '4.4.stable'),
            expect.anything(),
            expect.anything(),
        );
    });
    it('keeps an existing Official parent link unchanged', async () => {
        entries.set(active, link);
        await projectTemplateBuilds(editor, shared, library, {}, '4.4.stable');
        expect(fs.promises.rename).not.toHaveBeenCalled();
        expect(fs.promises.symlink).not.toHaveBeenCalled();
    });
    it('replaces the parent link with a local folder containing only the selected import', async () => {
        entries.set(active, link);
        entries.set(target, directory);
        vi.mocked(resolveImportedTemplate).mockReturnValue({
            id: 'build',
            setId: '4.4.stable',
        } as never);
        await projectTemplateBuilds(
            editor,
            shared,
            library,
            { '4.4.stable': 'build' },
            '4.4.stable',
        );
        expect(fs.promises.mkdir).toHaveBeenCalledWith(next);
        expect(fs.promises.symlink).toHaveBeenCalledWith(
            target,
            path.join(next, '4.4.stable'),
            expect.any(String),
        );
        expect(fs.promises.rename).toHaveBeenCalledWith(active, previous);
        expect(fs.promises.rename).toHaveBeenCalledWith(next, active);
    });
    it('links imported builds to physical storage and keeps that link on reconnection', async () => {
        const physicalRoot = path.resolve('moved-imports');
        const physicalTarget = path.join(
            physicalRoot,
            'imported',
            'build',
            'revision',
            'files',
        );
        const versionLink = path.join(active, '4.4.stable');
        entries.set(path.resolve('imports'), link);
        entries.set(target, directory);
        entries.set(active, directory);
        entries.set(versionLink, link);
        vi.mocked(fs.promises.realpath).mockImplementation(async (name) =>
            name === path.resolve('imports') ? physicalRoot : physicalTarget,
        );
        vi.mocked(fs.promises.readlink).mockImplementation(async (name) =>
            name === path.resolve('imports') ? physicalRoot : physicalTarget,
        );
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(resolveImportedTemplate).mockReturnValue({
            id: 'build',
            setId: '4.4.stable',
        } as never);
        await projectTemplateBuilds(
            editor,
            shared,
            library,
            { '4.4.stable': 'build' },
            '4.4.stable',
        );
        expect(fs.promises.rename).not.toHaveBeenCalled();
        expect(fs.promises.symlink).not.toHaveBeenCalled();
    });
    it('replaces a canonical imported project link with the physical location', async () => {
        const physicalRoot = path.resolve('moved-imports');
        const physicalTarget = path.join(
            physicalRoot,
            'imported',
            'build',
            'revision',
            'files',
        );
        const versionLink = path.join(active, '4.4.stable');
        entries.set(path.resolve('imports'), link);
        entries.set(target, directory);
        entries.set(active, directory);
        entries.set(versionLink, link);
        vi.mocked(fs.promises.realpath).mockImplementation(async (name) =>
            name === path.resolve('imports') ? physicalRoot : physicalTarget,
        );
        vi.mocked(fs.promises.readlink).mockImplementation(async (name) =>
            name === path.resolve('imports') ? physicalRoot : target,
        );
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(resolveImportedTemplate).mockReturnValue({
            id: 'build',
            setId: '4.4.stable',
        } as never);
        await projectTemplateBuilds(
            editor,
            shared,
            library,
            { '4.4.stable': 'build' },
            '4.4.stable',
        );
        expect(fs.promises.symlink).toHaveBeenCalledWith(
            physicalTarget,
            path.join(next, '4.4.stable'),
            expect.any(String),
        );
    });
    it('recognises physical links when a normal imported root has a realpath alias', async () => {
        const physicalRoot = path.resolve('physical-imports');
        const oldPhysical = path.join(
            physicalRoot,
            'imported',
            'old-build',
            'old-revision',
            'files',
        );
        const newPhysical = path.join(
            physicalRoot,
            'imported',
            '4.4.stable',
            'Readable',
        );
        const versionLink = path.join(active, '4.4.stable');
        entries.set(path.resolve('imports'), directory);
        entries.set(target, directory);
        entries.set(active, directory);
        entries.set(versionLink, link);
        vi.mocked(fs.promises.realpath).mockImplementation(async (name) =>
            name === path.resolve('imports') ? physicalRoot : newPhysical,
        );
        vi.mocked(fs.promises.readlink).mockResolvedValue(oldPhysical);
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(resolveImportedTemplate).mockReturnValue({
            id: 'build',
            setId: '4.4.stable',
        } as never);
        await projectTemplateBuilds(
            editor,
            shared,
            library,
            { '4.4.stable': 'build' },
            '4.4.stable',
        );
        expect(fs.promises.symlink).toHaveBeenCalledWith(
            newPhysical,
            path.join(next, '4.4.stable'),
            expect.any(String),
        );
    });
    it('restores Official while a previously selected imported drive is unavailable', async () => {
        const physicalRoot = path.resolve('missing-imports');
        const oldPhysical = path.join(
            physicalRoot,
            'imported',
            'old-build',
            'old-revision',
            'files',
        );
        const versionLink = path.join(active, '4.4.stable');
        entries.set(path.resolve('imports'), link);
        entries.set(active, directory);
        entries.set(versionLink, link);
        vi.mocked(fs.promises.readlink).mockImplementation(async (name) =>
            name === path.resolve('imports') ? physicalRoot : oldPhysical,
        );
        vi.mocked(fs.promises.realpath).mockRejectedValue(
            Object.assign(new Error('missing'), { code: 'ENOENT' }),
        );
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        await projectTemplateBuilds(
            editor,
            shared,
            library,
            { '4.4.stable': 'official' },
            '4.4.stable',
        );
        expect(fs.promises.symlink).toHaveBeenCalledWith(
            shared,
            next,
            expect.any(String),
        );
        expect(fs.promises.rename).toHaveBeenCalledWith(next, active);
    });
    it('uses only the new editor identity and leaves remembered choices untouched', async () => {
        const choices = { '4.4.stable': 'missing-import' };
        await projectTemplateBuilds(
            editor,
            shared,
            library,
            choices,
            '4.5.stable',
        );
        expect(resolveImportedTemplate).toHaveBeenCalledExactlyOnceWith(
            library,
            '4.5.stable',
            undefined,
        );
        expect(choices).toEqual({ '4.4.stable': 'missing-import' });
        expect(fs.promises.symlink).toHaveBeenCalledWith(
            shared,
            next,
            expect.any(String),
        );
    });
    it('refuses a missing import before changing any links', async () => {
        vi.mocked(resolveImportedTemplate).mockReturnValue({
            id: 'build',
            setId: '4.4.stable',
        } as never);
        await expect(
            projectTemplateBuilds(
                editor,
                shared,
                library,
                { '4.4.stable': 'build' },
                '4.4.stable',
            ),
        ).rejects.toThrow('library.missing');
        expect(fs.promises.rename).not.toHaveBeenCalled();
    });
    it('preserves real files added to a managed local folder', async () => {
        entries.set(active, directory);
        entries.set(path.join(active, '4.4.stable'), directory);
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        await expect(
            projectTemplateBuilds(editor, shared, library, {}, '4.4.stable'),
        ).rejects.toThrow('library.unmanaged');
        expect(fs.promises.unlink).not.toHaveBeenCalled();
        expect(fs.promises.rename).not.toHaveBeenCalled();
    });
    it('refuses a version link into Official storage', async () => {
        const versionLink = path.join(active, '4.4.stable');
        entries.set(active, directory);
        entries.set(versionLink, link);
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(fs.promises.readlink).mockResolvedValue(
            path.join(shared, '4.4.stable'),
        );

        await expect(
            projectTemplateBuilds(editor, shared, library, {}, '4.4.stable'),
        ).rejects.toThrow('library.unmanaged');
        expect(fs.promises.unlink).not.toHaveBeenCalled();
        expect(fs.promises.rename).not.toHaveBeenCalled();
    });
    it('restores the old parent if activating the replacement fails', async () => {
        entries.set(active, directory);
        vi.mocked(fs.promises.rename)
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('permission'))
            .mockResolvedValueOnce(undefined);
        await expect(
            projectTemplateBuilds(editor, shared, library, {}, '4.4.stable'),
        ).rejects.toThrow('permission');
        expect(fs.promises.rename).toHaveBeenLastCalledWith(previous, active);
    });
    it('restores an interrupted swap before trying the saved selection again', async () => {
        entries.set(previous, link);
        vi.mocked(fs.promises.rename).mockImplementation(async (from, to) => {
            if (from === previous && to === active) {
                entries.delete(previous);
                entries.set(active, link);
            }
        });
        await projectTemplateBuilds(editor, shared, library, {}, '4.4.stable');
        expect(fs.promises.rename).toHaveBeenCalledExactlyOnceWith(
            previous,
            active,
        );
    });
});

describe('disconnecting imported project templates', () => {
    const customOfficialRoot = path.join(editor, 'custom-editor');

    beforeEach(() => {
        vi.mocked(projectOfficialTemplateRoot).mockReturnValue(
            customOfficialRoot,
        );
    });

    it('removes a version link pointing into imported-template storage', async () => {
        const versionLink = path.join(active, '4.4.stable');
        entries.set(active, directory);
        entries.set(versionLink, link);
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(fs.promises.readlink).mockResolvedValue(target);

        await disconnectImportedTemplateView(editor);

        expect(fs.promises.unlink).toHaveBeenCalledExactlyOnceWith(versionLink);
    });

    it('removes a managed link when imported storage resolves to a moved root', async () => {
        const physicalRoot = path.resolve('moved-imports');
        const physicalTarget = path.join(
            physicalRoot,
            'imported',
            'build',
            'revision',
            'files',
        );
        const versionLink = path.join(active, '4.4.stable');
        entries.set(path.resolve('imports'), link);
        entries.set(active, directory);
        entries.set(versionLink, link);
        vi.mocked(fs.promises.realpath).mockImplementation(async (name) =>
            name === path.resolve('imports') ? physicalRoot : physicalTarget,
        );
        vi.mocked(fs.promises.readlink).mockImplementation(async (name) =>
            name === path.resolve('imports') ? physicalRoot : physicalTarget,
        );
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);

        await disconnectImportedTemplateView(editor);

        expect(fs.promises.unlink).toHaveBeenCalledExactlyOnceWith(versionLink);
    });

    it('preserves a foreign version-named symlink', async () => {
        const versionLink = path.join(active, '4.4.stable');
        entries.set(active, directory);
        entries.set(versionLink, link);
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(fs.promises.readlink).mockResolvedValue(
            path.resolve('foreign-template', '4.4.stable'),
        );

        await disconnectImportedTemplateView(editor);

        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('preserves real files and folders in the version-named entries', async () => {
        const realFolder = path.join(active, '4.4.stable');
        const realFile = path.join(active, '4.5.stable');
        entries.set(active, directory);
        entries.set(realFolder, directory);
        entries.set(realFile, file);
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
            '4.5.stable',
        ] as never);

        await disconnectImportedTemplateView(editor);

        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
});
