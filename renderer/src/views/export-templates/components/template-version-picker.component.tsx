import type {
    EditorCatalogRelease,
    ExportTemplateAsset,
    ExportTemplateSet,
} from '@shared/contracts';
import clsx from 'clsx';
import { Check, FileOutput } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchField } from '../../../components/ui/search-field.component';
import { groupEditorsByBaseVersion } from '../../../editor-version-group.model';
import { useRelease } from '../../../hooks/release.hook';
import { getInstallEditorRows } from '../../sub-views/install-editor/install-editor.model';
import { getInstalledTemplateReleases } from '../template-catalogue.model';

export type TemplateVersionSelection = {
    release: EditorCatalogRelease;
    asset: ExportTemplateAsset;
};
type Props = {
    catalogue: EditorCatalogRelease[];
    selection: TemplateVersionSelection | null;
    onChange: (selection: TemplateVersionSelection) => void;
    sets: ExportTemplateSet[];
};

/** Selects an official template version and edition without installing an editor.
 * @param props - Cached catalogue, selected package and local inventory.
 */
export function TemplateVersionPicker({
    catalogue,
    selection,
    onChange,
    sets,
}: Props) {
    const { t } = useTranslation([
        'exportTemplates',
        'installEditor',
        'installs',
    ]);
    const { installedReleases, loading, hasError } = useRelease();
    const installed = getInstalledTemplateReleases(
        catalogue,
        installedReleases,
    );
    const [scopeChoice, setScope] = useState<'installed' | 'all' | null>(null);
    const scope = scopeChoice ?? (installed.length ? 'installed' : 'all');
    const [channel, setChannel] = useState<'stable' | 'prerelease'>('stable');
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const popover = useRef<HTMLDivElement>(null);
    const id = useId();
    const [position, setPosition] = useState({
        left: 0,
        top: 0,
        width: 0,
        maxHeight: 400,
    });
    useEffect(() => {
        if (!open) return;
        /** Positions the selector within the visible drawer and viewport. */
        const positionPopover = () => {
            const rect = trigger.current?.getBoundingClientRect();
            if (!rect) return;
            setPosition({
                left: rect.left,
                top: rect.bottom + 4,
                width: Math.min(544, rect.width, window.innerWidth - 32),
                maxHeight: Math.min(
                    448,
                    Math.max(160, window.innerHeight - rect.bottom - 20),
                ),
            });
        };
        positionPopover();
        window.addEventListener('resize', positionPopover);
        return () => window.removeEventListener('resize', positionPopover);
    }, [open]);
    const releases = scope === 'installed' ? installed : catalogue;
    const rows = getInstallEditorRows({
        show: 'all',
        channel,
        search,
        availableReleases: releases.filter((release) => !release.prerelease),
        availablePrereleases: releases.filter((release) => release.prerelease),
    });
    /** Names the selected template edition.
     * @param asset - Official template asset.
     */
    const edition = (asset: ExportTemplateAsset) =>
        t(`editions.${asset.flavor === 'dotnet' ? 'dotnet' : 'standard'}`);
    return (
        <div className="shrink-0">
            <span
                id={`${id}-label`}
                className="mb-1 block text-sm font-semibold"
            >
                {t('picker.version')}
            </span>
            <button
                ref={trigger}
                type="button"
                className="select select-sm flex w-full items-center justify-between gap-2 text-left text-base"
                popoverTarget={id}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-labelledby={`${id}-label ${id}-value`}
                data-testid="templateVersionPicker"
            >
                <span id={`${id}-value`} className="min-w-0 flex-1 truncate">
                    {selection
                        ? `${selection.release.version} · ${edition(selection.asset)}`
                        : t('picker.chooseVersion')}
                </span>
            </button>
            <div
                ref={popover}
                id={id}
                popover="auto"
                role="dialog"
                aria-labelledby={`${id}-label`}
                onToggle={(event) => setOpen(event.newState === 'open')}
                className="fixed inset-auto m-0 flex-col overflow-hidden rounded-md border border-base-content/20 bg-base-100 p-3 text-base shadow-md"
                style={position}
                data-testid="templateVersionPopover"
            >
                <div
                    className="flex flex-col gap-3"
                    style={{ maxHeight: position.maxHeight - 24 }}
                >
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <fieldset
                            className="tabs tabs-box tabs-sm shrink-0 self-start"
                            aria-label={t('installEditor:filters.show')}
                        >
                            {(['installed', 'all'] as const).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={`tab text-base ${scope === value ? 'tab-active' : ''}`}
                                    aria-pressed={scope === value}
                                    onClick={() => setScope(value)}
                                >
                                    {value === 'installed'
                                        ? t('installedEditors')
                                        : t('installEditor:filters.all')}
                                </button>
                            ))}
                        </fieldset>
                        <fieldset
                            className="tabs tabs-box tabs-sm shrink-0 self-start"
                            aria-label={t('installEditor:filters.channel')}
                        >
                            {(['stable', 'prerelease'] as const).map(
                                (value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={`tab text-base ${channel === value ? 'tab-active' : ''}`}
                                        aria-pressed={channel === value}
                                        onClick={() => setChannel(value)}
                                    >
                                        {value === 'stable'
                                            ? t('installEditor:filters.stable')
                                            : t(
                                                  'installEditor:tabs.prerelease',
                                              )}
                                    </button>
                                ),
                            )}
                        </fieldset>
                    </div>
                    <SearchField
                        value={search}
                        onChange={setSearch}
                        placeholder={t('installEditor:search.placeholder')}
                        clearLabel={t('installs:search.clear')}
                        className="w-full"
                    />
                    {hasError && <p role="alert">{t('catalogueError')}</p>}
                    <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain pl-1 pr-3">
                        {groupEditorsByBaseVersion(rows).map((group) => (
                            <div
                                key={group.baseVersion ?? 'other'}
                                className="space-y-1"
                            >
                                <p className="px-3 py-1 text-sm font-semibold text-base-content/60">
                                    {group.baseVersion}
                                </p>
                                {group.items.flatMap(
                                    (release) =>
                                        release.templateAssets?.map((asset) => (
                                            <button
                                                key={asset.id}
                                                type="button"
                                                className={clsx(
                                                    'btn h-auto min-h-10 w-full justify-start gap-3 rounded-md px-3 py-2 text-left text-base font-normal',
                                                    selection?.asset.id ===
                                                        asset.id
                                                        ? 'btn-soft btn-primary bg-primary/10 hover:bg-primary/20 hover:text-primary hover:border-transparent hover:shadow-none focus-visible:text-primary'
                                                        : 'btn-ghost hover:bg-base-content/5',
                                                )}
                                                aria-label={`${release.version} ${edition(asset)}`}
                                                aria-pressed={
                                                    selection?.asset.id ===
                                                    asset.id
                                                }
                                                onClick={() => {
                                                    onChange({
                                                        release,
                                                        asset,
                                                    });
                                                    popover.current?.hidePopover();
                                                    trigger.current?.focus();
                                                }}
                                            >
                                                <FileOutput
                                                    size={16}
                                                    className="shrink-0 text-base-content/60"
                                                    aria-hidden="true"
                                                />
                                                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                                                    <span className="truncate font-semibold">
                                                        {release.version}
                                                    </span>
                                                    <span className="shrink-0 text-sm font-normal text-base-content/60">
                                                        {edition(asset)}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 text-primary">
                                                    {selection?.asset.id ===
                                                        asset.id && (
                                                        <Check
                                                            size={16}
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                </span>
                                                {sets.some(
                                                    (set) =>
                                                        set.id ===
                                                        `${release.tag.replace('-', '.')}${asset.flavor === 'dotnet' ? '.mono' : ''}`,
                                                ) && (
                                                    <span className="badge badge-sm badge-soft badge-success ml-auto whitespace-nowrap text-sm font-normal">
                                                        {t('picker.local')}
                                                    </span>
                                                )}
                                            </button>
                                        )) ?? [],
                                )}
                            </div>
                        ))}
                        {!rows.length && (
                            <p role="status" className="p-4 text-center">
                                {loading && !catalogue.length
                                    ? t('loading')
                                    : t('noMatches')}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
