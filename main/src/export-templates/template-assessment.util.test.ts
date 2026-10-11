import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assessProjectTemplates } from './template-assessment.util.js';
import { compareTemplateTrees } from './template-comparison.util.js';
import { readTemplateVersionLayout } from './template-version-migration.store.js';

vi.mock('./template-comparison.util.js', () => ({
    compareTemplateTrees: vi.fn(),
}));

import {
    readTemplateTree,
    templateConnectionStatus,
    templateLstat,
} from './template-files.util.js';

vi.mock('./template-version-migration.store.js', () => ({
    readTemplateVersionLayout: vi.fn(),
    readTemplateVersionMigration: vi.fn(),
    templateVersionMigrationRecoveryId: vi.fn(),
}));
vi.mock('node:fs', () => ({
    promises: {
        readdir: vi.fn(),
        realpath: vi.fn(),
        mkdir: vi.fn(),
        rm: vi.fn(),
    },
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    readTemplateTree: vi.fn(),
    templateConnectionStatus: vi.fn(),
    templateLstat: vi.fn(),
}));
const root = path.resolve('shared');
const project = {
    path: path.resolve('project'),
    name: 'Game',
    launch_path: path.resolve('project', 'editor', 'Godot'),
    release: { source: 'official' },
} as ProjectDetails;
const directory = {
    isDirectory: () => true,
    isSymbolicLink: () => false,
    isFile: () => false,
} as fs.Stats;
const file = {
    isDirectory: () => false,
    isSymbolicLink: () => false,
    isFile: () => true,
} as fs.Stats;
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(templateConnectionStatus).mockResolvedValue('local');
    vi.mocked(templateLstat).mockImplementation(async (name) =>
        name === path.join(project.path, 'project.godot') ? file : directory,
    );
    vi.mocked(fs.promises.readdir).mockResolvedValue([] as never);
    vi.mocked(fs.promises.realpath).mockResolvedValue(root);
    vi.mocked(readTemplateTree).mockResolvedValue([]);
    vi.mocked(compareTemplateTrees).mockResolvedValue([]);
});

describe('project template assessment', () => {
    it('offers existing templates even when the editor is missing', async () => {
        vi.mocked(templateLstat).mockImplementation(async (name) =>
            name === project.launch_path
                ? undefined
                : name === path.join(project.path, 'project.godot')
                  ? file
                  : directory,
        );
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        expect(await assessProjectTemplates(project, root)).toMatchObject({
            state: 'needs-review',
            reason: 'unverified-files',
            pending: true,
            setIds: ['4.4.stable'],
        });
        expect(templateLstat).not.toHaveBeenCalledWith(project.launch_path);
        expect(fs.promises.mkdir).not.toHaveBeenCalled();
        expect(fs.promises.rm).not.toHaveBeenCalled();
    });
    it('offers populated templates beside a macOS app bundle for review', async () => {
        const macProject = {
            ...project,
            launch_path: path.resolve('project', 'editor', 'Godot.app'),
        };
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        expect(await assessProjectTemplates(macProject, root)).toMatchObject({
            state: 'needs-review',
            setIds: ['4.4.stable'],
        });
    });
    it('discovers an empty environment without hashes or mutations', async () => {
        expect(await assessProjectTemplates(project, root)).toMatchObject({
            state: 'ready',
            reason: 'empty',
            pending: true,
            compared: false,
        });
        expect(readTemplateTree).not.toHaveBeenCalled();
        expect(fs.promises.mkdir).not.toHaveBeenCalled();
        expect(fs.promises.rm).not.toHaveBeenCalled();
    });
    it.each([['.DS_Store'], ['Thumbs.db'], ['.DS_Store', 'Thumbs.db']])(
        'treats metadata-only entries %j as an empty template collection',
        async (...entries) => {
            vi.mocked(fs.promises.readdir).mockResolvedValue(entries as never);
            vi.mocked(templateLstat).mockImplementation(async (name) =>
                name === path.join(project.path, 'project.godot') ||
                entries.includes(path.basename(name))
                    ? file
                    : directory,
            );
            expect(await assessProjectTemplates(project, root)).toMatchObject({
                state: 'ready',
                reason: 'empty',
                pending: true,
                setIds: [],
                metadata: entries.toSorted(),
            });
            expect(readTemplateTree).not.toHaveBeenCalled();
            expect(fs.promises.rm).not.toHaveBeenCalled();
        },
    );
    it.each(['directory', 'link'])(
        'does not automatically connect a metadata name that is a %s',
        async (kind) => {
            vi.mocked(fs.promises.readdir).mockResolvedValue([
                '.DS_Store',
            ] as never);
            vi.mocked(templateLstat).mockImplementation(async (name) =>
                path.basename(name) === '.DS_Store'
                    ? ({
                          isFile: () => kind === 'link',
                          isSymbolicLink: () => kind === 'link',
                      } as fs.Stats)
                    : name === path.join(project.path, 'project.godot')
                      ? file
                      : directory,
            );
            expect(await assessProjectTemplates(project, root)).toMatchObject({
                state: 'needs-review',
                reason: 'metadata-present',
            });
        },
    );
    it('offers real templates alongside both recognised metadata files', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
            '.DS_Store',
            'Thumbs.db',
        ] as never);
        expect(await assessProjectTemplates(project, root)).toMatchObject({
            state: 'needs-review',
            setIds: ['4.4.stable'],
            metadata: ['.DS_Store', 'Thumbs.db'],
            unexpected: [],
        });
    });
    it('does not count a shared project as pending', async () => {
        vi.mocked(templateConnectionStatus).mockResolvedValue('shared');
        expect(await assessProjectTemplates(project, root)).toMatchObject({
            state: 'shared',
            pending: false,
        });
    });
    it('offers previously dedicated empty folders for migration', async () => {
        vi.mocked(templateConnectionStatus).mockResolvedValue('missing');
        expect(
            await assessProjectTemplates(
                { ...project, exportTemplateMode: 'separate' },
                root,
                true,
            ),
        ).toMatchObject({ state: 'ready', pending: true });
        expect(readTemplateTree).not.toHaveBeenCalled();
    });
    it('recognises a shared link despite a legacy dedicated preference', async () => {
        vi.mocked(templateConnectionStatus).mockResolvedValue('shared');
        expect(
            await assessProjectTemplates(
                { ...project, exportTemplateMode: 'separate' },
                root,
            ),
        ).toMatchObject({
            state: 'shared',
            reason: 'connected',
            pending: false,
        });
    });
    it('does not treat a custom editor as an automatic migration candidate', async () => {
        expect(
            await assessProjectTemplates(
                {
                    ...project,
                    release: { ...project.release, source: 'custom' },
                },
                root,
            ),
        ).toMatchObject({
            state: 'separate',
            reason: 'custom-editor',
            pending: false,
        });
    });
    it('leaves missing projects pending without creating their directories', async () => {
        vi.mocked(templateLstat).mockResolvedValue(undefined);
        expect(await assessProjectTemplates(project, root)).toMatchObject({
            state: 'unavailable',
            reason: 'missing-project',
            pending: true,
        });
        expect(fs.promises.mkdir).not.toHaveBeenCalled();
    });
    it('does not follow a foreign template link', async () => {
        vi.mocked(templateConnectionStatus).mockResolvedValue('foreign');
        expect(await assessProjectTemplates(project, root, true)).toMatchObject(
            { state: 'blocked', reason: 'foreign-link', pending: false },
        );
        expect(fs.promises.readdir).not.toHaveBeenCalled();
    });
    it('offers version folders without blocking on unrelated user content', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
            '.DS_Store',
            'Thumbs.db',
            '.custom-key-material',
        ] as never);
        expect(await assessProjectTemplates(project, root, true)).toMatchObject(
            {
                state: 'needs-review',
                reason: 'metadata-present',
                setIds: ['4.4.stable'],
                metadata: ['.DS_Store', 'Thumbs.db'],
                unexpected: ['.custom-key-material'],
            },
        );
        expect(readTemplateTree).not.toHaveBeenCalled();
    });
    it('recognises a completed layout with unrelated files and folders left in place', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            'notes.txt',
            'custom-folder',
        ] as never);
        vi.mocked(readTemplateVersionLayout).mockResolvedValue({
            version: 1,
            root: 'active',
            managed: {},
        });
        expect(await assessProjectTemplates(project, root)).toMatchObject({
            state: 'shared',
            reason: 'connected',
            pending: false,
            setIds: [],
            unexpected: ['custom-folder', 'notes.txt'],
        });
    });
    it('blocks a version folder redirected through an unowned link', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(templateLstat).mockImplementation(async (name) =>
            path.basename(name) === '4.4.stable'
                ? ({
                      isDirectory: () => false,
                      isFile: () => false,
                      isSymbolicLink: () => true,
                  } as fs.Stats)
                : name === path.join(project.path, 'project.godot')
                  ? file
                  : directory,
        );
        expect(await assessProjectTemplates(project, root)).toMatchObject({
            state: 'blocked',
            reason: 'unexpected-content',
        });
    });
    it('lists every version without reading template contents during discovery', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
            '4.5.stable.mono',
        ] as never);
        expect(await assessProjectTemplates(project, root)).toMatchObject({
            state: 'needs-review',
            reason: 'unverified-files',
            compared: false,
            setIds: ['4.4.stable', '4.5.stable.mono'],
        });
        expect(readTemplateTree).not.toHaveBeenCalled();
    });
    it('compares equal, different and one-sided files without claiming official provenance', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(compareTemplateTrees).mockResolvedValue([
            {
                path: 'different',
                state: 'different',
                localBytes: 5,
                sharedBytes: 5,
            },
            {
                path: 'equal',
                state: 'identical',
                localBytes: 5,
                sharedBytes: 5,
            },
            { path: 'local', state: 'local-only', localBytes: 7 },
            { path: 'shared', state: 'shared-only', sharedBytes: 8 },
        ]);
        const assessment = await assessProjectTemplates(project, root, true);
        expect(assessment).toMatchObject({
            state: 'needs-review',
            compared: true,
            provenance: 'unverified',
        });
        expect(
            assessment.files?.map(({ path, state }) => [path, state]),
        ).toEqual([
            ['4.4.stable/different', 'different'],
            ['4.4.stable/equal', 'identical'],
            ['4.4.stable/local', 'local-only'],
            ['4.4.stable/shared', 'shared-only'],
        ]);
    });
    it('offers identical files for deduplication without classifying them as official', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(compareTemplateTrees).mockResolvedValue([
            {
                path: 'custom',
                state: 'identical',
                localBytes: 5,
                sharedBytes: 5,
            },
        ]);
        expect(await assessProjectTemplates(project, root, true)).toMatchObject(
            {
                state: 'ready',
                reason: 'identical',
                provenance: 'unverified',
                compared: true,
            },
        );
    });
    it('does not report a partially failed comparison as complete', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(compareTemplateTrees).mockRejectedValue(
            new Error('changed during read'),
        );
        expect(await assessProjectTemplates(project, root, true)).toMatchObject(
            { state: 'unavailable', reason: 'unreadable', compared: false },
        );
    });
});

vi.mock('./template-paths.util.js', () => ({
    projectOfficialTemplateRoot: (editor: string) =>
        path.join(editor, 'editor_data', 'export_templates'),
}));
