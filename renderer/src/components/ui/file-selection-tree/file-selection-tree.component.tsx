import clsx from 'clsx';
import { ChevronRight, File, Folder } from 'lucide-react';
import { useState } from 'react';
import {
    getFileLeaves,
    toggleFileSelection,
} from './file-selection-tree.model';
import type { FileSelectionNode } from './file-selection-tree.types';

type FileSelectionTreeProps = {
    nodes: FileSelectionNode[];
    defaultExpandedDepth?: number;
    selected: string[];
    onChange: (selected: string[]) => void;
    label: string;
    labels: {
        local: string;
        partial: string;
        missing: string;
        add: string;
        remove: string;
    };
};

/** Displays a nested file chooser using keyboard-accessible disclosures and checkboxes.
 * @param props - Caller-owned hierarchy, selection, initial expansion depth and localised labels.
 */
export function FileSelectionTree({
    nodes,
    defaultExpandedDepth = 1,
    selected,
    onChange,
    label,
    labels,
}: FileSelectionTreeProps) {
    return (
        <ul aria-label={label} className="space-y-1 text-base">
            {nodes.map((node) => (
                <FileSelectionRow
                    key={node.id}
                    node={node}
                    selected={selected}
                    onChange={onChange}
                    labels={labels}
                    depth={0}
                    defaultExpandedDepth={defaultExpandedDepth}
                />
            ))}
        </ul>
    );
}

/** Displays one file or expandable group with independent availability and selection.
 * @param props - Item, tree selection, nesting depth and initial expansion depth.
 */
function FileSelectionRow({
    node,
    selected,
    onChange,
    labels,
    depth,
    defaultExpandedDepth,
}: Pick<FileSelectionTreeProps, 'selected' | 'onChange' | 'labels'> & {
    node: FileSelectionNode;
    depth: number;
    defaultExpandedDepth: number;
}) {
    const [expanded, setExpanded] = useState(depth < defaultExpandedDepth);
    const leaves = getFileLeaves(node);
    const missing = leaves.filter((file) => !file.available);
    const count = leaves.filter((file) => selected.includes(file.id)).length;
    const additions = missing.filter((file) =>
        selected.includes(file.id),
    ).length;
    const removals = leaves.filter(
        (file) => file.available && !selected.includes(file.id),
    ).length;
    const mixed = count > 0 && count < leaves.length;
    const status =
        missing.length === 0
            ? labels.local
            : missing.length < leaves.length
              ? labels.partial
              : labels.missing;
    return (
        <li>
            <div
                className={clsx(
                    'flex min-h-10 items-center gap-2 rounded-md px-2 py-1',
                    count > 0
                        ? 'bg-primary/10 hover:bg-primary/20'
                        : 'hover:bg-base-content/5',
                )}
            >
                {node.children ? (
                    <button
                        type="button"
                        className="btn btn-ghost btn-xs btn-square shrink-0"
                        aria-label={node.label}
                        aria-expanded={expanded}
                        onClick={() => setExpanded(!expanded)}
                    >
                        <ChevronRight
                            size={16}
                            className={expanded ? 'rotate-90' : ''}
                            aria-hidden="true"
                        />
                    </button>
                ) : (
                    <span className="w-6 shrink-0" />
                )}
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm shrink-0"
                        aria-label={node.label}
                        checked={leaves.length > 0 && count === leaves.length}
                        ref={(element) => {
                            if (element) element.indeterminate = mixed;
                        }}
                        onChange={(event) =>
                            onChange(
                                toggleFileSelection(
                                    selected,
                                    node,
                                    event.target.checked,
                                ),
                            )
                        }
                    />
                    {node.children ? (
                        <Folder
                            size={16}
                            className="shrink-0 text-info"
                            aria-hidden="true"
                        />
                    ) : (
                        <File
                            size={16}
                            className="shrink-0 text-base-content/50"
                            aria-hidden="true"
                        />
                    )}
                    <span
                        className={clsx(
                            'min-w-0 break-words [overflow-wrap:anywhere]',
                            node.children && 'font-semibold',
                        )}
                    >
                        {node.label}
                    </span>
                    {(additions > 0 || removals > 0) && (
                        <span className="flex shrink-0 flex-wrap items-center gap-1">
                            {additions > 0 && (
                                <span className="badge badge-sm badge-soft badge-primary whitespace-nowrap text-sm font-normal">
                                    {labels.add}
                                    {node.children ? `: ${additions}` : ''}
                                </span>
                            )}
                            {removals > 0 && (
                                <span className="badge badge-sm badge-soft badge-error whitespace-nowrap text-sm font-normal">
                                    {labels.remove}
                                    {node.children ? `: ${removals}` : ''}
                                </span>
                            )}
                        </span>
                    )}
                </label>
                <span
                    className={clsx(
                        'shrink-0 whitespace-nowrap text-sm font-normal',
                        missing.length === 0
                            ? 'badge badge-sm badge-soft badge-success'
                            : 'text-base-content/60',
                    )}
                >
                    {status}
                </span>
            </div>
            {node.children && expanded && (
                <ul className="ml-3 border-l border-base-300 pl-1">
                    {node.children.map((child) => (
                        <FileSelectionRow
                            key={child.id}
                            node={child}
                            selected={selected}
                            onChange={onChange}
                            labels={labels}
                            depth={depth + 1}
                            defaultExpandedDepth={defaultExpandedDepth}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}
