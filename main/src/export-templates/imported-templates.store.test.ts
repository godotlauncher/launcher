import path from 'node:path';
import type {
    ImportedTemplateBuild,
    ImportedTemplateLibrary,
} from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentAppConfig } from '../config/current-app-config.js';
import {
    importedTemplateDefaultRoot,
    importedTemplateDirectoryName,
    importedTemplateFiles,
    importedTemplateRoot,
    resolveImportedTemplate,
} from './imported-templates.store.js';

vi.mock('../config/current-app-config.js', () => ({
    getCurrentAppConfig: vi.fn(),
}));
vi.mock('../json-store/atomic-json-file.adapter.js', () => ({
    AtomicJsonFileAdapter: class {},
}));
vi.mock('./template-storage.service.js', () => ({
    assertTemplateStorageAvailable: vi.fn(),
}));
vi.mock('./imported-templates.schema.js', () => ({
    importedTemplateIdentitySchema: { parse: (value: string) => value },
    importedTemplateLibrarySchema: { parse: (value: unknown) => value },
}));
const first: ImportedTemplateBuild = {
    id: 'encrypted',
    revision: 'one',
    directoryName: 'Encrypted',
    label: 'Encrypted',
    setId: '4.4.stable',
    importedAt: '',
    archiveName: '',
    files: ['web.zip'],
    sizeBytes: 1,
};
const second = { ...first, id: 'steam', label: 'Steam' };
const library: ImportedTemplateLibrary = {
    schemaVersion: 1,
    builds: [first, second],
};
describe('imported storage paths', () => {
    it('keeps a stable internal lookup path and a user-visible physical default', () => {
        vi.mocked(getCurrentAppConfig).mockReturnValue({
            paths: {
                configDir: path.resolve('fixture-config'),
                templateDir: path.resolve(
                    'fixture-home',
                    'Godot',
                    'ExportTemplates',
                ),
            },
        } as ReturnType<typeof getCurrentAppConfig>);

        expect(importedTemplateRoot()).toBe(
            path.resolve('fixture-config', 'export-templates'),
        );
        expect(importedTemplateDefaultRoot()).toBe(
            path.resolve('fixture-home', 'Godot', 'ExportTemplates'),
        );
    });
    it('keeps a readable folder independent of the build UUID and revision', () => {
        expect(importedTemplateFiles(first)).toBe(
            path.resolve(
                'fixture-config',
                'export-templates',
                'imported',
                '4.4.stable',
                'Encrypted',
            ),
        );
        expect(importedTemplateDirectoryName('CON')).toBe('_CON');
        expect(importedTemplateDirectoryName('a/b')).toBe('a-b');
        expect(importedTemplateDirectoryName('...')).toBe('template');
    });
});
describe('imported build resolution', () => {
    it('uses Official when no selection was saved', () =>
        expect(resolveImportedTemplate(library, '4.4.stable')).toBeUndefined());
    it('keeps an explicit Official selection even when imports exist', () =>
        expect(
            resolveImportedTemplate(library, '4.4.stable', 'official'),
        ).toBeUndefined());
    it('resolves the explicitly selected import', () =>
        expect(resolveImportedTemplate(library, '4.4.stable', second.id)).toBe(
            second,
        ));
    it('uses Official for a new editor version', () =>
        expect(resolveImportedTemplate(library, '4.3.stable')).toBeUndefined());
    it('does not fall back for a missing explicit build', () =>
        expect(() =>
            resolveImportedTemplate(library, '4.4.stable', 'missing'),
        ).toThrow('library.missing'));
    it('does not select an import from another edition', () =>
        expect(() =>
            resolveImportedTemplate(library, '4.4.stable.mono', first.id),
        ).toThrow('library.missing'));
});
