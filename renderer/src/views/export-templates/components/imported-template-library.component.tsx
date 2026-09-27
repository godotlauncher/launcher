import type {
    ExportTemplateInventory,
    ImportedTemplateBuild,
    ImportedTemplateInventory,
} from '@shared/contracts';
import { FileUp, FolderOpen, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditableTextField } from '../../../components/ui/editable-text-field.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { exportTemplatesBridge } from '../../../renderer.bridge';
import { TemplateFileList } from './template-file-list.component';
import { TemplateImportModal } from './template-import.modal';
import {
    importedTemplatePlatforms,
    TemplatePlatformBadges,
} from './template-platform-badges.component';
import { TemplateRemoveModal } from './template-remove.modal';

/** Preserves main-process keys while identifying an ordinary library read failure.
 * @param failure - Error returned by the library read.
 */
const libraryReadError = (failure: unknown) =>
    String(failure).match(/exportTemplates:[\w.]+/)?.[0] ??
    'exportTemplates:errors.read';

type Props = {
    importOpen: boolean;
    onImportClose: () => void;
    templateBusy: boolean;
    search: string;
    revision: Pick<ExportTemplateInventory, 'sets'> | null;
    onChanged: () => void;
};
/** Lists whole imported packages separately from editable official collections.
 * @param props - Search, refresh trigger and shared import button state.
 */
export function ImportedTemplateLibrary({
    importOpen,
    onImportClose,
    templateBusy,
    search,
    revision,
    onChanged,
}: Props) {
    const { t } = useTranslation('exportTemplates');
    const [library, setLibrary] = useState<ImportedTemplateInventory | null>(
        null,
    );
    const [action, setAction] = useState<{
        type: 'rename' | 'remove' | 'replace';
        build: ImportedTemplateBuild;
    } | null>(null);
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [readError, setReadError] = useState('');
    const [actionError, setActionError] = useState('');
    // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh imports alongside the official inventory.
    useEffect(() => {
        let alive = true;
        void exportTemplatesBridge
            .getImportedTemplates()
            .then((value) => {
                if (alive) {
                    setLibrary(value);
                    setReadError('');
                }
            })
            .catch((failure) => {
                if (alive) setReadError(libraryReadError(failure));
            });
        return () => {
            alive = false;
        };
    }, [revision]);
    /** Refreshes metadata after a successful explicit operation. */
    const refresh = async () => {
        try {
            setLibrary(await exportTemplatesBridge.getImportedTemplates());
            setReadError('');
        } catch (failure) {
            setReadError(libraryReadError(failure));
        } finally {
            onChanged();
        }
    };
    /** Applies a confirmed library action. */
    const apply = async () => {
        if (action?.type !== 'rename' || busy || templateBusy) return;
        if (!label.trim()) {
            setActionError('exportTemplates:library.invalidLabel');
            return;
        }
        setBusy(true);
        setActionError('');
        try {
            await exportTemplatesBridge.renameImportedTemplate(
                action.build.id,
                label,
            );
            await refresh();
            setAction(null);
        } catch (failure) {
            setActionError(String(failure));
        } finally {
            setBusy(false);
        }
    };
    const visible = (library?.builds ?? [])
        .filter((build) =>
            `${build.label} ${build.setId}`
                .toLowerCase()
                .includes(search.toLowerCase()),
        )
        .sort(
            (a, b) =>
                b.setId.localeCompare(a.setId, undefined, { numeric: true }) ||
                a.label.localeCompare(b.label),
        );
    const error = actionError || readError;
    const failure = error && (
        <p role="alert" className="text-error">
            {t(error.match(/exportTemplates:([\w.]+)/)?.[1] ?? 'errors.failed')}
        </p>
    );
    return (
        <>
            {visible.length > 0 && (
                <section
                    className="space-y-3"
                    aria-label={t('library.imported')}
                >
                    <h2 className="text-lg font-semibold">
                        {t('library.imported')}
                    </h2>
                    {visible.map((build) => (
                        <article
                            key={build.id}
                            aria-label={build.label}
                            className="space-y-2 rounded-md border border-base-content/10 bg-base-content/2 p-3"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                    <EditableTextField
                                        value={build.label}
                                        draft={label}
                                        editing={
                                            action?.type === 'rename' &&
                                            action.build.id === build.id
                                        }
                                        ariaLabel={t('library.tagName')}
                                        editLabel={t('library.rename')}
                                        saveLabel={t('library.save')}
                                        cancelLabel={t('cancel')}
                                        maxLength={80}
                                        disabled={
                                            busy ||
                                            templateBusy ||
                                            !!(
                                                action &&
                                                (action.type !== 'rename' ||
                                                    action.build.id !==
                                                        build.id)
                                            )
                                        }
                                        invalid={
                                            action?.type === 'rename' &&
                                            action.build.id === build.id &&
                                            !label.trim()
                                        }
                                        className={
                                            action?.type === 'rename' &&
                                            action.build.id === build.id
                                                ? 'w-64 max-w-full'
                                                : 'max-w-full'
                                        }
                                        onEdit={() => {
                                            setAction({
                                                type: 'rename',
                                                build,
                                            });
                                            setLabel(build.label);
                                            setActionError('');
                                        }}
                                        onDraftChange={(value) => {
                                            setLabel(value);
                                            setActionError('');
                                        }}
                                        onSave={() => void apply()}
                                        onCancel={() => {
                                            if (!busy) {
                                                setAction(null);
                                                setActionError('');
                                            }
                                        }}
                                    />
                                    {action?.type === 'rename' &&
                                        action.build.id === build.id && (
                                            <p className="basis-full text-base-content/70">
                                                {t('library.tagFolderDetail')}
                                            </p>
                                        )}
                                    <span className="badge badge-soft">
                                        {t('library.imported')}
                                    </span>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <Tooltip tip={t('library.openFolder')}>
                                        <button
                                            type="button"
                                            aria-label={t('library.openFolder')}
                                            className="btn btn-sm btn-square btn-ghost bg-base-content/5"
                                            disabled={
                                                busy ||
                                                templateBusy ||
                                                !!action ||
                                                build.available === false
                                            }
                                            onClick={() => {
                                                setActionError('');
                                                void exportTemplatesBridge
                                                    .openImportedTemplateFolder(
                                                        build.id,
                                                    )
                                                    .catch((failure) =>
                                                        setActionError(
                                                            String(failure),
                                                        ),
                                                    );
                                            }}
                                        >
                                            <FolderOpen
                                                className="size-4"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </Tooltip>
                                    {(['replace', 'remove'] as const).map(
                                        (type) => {
                                            const Icon =
                                                type === 'replace'
                                                    ? FileUp
                                                    : Trash2;
                                            const caption = t(
                                                `library.${type}`,
                                            );
                                            return (
                                                <Tooltip
                                                    key={type}
                                                    tip={caption}
                                                    tone={
                                                        type === 'remove'
                                                            ? 'error'
                                                            : 'default'
                                                    }
                                                >
                                                    <button
                                                        type="button"
                                                        aria-label={caption}
                                                        className={`btn btn-sm btn-square btn-ghost ${type === 'remove' ? 'text-error/80 hover:text-error hover:bg-error/20 hover:border-transparent' : 'bg-base-content/5'}`}
                                                        disabled={
                                                            busy ||
                                                            templateBusy ||
                                                            !!action
                                                        }
                                                        onClick={() => {
                                                            setAction({
                                                                type,
                                                                build,
                                                            });
                                                            setActionError('');
                                                        }}
                                                    >
                                                        <Icon
                                                            className="size-4"
                                                            aria-hidden="true"
                                                        />
                                                    </button>
                                                </Tooltip>
                                            );
                                        },
                                    )}
                                </div>
                            </div>
                            <p>
                                {build.setId} ·{' '}
                                {t('fileCount', { number: build.files.length })}
                            </p>
                            <TemplatePlatformBadges
                                platforms={importedTemplatePlatforms(
                                    build.files,
                                )}
                            />
                            <p className="text-sm text-base-content/70">
                                {t('library.usage', {
                                    number:
                                        library?.usage[build.id]?.length ?? 0,
                                })}
                            </p>
                            {!!library?.references[build.id]?.some(
                                (reference) => !reference.active,
                            ) && (
                                <p className="text-sm text-base-content/70">
                                    {t('library.rememberedUsage', {
                                        number: library.references[
                                            build.id
                                        ].filter(
                                            (reference) => !reference.active,
                                        ).length,
                                    })}
                                </p>
                            )}
                            {build.available === false && (
                                <p role="alert" className="text-error">
                                    {t('library.missing')}
                                </p>
                            )}
                            <details>
                                <summary className="cursor-pointer text-sm">
                                    {t('library.viewFiles')}
                                </summary>
                                <TemplateFileList files={build.files} />
                            </details>
                            {action?.type === 'rename' &&
                                action.build.id === build.id &&
                                failure}
                        </article>
                    ))}
                </section>
            )}
            {!action && failure}
            {(importOpen || action?.type === 'replace') && (
                <TemplateImportModal
                    replace={
                        action?.type === 'replace' ? action.build : undefined
                    }
                    blocked={templateBusy}
                    users={action ? library?.usage[action.build.id] : []}
                    onClose={() => {
                        onImportClose();
                        setAction(null);
                    }}
                    onImported={() => {
                        onImportClose();
                        setAction(null);
                        void refresh();
                    }}
                />
            )}
            {action?.type === 'remove' && (
                <TemplateRemoveModal
                    build={action.build}
                    blocked={templateBusy}
                    officialInstalled={
                        !!revision?.sets.some(
                            (set) =>
                                set.id === action.build.setId &&
                                set.fileCount > 0,
                        )
                    }
                    onClose={() => setAction(null)}
                    onRemoved={() => {
                        setAction(null);
                        void refresh();
                    }}
                />
            )}
        </>
    );
}
