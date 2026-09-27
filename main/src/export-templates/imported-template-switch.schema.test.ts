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
});
