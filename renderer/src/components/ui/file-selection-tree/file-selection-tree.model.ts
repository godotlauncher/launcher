import type { FileSelectionNode } from './file-selection-tree.types';

/** Lists leaf files below an item.
 * @param node - File or group to inspect.
 */
export function getFileLeaves(node: FileSelectionNode): FileSelectionNode[] {
    return node.children ? node.children.flatMap(getFileLeaves) : [node];
}

/** Changes the desired files below an item, preserving selections outside it.
 * @param selected - Current selected file identifiers.
 * @param node - File or group being toggled.
 * @param checked - Whether its files should remain present.
 */
export function toggleFileSelection(
    selected: string[],
    node: FileSelectionNode,
    checked: boolean,
): string[] {
    const next = new Set(selected);
    for (const file of getFileLeaves(node)) {
        if (checked) next.add(file.id);
        else next.delete(file.id);
    }
    return [...next];
}
