import { describe, expect, it } from 'vitest';
import {
    getProjectTagOptions,
    getSelectedProjectTags,
    hasProjectTagChanges,
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
