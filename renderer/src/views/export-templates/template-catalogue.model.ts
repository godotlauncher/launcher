import type { EditorCatalogRelease, InstalledRelease } from '@shared/contracts';
import { deduplicateEditorCatalogReleases } from '../../hooks/editor-catalog-release.mapper';

/** Chooses one coherent downloadable release per version using the editor catalogue's provider preference.
 * @param catalogue - Raw releases, including versions shared by multiple providers.
 * @returns Unique template releases with their original release and asset identifiers.
 */
export function getTemplateCatalogueReleases(
    catalogue: EditorCatalogRelease[],
): EditorCatalogRelease[] {
    return deduplicateEditorCatalogReleases(
        catalogue.filter((release) => release.templateAssets?.length),
    ).map((release) => ({
        ...release,
        prerelease: release.versionParts.channel !== 'stable',
    }));
}

/** Keeps packages matching valid installed official editor versions and editions.
 * @param catalogue - Available editor releases with template package metadata.
 * @param installedEditors - Registered editors, including custom and unavailable entries.
 * @returns Matching releases with only the installed editions' packages.
 */
export function getInstalledTemplateReleases(
    catalogue: EditorCatalogRelease[],
    installedEditors: Pick<
        InstalledRelease,
        'version' | 'mono' | 'valid' | 'source'
    >[],
): EditorCatalogRelease[] {
    const editionsByVersion = new Map<string, Set<string>>();
    for (const editor of installedEditors) {
        if (editor.source === 'custom' || editor.valid === false) continue;
        const editions =
            editionsByVersion.get(editor.version) ?? new Set<string>();
        editions.add(editor.mono ? 'dotnet' : 'gdscript');
        editionsByVersion.set(editor.version, editions);
    }
    return getTemplateCatalogueReleases(catalogue).flatMap((release) => {
        const editions = editionsByVersion.get(release.version);
        const templateAssets = release.templateAssets?.filter((asset) =>
            editions?.has(asset.flavor),
        );
        return templateAssets?.length ? [{ ...release, templateAssets }] : [];
    });
}
