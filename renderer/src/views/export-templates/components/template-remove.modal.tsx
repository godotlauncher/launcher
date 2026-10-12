import type {
    ImportedTemplateBuild,
    ImportedTemplateInventory,
} from '@shared/contracts';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import { SelectField } from '../../../components/ui/select-field.component';
import { exportTemplatesBridge } from '../../../renderer.bridge';

type Props = {
    build: ImportedTemplateBuild;
    blocked: boolean;
    officialInstalled: boolean;
    onClose: () => void;
    onRemoved: () => void;
};

/** Reviews current and remembered choices before replacing them and deleting a build.
 * @param props - Selected build, operation state and completion callbacks.
 */
export function TemplateRemoveModal({
    build,
    blocked,
    officialInstalled,
    onClose,
    onRemoved,
}: Props) {
    const { t } = useTranslation('exportTemplates');
    const [library, setLibrary] = useState<ImportedTemplateInventory | null>(
        null,
    );
    const [replacement, setReplacement] = useState('official');
    const [refresh, setRefresh] = useState(0);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh requests a new snapshot for explicit review.
    useEffect(() => {
        let active = true;
        setLoading(true);
        setLibrary(null);
        setError('');
        void exportTemplatesBridge.getImportedTemplates().then(
            (next) => {
                if (!active) return;
                setLibrary(next);
                setReplacement('official');
                if (!next.builds.some((item) => item.id === build.id))
                    setError('exportTemplates:library.missing');
                setLoading(false);
            },
            (failure) => {
                if (!active) return;
                setError(String(failure));
                setLoading(false);
            },
        );
        return () => {
            active = false;
        };
    }, [build.id, refresh]);

    const current = library?.builds.find((item) => item.id === build.id);
    const references = library?.references[build.id] ?? [];
    const version = `${build.setId.replace(/\.mono$/, '')} - ${t(`editions.${build.setId.endsWith('.mono') ? 'dotnet' : 'standard'}`)}`;
    const matching = (library?.builds ?? [])
        .filter(
            (item) =>
                item.id !== build.id &&
                item.setId === build.setId &&
                item.available !== false,
        )
        .sort((a, b) => a.label.localeCompare(b.label));

    /** Applies the reviewed replacement and deletion under one main-process reservation. */
    const remove = async () => {
        if (!current || pending || blocked || loading || error) return;
        setPending(true);
        try {
            await exportTemplatesBridge.removeImportedTemplate(current.id, {
                replacement,
                revision: current.revision,
                references: references.map(
                    ({ projectPath, currentSetId, active }) => ({
                        projectPath,
                        currentSetId,
                        active,
                    }),
                ),
            });
            onRemoved();
        } catch (failure) {
            setError(String(failure));
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog
            title={t('library.remove')}
            tone="error"
            testId="templateRemoveModal"
            panelClassName={`max-w-2xl ${references.length ? 'h-[min(36rem,85vh)]' : ''}`}
            bodyClassName="flex min-h-0 flex-col gap-3 overflow-hidden"
            onRequestClose={() => {
                if (!pending) onClose();
            }}
            footer={
                <div className="flex w-full min-w-0 flex-col gap-3">
                    {(error || blocked) && (
                        <p
                            role={error ? 'alert' : 'status'}
                            className="flex items-start gap-2 text-sm text-error-content dark:text-error"
                        >
                            <TriangleAlert
                                className="mt-0.5 size-4 shrink-0"
                                aria-hidden="true"
                            />
                            <span className="min-w-0 break-words">
                                {t(
                                    error
                                        ? (error.match(
                                              /exportTemplates:([\w.]+)/,
                                          )?.[1] ?? 'errors.failed')
                                        : 'errors.busy',
                                )}
                            </span>
                        </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                        {error && (
                            <button
                                type="button"
                                className="btn btn-ghost mr-auto"
                                disabled={pending || loading || blocked}
                                onClick={() => setRefresh((value) => value + 1)}
                            >
                                {t('refresh')}
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={pending}
                            onClick={onClose}
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-error"
                            disabled={
                                pending ||
                                blocked ||
                                loading ||
                                !current ||
                                !!error
                            }
                            onClick={() => void remove()}
                        >
                            {pending && (
                                <span
                                    className="loading loading-spinner loading-sm"
                                    aria-hidden="true"
                                />
                            )}
                            {t(
                                references.length
                                    ? 'library.switchAndRemove'
                                    : 'library.remove',
                            )}
                        </button>
                    </div>
                </div>
            }
        >
            <div className="shrink-0 space-y-1" aria-busy={pending || loading}>
                <p
                    className="truncate font-semibold"
                    title={current?.label ?? build.label}
                >
                    {current?.label ?? build.label}
                </p>
                <p className="text-sm text-base-content/70">{version}</p>
            </div>
            <p className="shrink-0 text-sm">{t('library.removeDetail')}</p>
            {loading && <p role="status">{t('loading')}</p>}
            {!!references.length && (
                <>
                    <div className="shrink-0">
                        <SelectField
                            id="remove-template-replacement"
                            label={t('library.replacement')}
                            help={t('library.removeReferencedDetail', {
                                version,
                            })}
                            value={replacement}
                            disabled={pending || blocked || !!error}
                            onChange={setReplacement}
                            options={[
                                {
                                    value: 'official',
                                    label: `${t('library.official')} - ${version}`,
                                },
                                ...matching.map((item) => ({
                                    value: item.id,
                                    label: `${item.label} - ${version}`,
                                })),
                            ]}
                        />
                    </div>
                    {replacement === 'official' && !officialInstalled && (
                        <p className="shrink-0 text-sm text-[color:var(--color-warning-readable)]">
                            {t('library.officialUnavailable')}
                        </p>
                    )}
                    <div
                        className="min-h-0 flex-1 overflow-y-auto"
                        data-testid="templateRemoveProjects"
                    >
                        <details>
                            <summary className="cursor-pointer text-sm font-medium">
                                {t('library.affectedProjects')} (
                                {references.length})
                            </summary>
                            <ul
                                className="mt-2 space-y-2"
                                aria-label={t('library.affectedProjects')}
                            >
                                {references.map((reference) => (
                                    <li
                                        key={reference.projectPath}
                                        className="rounded-md bg-base-content/5 px-3 py-2"
                                    >
                                        <p className="break-words text-sm font-medium">
                                            {reference.projectName}
                                        </p>
                                        <p className="text-sm text-base-content/70">
                                            {t(
                                                reference.active
                                                    ? 'library.usingNow'
                                                    : 'library.rememberedSelection',
                                                { version },
                                            )}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    </div>
                </>
            )}
        </Dialog>
    );
}
