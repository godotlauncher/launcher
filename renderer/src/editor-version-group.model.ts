export type EditorVersionItem = {
    version: string;
    base_version?: string;
};

export type EditorVersionGroup<T extends EditorVersionItem> = {
    baseVersion: string | null;
    items: T[];
};

/**
 * Gets the major and minor version used to group an editor.
 *
 * @param item - The editor to read.
 * @returns The major and minor version, or null when it cannot be read.
 */
export function getEditorBaseVersion(item: EditorVersionItem): string | null {
    const declaredBaseVersion = item.base_version?.trim();
    if (declaredBaseVersion && /^\d+\.\d+$/.test(declaredBaseVersion)) {
        return declaredBaseVersion;
    }

    const match = item.version.match(/^v?(\d+)\.(\d+)/i);
    return match ? `${match[1]}.${match[2]}` : null;
}

/**
 * Groups editors by major and minor version.
 *
 * @param items - The sorted editors to group.
 * @returns Version groups in input order, with unknown versions last.
 */
export function groupEditorsByBaseVersion<T extends EditorVersionItem>(
    items: T[],
): EditorVersionGroup<T>[] {
    const groups = new Map<string, T[]>();
    const otherItems: T[] = [];

    for (const item of items) {
        const baseVersion = getEditorBaseVersion(item);
        if (!baseVersion) {
            otherItems.push(item);
            continue;
        }

        const group = groups.get(baseVersion) ?? [];
        group.push(item);
        groups.set(baseVersion, group);
    }

    const result: EditorVersionGroup<T>[] = Array.from(
        groups,
        ([baseVersion, groupedItems]) => ({
            baseVersion,
            items: groupedItems,
        }),
    );

    if (otherItems.length > 0) {
        result.push({ baseVersion: null, items: otherItems });
    }

    return result;
}
