import { describe, expect, it } from 'vitest';
import { parseReleaseName, sortReleases } from './release-sorting.util.js';

describe('Godot release ordering', () => {
    it.each([
        ['4.7-rc1', '4.6-stable'],
        ['4.10-dev1', '4.9-stable'],
        ['4.7.1-dev1', '4.7-stable'],
        ['2.0.0.1-stable', '2.0-stable'],
        ['4.7-stable', '4.7-rc10'],
        ['4.7-rc1', '4.7-beta20'],
        ['4.7-beta1', '4.7-alpha20'],
        ['4.7-alpha1', '4.7-dev20'],
        ['4.7-rc10', '4.7-rc2'],
    ])('orders %s ahead of %s', (newer, older) => {
        const first = { version: newer };
        const second = { version: older };
        expect(sortReleases(first, second)).toBeLessThan(0);
        expect(sortReleases(second, first)).toBeGreaterThan(0);
    });

    it('accepts prefixed and bare versions without inventing a patch', () => {
        expect(parseReleaseName(' V4.7-RC10 ')).toMatchObject({
            major: 4,
            minor: 7,
            patch: 0,
            revision: 0,
            type: 'rc',
            suffixNumber: 10,
        });
        expect(
            sortReleases({ version: '4.7' }, { version: '4.7.0-stable' }),
        ).toBe(0);
        expect(
            sortReleases({ version: 'v4.7-rc1' }, { version: '4.7-rc1' }),
        ).toBe(0);
    });

    it('keeps unrecognised custom names below known versions and equal to each other', () => {
        expect(
            sortReleases({ version: 'team-build' }, { version: '4.7-rc1' }),
        ).toBeGreaterThan(0);
        expect(
            sortReleases(
                { version: 'team-build' },
                { version: 'another-build' },
            ),
        ).toBe(0);
    });
});
