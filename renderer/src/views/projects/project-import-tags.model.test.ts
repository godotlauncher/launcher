import type { ProjectTag, ProjectTagSelection } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import { getBulkTagMembership } from './project-bulk-tags.model';
import {
    changeImportTags,
    getImportTagSnapshot,
} from './project-import-tags.model';

const tags: ProjectTag[] = [{ id: 'shared', name: 'Shared', colour: 2 }];

describe('staged import bulk tags', () => {
    it('merges saved IDs and draft names into one mixed membership catalogue', () => {
        const selections = {
            first: [{ id: 'shared' }, { name: 'New tag', colour: 4 }],
            second: [{ name: 'SHARED' }],
            third: [],
        };
        const snapshot = getImportTagSnapshot(tags, selections);
        expect(snapshot.tags).toEqual([
            ...tags,
            { id: 'draft:new tag', name: 'New tag', colour: 4 },
        ]);
        expect(
            getBulkTagMembership(
                [{ path: 'first' }, { path: 'second' }, { path: 'third' }],
                snapshot,
                'shared',
            ),
        ).toEqual({ count: 2, total: 3, state: 'some' });
        expect(tags).toHaveLength(1);
    });
    it('adds to only captured rows, preserving unrelated tags and explicit colours', () => {
        const selections = {
            first: [{ id: 'shared', colour: 8 }],
            second: [{ name: 'Private' }],
            skipped: [{ name: 'Untouched' }],
        };
        const updates = changeImportTags(
            tags,
            selections,
            ['first', 'second', 'second'],
            { tag: { id: 'shared' }, add: true },
        );
        expect(updates).toEqual({
            first: selections.first,
            second: [{ name: 'Private' }, { id: 'shared' }],
        });
        expect(updates.first).toBe(selections.first);
        expect(selections.second).toEqual([{ name: 'Private' }]);
        expect(updates).not.toHaveProperty('skipped');
    });
    it('removes both named and ID selections without removing other tags', () => {
        const selections = {
            first: [{ id: 'shared' }, { name: 'Private' }],
            second: [{ name: 'SHARED' }],
        };
        expect(
            changeImportTags(tags, selections, ['first', 'second'], {
                tag: { id: 'shared' },
                add: false,
            }),
        ).toEqual({ first: [{ name: 'Private' }], second: [] });
    });
    it('converts temporary picker IDs back to draft names before registration', () => {
        const selections: Record<string, ProjectTagSelection[]> = {
            first: [{ name: 'Prototype', colour: 7 }],
            second: [],
        };
        const snapshot = getImportTagSnapshot(tags, selections);
        const draft = snapshot.tags.find((tag) => tag.name === 'Prototype');
        expect(
            changeImportTags(tags, selections, ['second'], {
                tag: { id: draft?.id ?? 'missing-draft' },
                add: true,
            }),
        ).toEqual({ second: [{ name: 'Prototype', colour: 7 }] });
    });
    it('stages a new bulk tag consistently and reuses case-insensitive choices', () => {
        const selections = { first: [{ name: 'Existing draft' }], second: [] };
        const updates = changeImportTags(
            tags,
            selections,
            ['first', 'second'],
            { tag: { name: '  Batch  ' }, add: true },
        );
        expect(updates.first).toEqual([
            { name: 'Existing draft' },
            { name: 'Batch', colour: 2 },
        ]);
        expect(updates.second).toEqual([{ name: 'Batch', colour: 2 }]);
        const repeated = changeImportTags(tags, updates, ['first', 'second'], {
            tag: { name: 'batch' },
            add: true,
        });
        expect(repeated.first).toBe(updates.first);
        expect(repeated.second).toBe(updates.second);
    });
    it('ignores unknown IDs, removed targets and an empty selection', () => {
        const selections = { first: [] };
        expect(
            changeImportTags(tags, selections, ['first'], {
                tag: { id: 'deleted' },
                add: true,
            }),
        ).toEqual({});
        expect(
            changeImportTags(tags, selections, ['removed'], {
                tag: { name: 'Batch' },
                add: true,
            }),
        ).toEqual({});
        expect(
            changeImportTags(tags, selections, [], {
                tag: { name: 'Batch' },
                add: true,
            }),
        ).toEqual({});
    });
});
