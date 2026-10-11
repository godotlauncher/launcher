import { describe, expect, it } from 'vitest';
import { switchJournalSchema } from './imported-template-switch.schema.js';

const rename = {
    version: 1,
    kind: 'rename',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    setId: '4.4.stable',
    beforeRevision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    afterRevision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    beforeDirectoryName: 'Old name',
    afterDirectoryName: 'New name',
};
const fingerprints = {
    beforeFingerprint: 'a'.repeat(64),
    afterFingerprint: 'b'.repeat(64),
};

describe('imported template switch journal', () => {
    it('accepts rename records without content fingerprints', () => {
        expect(switchJournalSchema.parse(rename)).toEqual(rename);
    });

    it('accepts legacy rename records and discards their unused fingerprints', () => {
        expect(
            switchJournalSchema.parse({ ...rename, ...fingerprints }),
        ).toEqual(rename);
    });

    it('continues to require both valid fingerprints for replacement recovery', () => {
        const replacement = { ...rename, kind: 'replace' };
        expect(switchJournalSchema.safeParse(replacement).success).toBe(false);
        expect(
            switchJournalSchema.safeParse({ ...replacement, ...fingerprints })
                .success,
        ).toBe(true);
        expect(
            switchJournalSchema.safeParse({
                ...replacement,
                ...fingerprints,
                afterFingerprint: '',
            }).success,
        ).toBe(false);
    });

    it('accepts folder-move recovery with complete metadata and no content hashes', () => {
        const snapshot = {
            directory: { ino: 1, dev: 1 },
            files: [
                {
                    relative: 'web.zip',
                    size: 10,
                    mode: 0o644,
                    metadata: { mtimeMs: 1, ctimeMs: 1, ino: 2, dev: 1 },
                },
            ],
        };
        const journal = {
            ...rename,
            version: 2,
            kind: 'replace',
            beforeSnapshot: snapshot,
            afterSnapshot: snapshot,
        };
        expect(switchJournalSchema.parse(journal)).toEqual(journal);
        // Node exposes large filesystem identifiers as ordinary numbers.
        expect(
            switchJournalSchema.safeParse({
                ...journal,
                afterSnapshot: {
                    ...snapshot,
                    directory: { ino: 2 ** 60, dev: 1 },
                },
            }).success,
        ).toBe(true);
        expect(
            switchJournalSchema.safeParse({
                ...journal,
                afterSnapshot: {
                    ...snapshot,
                    files: [{ relative: 'web.zip', size: 10, mode: 0o644 }],
                },
            }).success,
        ).toBe(false);
        expect(
            switchJournalSchema.safeParse({
                ...journal,
                afterSnapshot: {
                    ...snapshot,
                    files: [snapshot.files[0], snapshot.files[0]],
                },
            }).success,
        ).toBe(false);
    });
});
