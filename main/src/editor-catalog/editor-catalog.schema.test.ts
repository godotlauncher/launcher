import { describe, expect, it } from 'vitest';
import {
    createEmptyEditorCatalog,
    normalizeEditorCatalog,
} from './editor-catalog.schema.js';

describe('editor catalog schema', () => {
    it('creates both official provider states', () => {
        expect(createEmptyEditorCatalog()).toEqual({
            schemaVersion: 1,
            providers: {
                'official-stable': {
                    lastFetchedAt: null,
                    lastPublishedAt: null,
                    releases: [],
                },
                'official-prerelease': {
                    lastFetchedAt: null,
                    lastPublishedAt: null,
                    releases: [],
                },
            },
        });
    });

    it('rejects an unsupported schema version', () => {
        expect(() =>
            normalizeEditorCatalog({
                ...createEmptyEditorCatalog(),
                schemaVersion: 2,
            }),
        ).toThrow();
    });
});
