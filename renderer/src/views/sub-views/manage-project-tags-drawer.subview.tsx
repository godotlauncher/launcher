import type { ProjectTag, ProjectTagsSnapshot } from '@shared/contracts';
import { Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectTagColourPicker } from '../../components/project-tags/project-tag-colour-picker.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { EditableTextField } from '../../components/ui/editable-text-field.component';
import { Tooltip } from '../../components/ui/tooltip.component';
import { useAlerts } from '../../hooks/alerts.hook';
import { useProjectTags } from '../../hooks/project-tags.hook';

type TagFormProps = {
    tag?: ProjectTag;
    tags: ProjectTag[];
    usage?: number;
    remove?: (id: string) => Promise<ProjectTagsSnapshot>;
    save: (
        id: string | null,
        name: string,
        colour: number,
    ) => Promise<ProjectTagsSnapshot>;
};

/** Edits one catalogue entry with an explicit save action.
 * @param props - Current tag, catalogue, usage and persistence callback.
 */
function TagForm({ tag, tags, usage, save, remove }: TagFormProps) {
    const { t } = useTranslation(['projects', 'common']);
    const { addCustomConfirm } = useAlerts();
    const [name, setName] = useState(tag?.name ?? '');
    const [colour, setColour] = useState(tag?.colour ?? tags.length % 30);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);
    const busy = useRef(false);
    const input = useRef<HTMLInputElement>(null);
    const trimmed = name.trim();
    const duplicate = tags.some(
        (other) =>
            other.id !== tag?.id &&
            other.name.toLowerCase() === trimmed.toLowerCase(),
    );
    const changed = !tag || trimmed !== tag.name || colour !== tag.colour;
    /** Saves the current draft and retains it if persistence fails. */
    const submit = async () => {
        if (busy.current || !trimmed || duplicate) return;
        if (!changed) {
            setEditing(false);
            return;
        }
        busy.current = true;
        setSaving(true);
        setFailed(false);
        try {
            const next = await save(tag?.id ?? null, trimmed, colour);
            setEditing(false);
            if (!tag) {
                setName('');
                setColour(next.tags.length % 30);
                input.current?.focus({ preventScroll: true });
            }
        } catch {
            setFailed(true);
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };
    /** Persists colours independently of an unfinished name edit.
     * @param nextColour - Selected preset.
     */
    const changeColour = async (nextColour: number) => {
        if (!tag) {
            setColour(nextColour);
            return;
        }
        if (busy.current) return;
        busy.current = true;
        setSaving(true);
        setFailed(false);
        try {
            await save(tag.id, tag.name, nextColour);
            setColour(nextColour);
        } catch {
            setFailed(true);
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };
    /** Confirms deletion of the shared tag and all its memberships. */
    const confirmDelete = () => {
        if (!tag || !remove || busy.current) return;
        addCustomConfirm(
            t('tags.manage.deleteTitle', { name: tag.name }),
            t('tags.manage.deleteDescription'),
            [
                {
                    isCancel: true,
                    typeClass: 'btn-neutral text-base',
                    text: t('common:buttons.cancel'),
                },
                {
                    typeClass: 'btn-error text-base',
                    text: t('tags.manage.delete'),
                    onClick: async () => {
                        if (busy.current) return false;
                        busy.current = true;
                        setSaving(true);
                        setFailed(false);
                        try {
                            await remove(tag.id);
                        } catch {
                            setFailed(true);
                        } finally {
                            busy.current = false;
                            setSaving(false);
                        }
                        return true;
                    },
                },
            ],
            undefined,
            'warning',
        );
    };
    return (
        <form
            aria-label={tag?.name ?? t('tags.manage.newTag')}
            className="flex min-w-0 flex-col gap-1"
            onSubmit={(event) => {
                event.preventDefault();
                void submit();
            }}
        >
            <div className="flex items-center gap-2">
                <ProjectTagColourPicker
                    name={trimmed || t('tags.manage.newTag')}
                    colour={colour}
                    disabled={saving}
                    onOpen={() => {}}
                    onChange={changeColour}
                />
                {tag ? (
                    <EditableTextField
                        value={tag.name}
                        draft={name}
                        editing={editing}
                        ariaLabel={t('tags.manage.name')}
                        editLabel={t('tags.manage.edit')}
                        saveLabel={t('tags.manage.save')}
                        cancelLabel={t('common:buttons.cancel')}
                        disabled={saving}
                        invalid={duplicate || !trimmed}
                        className="min-w-0 flex-1"
                        onEdit={() => setEditing(true)}
                        onDraftChange={(value) => {
                            setName(value);
                            setFailed(false);
                        }}
                        onSave={() => void submit()}
                        onCancel={() => {
                            setName(tag.name);
                            setEditing(false);
                            setFailed(false);
                        }}
                    />
                ) : (
                    <input
                        ref={input}
                        aria-label={t('tags.manage.name')}
                        aria-invalid={duplicate || undefined}
                        className="input input-sm min-w-0 flex-1 text-base"
                        value={name}
                        placeholder={t('tags.manage.name')}
                        readOnly={saving}
                        onChange={(event) => {
                            setName(event.target.value);
                            setFailed(false);
                        }}
                    />
                )}
                {usage !== undefined && !editing && (
                    <Tooltip
                        placement="top"
                        tip={t('tags.manage.usage', { count: usage })}
                    >
                        <output
                            className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-md bg-neutral px-1.5 text-base font-medium text-neutral-content"
                            aria-label={t('tags.manage.usage', {
                                count: usage,
                            })}
                        >
                            {usage}
                        </output>
                    </Tooltip>
                )}
                {!tag && (
                    <button
                        type="submit"
                        aria-label={t(
                            tag ? 'tags.manage.save' : 'tags.manage.add',
                        )}
                        className="btn btn-sm min-w-16 text-base"
                        disabled={saving || !trimmed || duplicate || !changed}
                    >
                        {saving ? (
                            <span
                                className="loading loading-spinner loading-xs"
                                aria-hidden="true"
                            />
                        ) : (
                            t(tag ? 'tags.manage.save' : 'tags.manage.add')
                        )}
                    </button>
                )}
                {tag && (
                    <Tooltip placement="top" tip={t('tags.manage.delete')}>
                        <button
                            type="button"
                            className="btn btn-sm btn-ghost btn-square text-error/80 hover:text-error hover:bg-error/20 hover:border-transparent"
                            aria-label={t('tags.manage.delete')}
                            disabled={saving}
                            onClick={confirmDelete}
                        >
                            <Trash2 size={16} aria-hidden="true" />
                        </button>
                    </Tooltip>
                )}
            </div>
            {duplicate && (
                <p role="alert" className="pl-7 text-sm text-error">
                    {t('tags.manage.duplicate')}
                </p>
            )}
            {failed && (
                <p role="alert" className="pl-7 text-sm text-error">
                    {t('tags.saveFailed')}
                </p>
            )}
        </form>
    );
}

/** Manages reusable tags while preserving all project memberships.
 * @param props - Drawer visibility and close callback.
 */
export function ManageProjectTagsDrawer({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useTranslation(['projects', 'common']);
    const { snapshot, loadFailed, reload, saveTag, deleteTag } =
        useProjectTags();
    return (
        <Drawer
            open={open}
            onOpenChange={onOpenChange}
            side="right"
            width={560}
            ariaLabel={t('tags.manage.title')}
        >
            <Drawer.Header className="items-center">
                <Drawer.Title className="text-lg font-semibold">
                    {t('tags.manage.title')}
                </Drawer.Title>
                <Drawer.CloseButton className="btn-sm" />
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-4 text-base">
                {open &&
                    (loadFailed ? (
                        <div
                            role="alert"
                            className="flex items-center justify-between gap-2"
                        >
                            <span>{t('tags.loadFailed')}</span>
                            <button
                                type="button"
                                className="btn btn-sm text-base"
                                onClick={() => void reload()}
                            >
                                {t('tags.retry')}
                            </button>
                        </div>
                    ) : !snapshot ? (
                        <p role="status">{t('tags.loading')}</p>
                    ) : (
                        <>
                            <section className="flex flex-col gap-3">
                                <h3 className="font-semibold">
                                    {t('tags.manage.newTag')}
                                </h3>
                                <TagForm tags={snapshot.tags} save={saveTag} />
                            </section>
                            <section className="flex flex-col gap-3">
                                <h3 className="font-semibold">
                                    {t('tags.label')}
                                </h3>
                                {snapshot.tags.length ? (
                                    <ul className="flex flex-col divide-y divide-base-content/10">
                                        {snapshot.tags.map((tag) => (
                                            <li
                                                key={tag.id}
                                                className="py-1.5 first:pt-0"
                                            >
                                                <TagForm
                                                    key={tag.id}
                                                    remove={deleteTag}
                                                    tag={tag}
                                                    tags={snapshot.tags}
                                                    usage={
                                                        Object.values(
                                                            snapshot.assignments,
                                                        ).filter((ids) =>
                                                            ids.includes(
                                                                tag.id,
                                                            ),
                                                        ).length
                                                    }
                                                    save={saveTag}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-base-content/60">
                                        {t('tags.none')}
                                    </p>
                                )}
                            </section>
                        </>
                    ))}
            </Drawer.Body>
        </Drawer>
    );
}
