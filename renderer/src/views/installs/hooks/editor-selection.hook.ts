import type {
    EditorRemovalSelection,
    InstalledRelease,
    ProjectDetails,
} from '@shared/contracts';
import { useEffect, useState } from 'react';
import {
    getEditorProjectUsageCount,
    getReleaseActionKey,
    getSelectableInstalledEditors,
} from '../installs-view.model';

type EditorSelectionArgs = {
    installed: InstalledRelease[];
    shown: InstalledRelease[];
    filterKey: string;
    downloading: Pick<InstalledRelease, 'version' | 'mono'>[];
    projects: ProjectDetails[];
    isBusy: (release: InstalledRelease) => boolean;
};

/**
 * Keeps selection local to the editor list and preserves unused-only checks.
 *
 * @param args - Current registered editors, jobs, projects and busy actions.
 * @returns Selection state and editor selection actions.
 */
export function useEditorSelection({
    installed,
    shown,
    filterKey,
    downloading,
    projects,
    isBusy,
}: EditorSelectionArgs) {
    const [enabled, setEnabled] = useState(false);
    const [state, setState] = useState({
        filterKey,
        selected: new Map<string, boolean>(),
    });
    const selected =
        state.filterKey === filterKey
            ? state.selected
            : new Map<string, boolean>();
    /** Updates selection within the current search scope.
     * @param update - Replacement selection or update of the current selection.
     */
    const setSelected = (
        update:
            | Map<string, boolean>
            | ((current: Map<string, boolean>) => Map<string, boolean>),
    ) =>
        setState((current) => {
            const next =
                typeof update === 'function'
                    ? update(
                          current.filterKey === filterKey
                              ? current.selected
                              : new Map(),
                      )
                    : update;
            return current.filterKey === filterKey && current.selected === next
                ? current
                : { filterKey, selected: next };
        });
    const selectable = getSelectableInstalledEditors(
        installed,
        downloading,
        isBusy,
    );
    const shownKeys = new Set(shown.map(getReleaseActionKey));
    const available = selectable.filter((release) =>
        shownKeys.has(getReleaseActionKey(release)),
    );
    const selectableKeys = new Set(available.map(getReleaseActionKey));
    const selections: EditorRemovalSelection[] = available
        .filter((release) => selected.has(getReleaseActionKey(release)))
        .map((release) => ({
            release,
            onlyUnused: selected.get(getReleaseActionKey(release)) === true,
        }));
    const unused = available.filter(
        (release) =>
            release.source !== 'custom' &&
            release.managed_by_launcher !== false &&
            getEditorProjectUsageCount(release, projects) === 0,
    );

    useEffect(() => {
        setState((current) => {
            if (current.filterKey !== filterKey)
                return { filterKey, selected: new Map() };
            if (
                [...current.selected.keys()].every((key) =>
                    selectableKeys.has(key),
                )
            )
                return current;
            return {
                filterKey,
                selected: new Map(
                    [...current.selected].filter(([key]) =>
                        selectableKeys.has(key),
                    ),
                ),
            };
        });
    }, [selectableKeys, filterKey]);

    /** Toggles selection mode, clearing any previous selection. */
    const toggleEnabled = () => {
        setEnabled((current) => !current);
        setSelected(new Map());
    };

    /**
     * Toggles one available editor without removing other unused-only checks.
     *
     * @param release - Editor whose selection should change.
     */
    const toggleEditor = (release: InstalledRelease) => {
        const key = getReleaseActionKey(release);
        if (!selectableKeys.has(key)) return;
        setSelected((current) => {
            const next = new Map(current);
            if (next.has(key)) next.delete(key);
            else next.set(key, false);
            return next;
        });
    };

    /** Selects every eligible search result, including rows outside the scroll area. */
    const selectAll = () =>
        setSelected(
            new Map(
                available.map((release) => [
                    getReleaseActionKey(release),
                    false,
                ]),
            ),
        );

    /** Replaces the selection with unused launcher-managed editors. */
    const selectUnused = () =>
        setSelected(
            new Map(
                unused.map((release) => [getReleaseActionKey(release), true]),
            ),
        );

    /** Toggles eligible visible members of one version group.
     * @param releases - Current search results belonging to the group.
     */
    const toggleGroup = (releases: InstalledRelease[]) => {
        if (!enabled) return;
        const targets = releases.filter((release) =>
            selectableKeys.has(getReleaseActionKey(release)),
        );
        const all = targets.every((release) =>
            selected.has(getReleaseActionKey(release)),
        );
        setSelected((current) => {
            const next = new Map(current);
            for (const release of targets) {
                const key = getReleaseActionKey(release);
                if (all) next.delete(key);
                else if (!next.has(key)) next.set(key, false);
            }
            return next;
        });
    };

    /** Clears selected editors while keeping selection mode enabled. */
    const clear = () => setSelected(new Map());

    return {
        enabled,
        selectableKeys,
        selectedKeys: new Set(
            selections.map(({ release }) => getReleaseActionKey(release)),
        ),
        selections,
        unusedCount: unused.length,
        toggleEnabled,
        toggleEditor,
        toggleGroup,
        selectAll,
        selectUnused,
        clear,
    };
}
