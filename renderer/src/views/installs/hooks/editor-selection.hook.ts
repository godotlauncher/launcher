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
    downloading,
    projects,
    isBusy,
}: EditorSelectionArgs) {
    const [enabled, setEnabled] = useState(false);
    const [selected, setSelected] = useState(new Map<string, boolean>());
    const selectable = getSelectableInstalledEditors(
        installed,
        downloading,
        isBusy,
    );
    const selectableKeys = new Set(selectable.map(getReleaseActionKey));
    const selections: EditorRemovalSelection[] = selectable
        .filter((release) => selected.has(getReleaseActionKey(release)))
        .map((release) => ({
            release,
            onlyUnused: selected.get(getReleaseActionKey(release)) === true,
        }));
    const unused = selectable.filter(
        (release) =>
            release.source !== 'custom' &&
            release.managed_by_launcher !== false &&
            getEditorProjectUsageCount(release, projects) === 0,
    );

    useEffect(() => {
        setSelected((current) => {
            if ([...current.keys()].every((key) => selectableKeys.has(key))) {
                return current;
            }
            return new Map(
                [...current].filter(([key]) => selectableKeys.has(key)),
            );
        });
    }, [selectableKeys]);

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

    /** Selects every available editor, including manually registered builds. */
    const selectAll = () =>
        setSelected(
            new Map(
                selectable.map((release) => [
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
        selectAll,
        selectUnused,
        clear,
    };
}
