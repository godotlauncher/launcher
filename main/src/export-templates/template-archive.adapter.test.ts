import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArchiveError } from '../archives/archive.error.js';
import type { ArchivesService } from '../archives/archives.service.js';
import type { ZipManifest } from '../archives/archives.types.js';
import {
    TemplateArchiveAdapter,
    validateTemplateLayout,
} from './template-archive.adapter.js';
import { readTemplateTree } from './template-files.util.js';

vi.mock('node:fs', () => ({ promises: { readFile: vi.fn() } }));
vi.mock('@mariodebono/di', () => ({ Injectable: () => () => undefined }));
vi.mock('../archives/archives.service.js', () => ({
    ArchivesService: class {},
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    readTemplateTree: vi.fn(),
}));
const manifest: ZipManifest = {
    uncompressedBytes: 30,
    entries: [
        { path: 'templates/version.txt', kind: 'file', sizeBytes: 10 },
        { path: 'templates/web_release.zip', kind: 'file', sizeBytes: 20 },
    ],
};
const extractCheckedZip = vi.fn<ArchivesService['extractCheckedZip']>();
const adapter = new TemplateArchiveAdapter({
    extractCheckedZip,
} as unknown as ArchivesService);
beforeEach(() => {
    vi.resetAllMocks();
    extractCheckedZip.mockImplementation(
        async (_archive, _destination, options) => {
            options.validateEntries(manifest);
            return manifest;
        },
    );
    vi.mocked(fs.promises.readFile).mockResolvedValue('4.4.stable\n');
    vi.mocked(readTemplateTree).mockResolvedValue([
        { relative: 'web_release.zip', size: 20, hash: '', mode: 0o644 },
    ]);
});

describe('Godot template package validation', () => {
    it('accepts root-level and nested packages without requiring a particular ZIP folder name', () => {
        expect(() => validateTemplateLayout(manifest)).not.toThrow();
        expect(() =>
            validateTemplateLayout({
                ...manifest,
                entries: manifest.entries.map((entry) => ({
                    ...entry,
                    path: path.posix.basename(entry.path),
                })),
            }),
        ).not.toThrow();
    });
    it('requires exactly one small version file', () => {
        for (const entries of [
            [],
            [...manifest.entries, manifest.entries[0]],
            [{ ...manifest.entries[0], sizeBytes: 1025 }],
        ]) {
            expect(() =>
                validateTemplateLayout({ ...manifest, entries }),
            ).toThrow('identity');
        }
    });
    it('rejects files outside the package while allowing macOS metadata', () => {
        expect(() =>
            validateTemplateLayout({
                ...manifest,
                entries: [
                    ...manifest.entries,
                    { path: 'outside', kind: 'file', sizeBytes: 1 },
                ],
            }),
        ).toThrow('unsafe');
        expect(() =>
            validateTemplateLayout({
                ...manifest,
                entries: [
                    ...manifest.entries,
                    { path: '__MACOSX', kind: 'directory', sizeBytes: 0 },
                    { path: '__MACOSX/metadata', kind: 'file', sizeBytes: 1 },
                ],
            }),
        ).not.toThrow();
    });
    it('delegates ZIP handling and cancellation, then resolves the Godot identity', async () => {
        const archive = path.resolve('package.tpz');
        const destination = path.resolve('extracted');
        const signal = new AbortController().signal;
        await expect(
            adapter.extract(archive, destination, signal),
        ).resolves.toEqual({
            identity: '4.4.stable',
            contents: path.join(destination, 'templates'),
        });
        expect(extractCheckedZip).toHaveBeenCalledWith(archive, destination, {
            signal,
            validateEntries: validateTemplateLayout,
        });
        expect(fs.promises.readFile).toHaveBeenCalledWith(
            path.join(destination, 'templates', 'version.txt'),
            'utf8',
        );
    });
    it.each([
        ['unsafe', 'unsafe'],
        ['space', 'space'],
        ['corrupt', 'archive'],
    ] as const)(
        'translates archive code %s to the template error %s',
        async (code, key) => {
            extractCheckedZip.mockRejectedValue(new ArchiveError(code));
            await expect(
                adapter.extract(
                    'archive',
                    'destination',
                    new AbortController().signal,
                ),
            ).rejects.toThrow(`exportTemplates:errors.${key}`);
        },
    );
    it('preserves cancellation instead of converting it into a package failure', async () => {
        const cancellation = new Error('cancelled');
        extractCheckedZip.mockRejectedValue(cancellation);
        await expect(
            adapter.extract(
                'archive',
                'destination',
                new AbortController().signal,
            ),
        ).rejects.toBe(cancellation);
    });
    it('rejects invalid Godot identities and packages with no template files', async () => {
        vi.mocked(fs.promises.readFile).mockResolvedValue('not a version');
        await expect(
            adapter.extract(
                'archive',
                'destination',
                new AbortController().signal,
            ),
        ).rejects.toThrow('identity');
        vi.mocked(fs.promises.readFile).mockResolvedValue('4.4.stable');
        vi.mocked(readTemplateTree).mockResolvedValue([]);
        await expect(
            adapter.extract(
                'archive',
                'destination',
                new AbortController().signal,
            ),
        ).rejects.toThrow('identity');
    });
});
