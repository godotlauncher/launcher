import type { CreateProjectCatalogueVariant } from './create-project.model';

type CreateProjectCatalogueGroup = {
    key: string;
    variants: CreateProjectCatalogueVariant[];
};

type CreateProjectCatalogueGroupSortData = {
    major: number;
    minor: number;
};

/**
 * Extracts the leading major and minor version from a catalogue version.
 *
 * @param version - Full catalogue version string.
 * @returns Numeric major and minor values, or null when the version is unknown.
 */
function getMajorMinorVersion(
    version: string,
): CreateProjectCatalogueGroupSortData | null {
    const match = /^(\d+)\.(\d+)/.exec(version);
    if (!match) {
        return null;
    }

    return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
    };
}

/**
 * Groups catalogue variants by major and minor version for picker rendering.
 *
 * @param variants - Already filtered and ordered catalogue variants.
 * @returns Newest major/minor groups followed by unknown-version groups.
 */
export function groupCreateProjectCatalogueVariants(
    variants: readonly CreateProjectCatalogueVariant[],
): CreateProjectCatalogueGroup[] {
    const groups = new Map<string, CreateProjectCatalogueGroup>();
    const groupSortData = new Map<
        string,
        CreateProjectCatalogueGroupSortData | null
    >();

    for (const variant of variants) {
        const sortData = getMajorMinorVersion(variant.release.version);
        const key = sortData
            ? `${sortData.major}.${sortData.minor}`
            : variant.release.version;
        const group = groups.get(key);

        if (group) {
            group.variants.push(variant);
            continue;
        }

        groups.set(key, { key, variants: [variant] });
        groupSortData.set(key, sortData);
    }

    return [...groups.values()].sort((first, second) => {
        const firstSortData = groupSortData.get(first.key);
        const secondSortData = groupSortData.get(second.key);

        if (!firstSortData || !secondSortData) {
            return firstSortData ? -1 : secondSortData ? 1 : 0;
        }

        if (firstSortData.major !== secondSortData.major) {
            return secondSortData.major - firstSortData.major;
        }

        return secondSortData.minor - firstSortData.minor;
    });
}
