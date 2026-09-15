import type { EditorCatalogRelease } from '@shared/contracts';
import clsx from 'clsx';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EditorVersionGroup } from '../../../components/editor-version-group.component';
import { groupEditorsByBaseVersion } from '../../../editor-version-group.model';
import { formatTemplateBytes } from '../template-format.util';

type TemplateCatalogueProps = {
    installedOnly: boolean;
    releases: EditorCatalogRelease[];
    busy: boolean;
    onDownload: (releaseId: string, assetId: string) => void;
};

/** Renders matching template versions in the shared grouped catalogue layout.
 * @param props - Matching releases, edition visibility and download action.
 */
export function TemplateCatalogue({
    installedOnly,
    releases,
    busy,
    onDownload,
}: TemplateCatalogueProps) {
    return (
        <div
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pb-2 pr-3"
            data-testid="templateCatalogueList"
        >
            {groupEditorsByBaseVersion(releases).map((group) => (
                <EditorVersionGroup
                    key={group.baseVersion}
                    title={group.baseVersion ?? ''}
                    count={group.items.length}
                    headingLevel="h3"
                >
                    {group.items.map((release) => (
                        <TemplateReleaseRow
                            key={release.id}
                            release={release}
                            installedOnly={installedOnly}
                            busy={busy}
                            onDownload={onDownload}
                        />
                    ))}
                </EditorVersionGroup>
            ))}
        </div>
    );
}

type TemplateReleaseRowProps = {
    installedOnly: boolean;
    release: EditorCatalogRelease;
    busy: boolean;
    onDownload: (releaseId: string, assetId: string) => void;
};

/** Renders a version with separate package actions and sizes for each edition.
 * @param props - Release metadata, operation availability and download action.
 */
function TemplateReleaseRow({
    installedOnly,
    release,
    busy,
    onDownload,
}: TemplateReleaseRowProps) {
    const { t, i18n } = useTranslation(['exportTemplates', 'installEditor']);
    return (
        <article
            aria-label={release.version}
            className="flex min-h-14 flex-col items-stretch gap-3 px-3 py-3 hover:bg-base-content/5 sm:flex-row sm:items-center"
        >
            <div className="flex min-w-0 flex-1 flex-col items-start">
                <span className="truncate font-semibold">
                    {release.version}
                </span>
                {release.publishedAt && (
                    <span className="text-sm text-base-content/60">
                        {release.publishedAt.split('T')[0]}
                    </span>
                )}
            </div>
            <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
                {(['gdscript', 'dotnet'] as const).map((flavor) => {
                    const asset = release.templateAssets?.find(
                        (item) => item.flavor === flavor,
                    );
                    if (installedOnly && !asset) return null;
                    const edition = t(
                        `editions.${flavor === 'dotnet' ? 'dotnet' : 'standard'}`,
                    );
                    return (
                        <div
                            key={flavor}
                            className="flex w-56 flex-col items-center gap-1"
                        >
                            <button
                                type="button"
                                className={clsx(
                                    'btn w-full justify-center text-base',
                                    {
                                        'btn-outline btn-primary border-primary/80 hover:bg-primary/20 hover:text-primary':
                                            asset,
                                        'btn-ghost text-base-content/50':
                                            !asset,
                                    },
                                )}
                                disabled={busy || !asset}
                                aria-label={`${t('download')} ${release.version} ${edition}`}
                                onClick={() => {
                                    if (asset) onDownload(release.id, asset.id);
                                }}
                            >
                                <Download size={16} aria-hidden="true" />
                                <span className="truncate">{edition}</span>
                            </button>
                            <span className="min-h-5 text-sm text-base-content/60">
                                {!asset
                                    ? t(
                                          'installEditor:table.status.unavailable',
                                      )
                                    : asset.sizeBytes > 0
                                      ? formatTemplateBytes(
                                            asset.sizeBytes,
                                            i18n.language,
                                        )
                                      : null}
                            </span>
                        </div>
                    );
                })}
            </div>
        </article>
    );
}
