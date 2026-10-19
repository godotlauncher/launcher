import type { ProjectSectionKey } from '@shared/contracts';

export const DEFAULT_PROJECT_GROUP_ORDER: readonly ProjectSectionKey[] = [
    'pinned',
    'new',
    'recents',
];

/**
 * Checks that each supported project group appears exactly once.
 * @param value - Preference received from storage or the renderer.
 */
export function isProjectGroupOrder(
    value: unknown,
): value is ProjectSectionKey[] {
    return (
        Array.isArray(value) &&
        value.length === DEFAULT_PROJECT_GROUP_ORDER.length &&
        new Set(value).size === value.length &&
        value.every((key) => DEFAULT_PROJECT_GROUP_ORDER.includes(key))
    );
}

/**
 * Restores the default when an older or malformed preference is loaded.
 * @param value - Saved group order.
 */
export function normaliseProjectGroupOrder(
    value: unknown,
): ProjectSectionKey[] {
    return [
        ...(isProjectGroupOrder(value) ? value : DEFAULT_PROJECT_GROUP_ORDER),
    ];
}
