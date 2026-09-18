import type { ExportTemplateSet } from '@shared/contracts';
import {
    Download,
    FileOutput,
    FolderOpen,
    FolderSync,
    RefreshCw,
    Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { EditorVersionGroup } from '../components/editor-version-group.component';
import { ContentDivider } from '../components/ui/content-divider.component';
import { CopyBadge } from '../components/ui/copy-badge.component';
import { EmptyState } from '../components/ui/empty-state.component';
import { SearchField } from '../components/ui/search-field.component';
import { groupEditorsByBaseVersion } from '../editor-version-group.model';
import { TemplateDownloadDrawer } from './export-templates/components/template-download-drawer.component';
import { TemplateRemoveDialog } from './export-templates/components/template-remove-dialog.component';
import { TemplateSetRow } from './export-templates/components/template-set-row.component';
import { useExportTemplates } from './export-templates/hooks/export-templates.hook';
import { useTemplateMigration } from './export-templates/hooks/template-migration.hook';
import { formatTemplateBytes } from './export-templates/template-format.util';
import { getTemplateRowJobs } from './export-templates/template-jobs.model';

const editionOrder = { standard: 0, dotnet: 1, custom: 2 };

/** Renders the shared Godot template inventory and user-driven operations. */
export function ExportTemplatesView() {
    const { t, i18n } = useTranslation([
        'exportTemplates',
        'common',
        'installs',
    ]);
    const { inventory, jobs, error, pending, loading, busy, refresh, run } =
        useExportTemplates();
    const migration = useTemplateMigration();
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const [downloadOpen, setDownloadOpen] = useState(false);
    const [manageSet, setManageSet] = useState<ExportTemplateSet | null>(null);
    const [remove, setRemove] = useState<ExportTemplateSet | null>(null);
    useEffect(() => {
        const id = params.get('set');
        if (!id || !inventory) return;
        setManageSet(
            inventory.sets.find((set) => set.id === id) ?? {
                id,
                version: id.replace(/\.mono$/, ''),
                edition: id.endsWith('.mono') ? 'dotnet' : 'standard',
                sizeBytes: 0,
                fileCount: 0,
                platforms: [],
                projects: [],
            },
        );
        setDownloadOpen(true);
        setParams({}, { replace: true });
    }, [params, inventory, setParams]);
    /** Formats bytes for the active language.
     * @param value - Logical file size in bytes.
     */
    const bytes = (value: number) => formatTemplateBytes(value, i18n.language);
    /** Resolves known errors without exposing internal failure details.
     * @param value - Error returned by the bridge.
     */
    const errorText = (value: string) =>
        t(value.match(/exportTemplates:([\w.]+)/)?.[1] ?? 'errors.failed');
    const installedIds = new Set(inventory?.sets.map((set) => set.id));
    const items = new Map((inventory?.sets ?? []).map((set) => [set.id, set]));
    const jobsBySet = getTemplateRowJobs(jobs);
    for (const [id, job] of jobsBySet) {
        if (!items.has(id))
            items.set(id, {
                id,
                version: id.startsWith('job-')
                    ? t(
                          job.kind === 'migrate'
                              ? 'connect'
                              : job.kind === 'recover'
                                ? 'recovery'
                                : 'import',
                      )
                    : id.replace(/\.mono$/, ''),
                edition: id.endsWith('.mono') ? 'dotnet' : 'standard',
                sizeBytes: 0,
                fileCount: 0,
                platforms: [],
                projects: [],
            });
    }
    const recoveryBySet = new Map<string, string[]>();
    for (const id of inventory?.recoveries ?? []) {
        const affected = inventory?.recoverySets?.[id];
        const setId = affected?.[0] ?? `recovery-${id}`;
        recoveryBySet.set(setId, [...(recoveryBySet.get(setId) ?? []), id]);
        if (!items.has(setId))
            items.set(setId, {
                id: setId,
                version: affected?.length
                    ? setId.replace(/\.mono$/, '')
                    : t('recovery'),
                edition: setId.endsWith('.mono') ? 'dotnet' : 'custom',
                sizeBytes: 0,
                fileCount: 0,
                platforms: [],
                projects: [],
            });
    }
    const visible = [...items.values()].filter((set) =>
        set.id.toLowerCase().includes(search.toLowerCase()),
    );
    const groups = groupEditorsByBaseVersion(visible);
    return (
        <div
            className="flex h-full min-h-0 min-w-0 w-full flex-col gap-2 overflow-hidden p-1"
            data-testid="exportTemplatesView"
        >
            <div className="flex w-full shrink-0 flex-col gap-3">
                <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                        <h1 className="pl-3 text-[20px] font-semibold">
                            {t('title')}
                        </h1>
                        {inventory?.root && (
                            <CopyBadge
                                value={inventory.root}
                                label={t('common:buttons.copyPath')}
                                copiedLabel={t('common:success')}
                            />
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {migration.assessment?.pendingCount ||
                        jobs.some(
                            (job) =>
                                job.projectPath &&
                                job.kind === 'migrate' &&
                                !['complete', 'cancelled', 'error'].includes(
                                    job.stage,
                                ),
                        ) ? (
                            <button
                                type="button"
                                className="btn btn-ghost bg-base-content/5"
                                onClick={migration.open}
                            >
                                <FolderSync
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('migration.header', {
                                    number:
                                        migration.assessment?.pendingCount ?? 0,
                                })}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="btn btn-ghost bg-base-content/5"
                            disabled={pending}
                            onClick={() => void run({ type: 'import' })}
                        >
                            <Upload className="size-4" />
                            {t('import')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={pending}
                            onClick={() => {
                                setManageSet(null);
                                setDownloadOpen(true);
                            }}
                        >
                            <Download className="size-4" />
                            {t('download')}
                        </button>
                    </div>
                </header>
                <div className="flex justify-end">
                    <label className="sr-only" htmlFor="template-search">
                        {t('search')}
                    </label>
                    <SearchField
                        id="template-search"
                        value={search}
                        placeholder={t('search')}
                        clearLabel={t('installs:search.clear')}
                        onChange={setSearch}
                    />
                </div>
                <div
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pl-3"
                    data-testid="exportTemplatesToolbar"
                >
                    <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <div className="flex items-baseline gap-2">
                            <dt className="text-base-content/70">
                                {t('sets')}
                            </dt>
                            <dd className="font-semibold tabular-nums">
                                {inventory?.sets.length ?? 0}
                            </dd>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <dt className="text-base-content/70">
                                {t('installedSize')}
                            </dt>
                            <dd className="font-semibold tabular-nums">
                                {inventory?.sizeIncomplete
                                    ? t('sizeUnavailable')
                                    : bytes(inventory?.totalBytes ?? 0)}
                            </dd>
                        </div>
                    </dl>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="btn btn-ghost bg-base-content/5 btn-sm"
                            onClick={() => void run({ type: 'openFolder' })}
                        >
                            <FolderOpen className="size-4" />
                            {t('openFolder')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost bg-base-content/5 btn-sm"
                            disabled={loading || busy}
                            onClick={() => {
                                void refresh();
                                void migration.refresh();
                            }}
                        >
                            <RefreshCw className="size-4" />
                            {t('refresh')}
                        </button>
                    </div>
                </div>
            </div>
            <ContentDivider />
            <div
                className="min-h-0 flex-1 overflow-y-auto pb-4 pr-3"
                data-testid="exportTemplatesContent"
            >
                <div className="flex min-h-full flex-col gap-4">
                    {error && (
                        <div role="alert" className="alert alert-error">
                            <span>{errorText(error)}</span>
                        </div>
                    )}
                    {loading && <p role="status">{t('loading')}</p>}
                    {!loading && !busy && !visible.length && (
                        <EmptyState
                            icon={FileOutput}
                            heading={search ? t('noMatches') : t('empty')}
                            description={t('emptyDetail')}
                            primaryActionLabel={
                                search
                                    ? t('installs:search.clear')
                                    : t('download')
                            }
                            primaryActionPending={!search && busy}
                            onPrimaryAction={() =>
                                search ? setSearch('') : setDownloadOpen(true)
                            }
                        />
                    )}
                    <div className="space-y-4">
                        {groups.map(({ baseVersion, items: sets }) => (
                            <EditorVersionGroup
                                key={baseVersion ?? 'other'}
                                title={baseVersion ?? t('picker.additional')}
                                count={sets.length}
                                headingLevel="h2"
                            >
                                {sets
                                    .sort(
                                        (a, b) =>
                                            b.version.localeCompare(
                                                a.version,
                                                undefined,
                                                { numeric: true },
                                            ) ||
                                            editionOrder[a.edition] -
                                                editionOrder[b.edition],
                                    )
                                    .map((set) => (
                                        <TemplateSetRow
                                            key={set.id}
                                            set={set}
                                            installed={installedIds.has(set.id)}
                                            job={jobsBySet.get(set.id)}
                                            pending={pending}
                                            recovery={
                                                !!inventory?.recoveries.length
                                            }
                                            recoveryIds={
                                                recoveryBySet.get(set.id) ?? []
                                            }
                                            canRecover={
                                                !jobs.some(
                                                    (job) =>
                                                        ![
                                                            'queued',
                                                            'error',
                                                            'complete',
                                                            'cancelled',
                                                        ].includes(job.stage),
                                                )
                                            }
                                            run={run}
                                            onManage={() => {
                                                setManageSet(set);
                                                setDownloadOpen(true);
                                            }}
                                            onRemove={() => setRemove(set)}
                                        />
                                    ))}
                            </EditorVersionGroup>
                        ))}
                    </div>
                </div>
            </div>
            <TemplateDownloadDrawer
                open={downloadOpen}
                sets={inventory?.sets ?? []}
                manageSet={manageSet}
                onOpenChange={(open) => {
                    setDownloadOpen(open);
                    if (!open) setManageSet(null);
                }}
                onSave={(token, selected) =>
                    run({ type: 'savePackage', token, selected })
                }
            />
            {remove && (
                <TemplateRemoveDialog
                    remove={remove}
                    pending={pending}
                    onClose={() => setRemove(null)}
                    onRemove={(setId) => {
                        setRemove(null);
                        void run({ type: 'remove', setId });
                    }}
                />
            )}
        </div>
    );
}
