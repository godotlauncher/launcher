import type { ExportTemplateSet, TemplatePackage } from '@shared/contracts';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer } from '../../../components/ui/drawer/drawer.component';
import { FileSelectionTree } from '../../../components/ui/file-selection-tree/file-selection-tree.component';
import { getFileLeaves } from '../../../components/ui/file-selection-tree/file-selection-tree.model';
import { useRelease } from '../../../hooks/release.hook';
import { exportTemplatesBridge } from '../../../renderer.bridge';
import { getTemplateCatalogueReleases } from '../template-catalogue.model';
import { getTemplateFileTree } from '../template-file-tree.model';
import {
    TemplateVersionPicker,
    type TemplateVersionSelection,
} from './template-version-picker.component';

type TemplateDownloadDrawerProps = {
    open: boolean;
    sets: ExportTemplateSet[];
    manageSet?: ExportTemplateSet | null;
    onOpenChange: (open: boolean) => void;
    onSave: (token: string, selected: string[]) => Promise<boolean>;
};

/** Hosts template selection and stages additions and removals for Save.
 * @param props - Drawer visibility and current local template inventory.
 */
export function TemplateDownloadDrawer({
    open,
    sets,
    manageSet,
    onOpenChange,
    onSave,
}: TemplateDownloadDrawerProps) {
    const { t } = useTranslation(['exportTemplates', 'menus']);
    const { catalogueReleases } = useRelease();
    const catalogue = useMemo(
        () => getTemplateCatalogueReleases(catalogueReleases),
        [catalogueReleases],
    );
    const [picked, setSelection] = useState<TemplateVersionSelection | null>(
        null,
    );
    const selection = useMemo(() => {
        if (!manageSet) return picked;
        for (const release of catalogue) {
            const asset = release.templateAssets?.find(
                (asset) =>
                    `${release.tag.replace('-', '.')}${asset.flavor === 'dotnet' ? '.mono' : ''}` ===
                    manageSet.id,
            );
            if (asset) return { release, asset };
        }
        return null;
    }, [manageSet, picked, catalogue]);
    const [localOnly, setLocalOnly] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [packageInfo, setPackageInfo] = useState<TemplatePackage | null>(
        null,
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [attempt, setAttempt] = useState(0);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Retry deliberately reloads the current package.
    useEffect(() => {
        let alive = true;
        setPackageInfo(null);
        setError('');
        if ((!selection && !manageSet) || !open) return;
        setLocalOnly(false);
        setLoading(true);
        const load = selection
            ? exportTemplatesBridge.getPackage(
                  selection.release.id,
                  selection.asset.id,
              )
            : exportTemplatesBridge.getLocalPackage(manageSet?.id ?? '');
        void load
            .catch(async (failure) => {
                if (!manageSet) throw failure;
                if (alive) setLocalOnly(true);
                return exportTemplatesBridge.getLocalPackage(manageSet.id);
            })
            .then((info) => {
                if (!alive) return;
                setPackageInfo(info);
                if (manageSet && !selection) setLocalOnly(true);
                setSelected(info.localFiles);
            })
            .catch((failure) => {
                if (alive)
                    setError(
                        String(failure).includes('errors.range')
                            ? 'errors.range'
                            : 'errors.failed',
                    );
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [selection, manageSet, open, attempt]);
    const files = packageInfo?.localFiles ?? [];
    const nodes = getTemplateFileTree(
        packageInfo?.files.map((file) => file.path) ?? [],
        files,
        Object.fromEntries(
            [
                'desktop',
                'mobile',
                'threaded',
                'singleThreaded',
                'extensions',
                'extensionsSingle',
                'common',
                'additional',
            ].map((key) => [key, t(`picker.${key}`)]),
        ),
    );
    const leaves = nodes.flatMap(getFileLeaves);
    const added = leaves.filter(
        (file) => !file.available && selected.includes(file.id),
    ).length;
    const removed =
        selection || manageSet
            ? leaves.filter(
                  (file) => file.available && !selected.includes(file.id),
              ).length
            : 0;
    const removeAll =
        removed > 0 &&
        added === 0 &&
        !leaves.some((file) => selected.includes(file.id));
    const title = manageSet
        ? `${t('manage')} ${manageSet.version} - ${t(`editions.${manageSet.edition}`)}`
        : t('picker.title');
    return (
        <Drawer
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    setSelected([]);
                    setSelection(null);
                }
                onOpenChange(nextOpen);
            }}
            side="right"
            width={700}
            testId="templateDownloadDrawer"
            ariaLabel={title}
        >
            <Drawer.Header className="py-3">
                <Drawer.Title className="text-lg font-semibold">
                    {title}
                </Drawer.Title>
                <Drawer.CloseButton
                    className="btn-sm"
                    aria-label={t('menus:app.close')}
                />
            </Drawer.Header>
            <Drawer.Body
                scrollable={false}
                className="flex min-h-0 flex-col gap-4 pt-2 pb-1 text-base"
            >
                {!manageSet && (
                    <TemplateVersionPicker
                        catalogue={catalogue}
                        selection={selection}
                        sets={sets}
                        onChange={(next) => {
                            setSelection(next);
                            const nextId = `${next.release.tag.replace('-', '.')}${next.asset.flavor === 'dotnet' ? '.mono' : ''}`;
                            setSelected(
                                sets.find((set) => set.id === nextId)?.files ??
                                    [],
                            );
                        }}
                    />
                )}
                {selection || manageSet ? (
                    <>
                        <div className="shrink-0">
                            <h3 className="font-semibold">
                                {t('picker.files')}
                            </h3>
                        </div>
                        <div
                            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pl-1 pr-3"
                            data-testid="templateFileTree"
                        >
                            {localOnly && (
                                <p className="mb-2 text-sm text-base-content/60">
                                    {t('picker.localOnly')}
                                </p>
                            )}
                            {loading && (
                                <p role="status">{t('picker.loading')}</p>
                            )}
                            {error && (
                                <div role="alert">
                                    <p>{t(error)}</p>
                                    <button
                                        type="button"
                                        className="btn btn-sm"
                                        onClick={() =>
                                            setAttempt((value) => value + 1)
                                        }
                                    >
                                        {t('retry')}
                                    </button>
                                </div>
                            )}
                            {packageInfo && (
                                <FileSelectionTree
                                    key={selection?.asset.id ?? manageSet?.id}
                                    nodes={nodes}
                                    selected={selected}
                                    onChange={setSelected}
                                    label={t('picker.files')}
                                    labels={{
                                        local: t('picker.local'),
                                        partial: t('picker.partial'),
                                        missing: t('picker.missing'),
                                        add: t('picker.willAdd'),
                                        remove: t('picker.willRemove'),
                                    }}
                                />
                            )}
                        </div>
                    </>
                ) : (
                    <p
                        role="status"
                        className="flex flex-1 items-center justify-center text-base-content/60"
                    >
                        {t('picker.chooseVersion')}
                    </p>
                )}
            </Drawer.Body>
            <Drawer.Footer className="flex flex-wrap items-center justify-between gap-3 py-2 text-base">
                {removed > 0 && (
                    <p className="w-full text-sm text-base-content/60">
                        {t('picker.removalNotice')}
                    </p>
                )}
                <span role="status" className="text-base-content/60">
                    {t('picker.changes', { added, removed })}
                </span>
                <button
                    type="button"
                    className={`btn ${removeAll ? 'btn-error' : 'btn-primary'} text-base`}
                    disabled={
                        !packageInfo ||
                        loading ||
                        saving ||
                        (!added && !removed)
                    }
                    onClick={async () => {
                        if (!packageInfo) return;
                        setSaving(true);
                        try {
                            if (!(await onSave(packageInfo.token, selected))) {
                                setError('errors.failed');
                                return;
                            }
                            setSelection(null);
                            setSelected([]);
                            onOpenChange(false);
                        } catch {
                            setError('errors.failed');
                        } finally {
                            setSaving(false);
                        }
                    }}
                >
                    {t(removeAll ? 'removeTemplates' : 'picker.save')}
                </button>
            </Drawer.Footer>
        </Drawer>
    );
}
