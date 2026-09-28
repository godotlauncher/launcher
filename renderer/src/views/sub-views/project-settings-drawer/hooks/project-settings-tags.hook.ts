import type { ProjectTagSelection } from '@shared/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hasProjectTagChanges } from '../../../../components/project-tags/project-tag.model';
import { useProjectTags } from '../../../../hooks/project-tags.hook';

type TagDraft = {
    path: string;
    initial: string[];
    selection: ProjectTagSelection[];
};

/** Keeps tag assignments provisional for the current drawer session.
 * @param projectPath - Registered project being edited.
 * @param open - Whether the settings session is active.
 */
export function useProjectSettingsTags(
    projectPath: string | undefined,
    open: boolean,
) {
    const { t } = useTranslation('projects');
    const { snapshot, loadFailed, reload, save } = useProjectTags();
    const [draft, setDraft] = useState<TagDraft | null>(null);
    useEffect(() => {
        if (!open || !projectPath) {
            setDraft(null);
            return;
        }
        if (!snapshot) return;
        setDraft((current) => {
            if (!current || current.path !== projectPath) {
                const initial = snapshot.assignments[projectPath] ?? [];
                return {
                    path: projectPath,
                    initial,
                    selection: initial.map((id) => ({ id })),
                };
            }
            const exists = (id: string) =>
                snapshot.tags.some((tag) => tag.id === id);
            const initial = current.initial.filter(exists);
            const selection = current.selection.filter(
                (item) => !('id' in item) || exists(item.id),
            );
            return initial.length === current.initial.length &&
                selection.length === current.selection.length
                ? current
                : { ...current, initial, selection };
        });
    }, [open, projectPath, snapshot]);
    const ready = Boolean(
        open && projectPath && draft?.path === projectPath && snapshot,
    );
    const selection = ready && draft ? draft.selection : [];
    const changed =
        ready &&
        !!draft &&
        hasProjectTagChanges(draft.initial, selection, snapshot?.tags ?? []);
    /** Changes the active draft without writing to disk.
     * @param next - Current picker membership.
     */
    const change = (next: ProjectTagSelection[]) =>
        setDraft((current) =>
            current && current.path === projectPath
                ? { ...current, selection: next }
                : current,
        );
    /** Persists the current draft and accepts only its own session's result. */
    const submit = async () => {
        if (!ready || !draft || !changed) return;
        const next = await save(draft.path, draft.selection).catch(() => {
            throw new Error(t('tags.saveFailed'));
        });
        const initial = next.assignments[draft.path] ?? [];
        setDraft((current) =>
            current === draft
                ? {
                      path: draft.path,
                      initial,
                      selection: initial.map((id) => ({ id })),
                  }
                : current,
        );
    };
    return {
        tags: snapshot?.tags ?? [],
        selection,
        ready,
        changed,
        change,
        submit,
        loadFailed,
        reload,
    };
}
