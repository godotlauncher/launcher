import { describe, expect, it } from 'vitest';
import {
    getProjectTagOptions,
    getSelectedProjectTags,
    hasProjectTagChanges,
    withProjectTagColour,
} from './project-tag.model';

const tags = [
    { id: 'jam', name: 'Game Jam', colour: 2 },
    { id: 'demo', name: 'Demo', colour: 4 },
];

describe('project tag draft', () => {
    it('searches without offering case-insensitive duplicate creation', () => {
        expect(getProjectTagOptions(tags, [], '  GAME JAM  ')).toEqual({
            matches: [tags[0]],
            createName: null,
        });
        expect(getProjectTagOptions(tags, [], 'gam')).toEqual({
            matches: [tags[0]],
            createName: 'gam',
        });
    });
    it('offers a trimmed creation but never a blank or selected name', () => {
        expect(getProjectTagOptions(tags, [], '  Prototype ')).toEqual({
            matches: [],
            createName: 'Prototype',
        });
        expect(getProjectTagOptions(tags, [], '  ').createName).toBeNull();
        expect(getProjectTagOptions(tags, [tags[0]], 'game jam')).toEqual({
            matches: [],
            createName: null,
        });
    });
    it('resolves an existing name created elsewhere and hides removed IDs', () => {
        expect(
            getSelectedProjectTags([{ name: 'DEMO' }, { id: 'removed' }], tags),
        ).toEqual([tags[1]]);
    });
    it('keeps provisional creations out of catalogue state', () => {
        const selected = getSelectedProjectTags([{ name: 'Prototype' }], tags);
        expect(selected[0].name).toBe('Prototype');
        expect(tags).toHaveLength(2);
        expect(hasProjectTagChanges([], [{ name: 'Prototype' }])).toBe(true);
    });
    it('treats removing and re-adding existing membership as unchanged', () => {
        expect(
            hasProjectTagChanges(
                ['jam', 'demo'],
                [{ id: 'demo' }, { id: 'jam' }],
            ),
        ).toBe(false);
        expect(hasProjectTagChanges(['jam'], [])).toBe(true);
    });
});

describe('project tag colour drafts', () => {
    it('previews existing and new colours without changing the catalogue', () => {
        expect(
            getSelectedProjectTags(
                [
                    { id: 'jam', colour: 0 },
                    { name: 'Prototype', colour: 8 },
                ],
                tags,
            ),
        ).toEqual([
            { ...tags[0], colour: 0 },
            { id: 'draft:prototype', name: 'Prototype', colour: 8 },
        ]);
        expect(tags[0].colour).toBe(2);
    });
    it('detects a colour-only change and accepts reverting it', () => {
        expect(
            hasProjectTagChanges(['jam'], [{ id: 'jam', colour: 0 }], tags),
        ).toBe(true);
        const restored = withProjectTagColour(
            { id: 'jam', colour: 0 },
            2,
            tags,
        );
        expect(restored).toEqual({ id: 'jam' });
        expect(hasProjectTagChanges(['jam'], [restored], tags)).toBe(false);
    });
    it('uses current catalogue colours for selections without overrides', () => {
        const recoloured = [{ ...tags[0], colour: 7 }, tags[1]];
        expect(
            getSelectedProjectTags([{ id: 'jam' }], recoloured)[0].colour,
        ).toBe(7);
        expect(hasProjectTagChanges(['jam'], [{ id: 'jam' }], recoloured)).toBe(
            false,
        );
    });
    it('preserves explicit colour zero for a provisional creation', () => {
        expect(withProjectTagColour({ name: 'Prototype' }, 0, tags)).toEqual({
            name: 'Prototype',
            colour: 0,
        });
    });
});
