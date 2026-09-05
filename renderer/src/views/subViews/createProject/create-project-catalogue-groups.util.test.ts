import { describe, expect, it } from 'vitest';
import { groupCreateProjectCatalogueVariants } from './create-project-catalogue-groups.util';
import type { CreateProjectCatalogueVariant } from './createProject.model';

/**
 * Creates one minimal catalogue variant for group tests.
 *
 * @param version - Full catalogue version string.
 * @param key - Unique variant key.
 * @param mono - Whether the variant uses the .NET editor build.
 * @returns A catalogue variant retaining the given release version.
 */
function catalogueVariant(
    version: string,
    key: string,
    mono = false,
): CreateProjectCatalogueVariant {
    return {
        key,
        release: { version } as CreateProjectCatalogueVariant['release'],
        mono,
    };
}

describe('groupCreateProjectCatalogueVariants', () => {
    it('sorts major and minor groups numerically with 4.10 before 4.9', () => {
        const variants = [
            catalogueVariant('4.9.2-stable', '4.9'),
            catalogueVariant('4.10.1-stable', '4.10'),
            catalogueVariant('5.0-stable', '5.0'),
        ];

        expect(groupCreateProjectCatalogueVariants(variants)).toMatchObject([
            { key: '5.0' },
            { key: '4.10' },
            { key: '4.9' },
        ]);
    });

    it('groups patch, Standard, and .NET variants under their major and minor version', () => {
        const standard = catalogueVariant('4.5.2-stable', 'standard');
        const dotNet = catalogueVariant('4.5.1-stable', 'dotnet', true);
        const groups = groupCreateProjectCatalogueVariants([standard, dotNet]);

        expect(groups).toEqual([{ key: '4.5', variants: [standard, dotNet] }]);
    });

    it('groups rc, beta, and dev labels by their leading major and minor version', () => {
        const rc = catalogueVariant('4.6-rc1', 'rc');
        const beta = catalogueVariant('4.6-beta2', 'beta');
        const development = catalogueVariant('4.6-dev3', 'dev');

        expect(
            groupCreateProjectCatalogueVariants([rc, beta, development]),
        ).toEqual([{ key: '4.6', variants: [rc, beta, development] }]);
    });

    it('preserves input object references and order within each group', () => {
        const first = catalogueVariant('4.4.3-stable', 'first');
        const second = catalogueVariant('4.4.2-stable', 'second', true);
        const third = catalogueVariant('4.3-stable', 'third');
        const groups = groupCreateProjectCatalogueVariants([
            first,
            second,
            third,
        ]);

        expect(groups[0].variants).toEqual([first, second]);
        expect(groups[0].variants[0]).toBe(first);
        expect(groups[0].variants[1]).toBe(second);
        expect(groups[1].variants[0]).toBe(third);
    });

    it('does not create empty groups for already filtered inputs', () => {
        const matchingVariant = catalogueVariant('4.7-stable', 'matching');

        expect(groupCreateProjectCatalogueVariants([matchingVariant])).toEqual([
            { key: '4.7', variants: [matchingVariant] },
        ]);
    });

    it('keeps unknown version strings as stable fallback groups after numeric versions', () => {
        const numeric = catalogueVariant('4.8-stable', 'numeric');
        const firstUnknown = catalogueVariant('custom-build', 'custom');
        const secondUnknown = catalogueVariant('nightly', 'nightly');

        expect(
            groupCreateProjectCatalogueVariants([
                firstUnknown,
                numeric,
                secondUnknown,
            ]),
        ).toEqual([
            { key: '4.8', variants: [numeric] },
            { key: 'custom-build', variants: [firstUnknown] },
            { key: 'nightly', variants: [secondUnknown] },
        ]);
    });

    it('returns no groups for an empty input', () => {
        expect(groupCreateProjectCatalogueVariants([])).toEqual([]);
    });
});
