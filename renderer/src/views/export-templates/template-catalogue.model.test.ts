import type { EditorCatalogRelease } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    getInstalledTemplateReleases,
    getTemplateCatalogueReleases,
} from './template-catalogue.model';

/** Creates a catalogue release with both template editions.
 * @param version - Exact catalogue version to match against installations.
 */
function release(version: string): EditorCatalogRelease {
    return {
        id: version,
        sourceReleaseId: version,
        providerId: 'official-stable',
        tag: version,
        version,
        baseVersion: '4.7',
        name: version,
        publishedAt: null,
        prerelease: false,
        versionParts: {
            major: 4,
            minor: 7,
            patch: 0,
            channel: 'stable',
            iteration: 0,
        },
        variants: [],
        templateAssets: (['gdscript', 'dotnet'] as const).map((flavor) => ({
            id: `${version}:${flavor}`,
            flavor,
            name: `${flavor}.tpz`,
            downloadUrl: `https://example.invalid/${flavor}.tpz`,
            sizeBytes: 100,
        })),
    };
}

describe('installed editor template packages', () => {
    it('deduplicates overlapping feeds before filtering installed editions, in either provider order', () => {
        const preferred = release('4.7-stable');
        const fallback = {
            ...preferred,
            id: 'builds:4.7-stable',
            providerId: 'official-prerelease' as const,
            prerelease: true,
            templateAssets: preferred.templateAssets?.map((asset) => ({
                ...asset,
                id: `builds:${asset.id}`,
            })),
        };
        for (const catalogue of [
            [fallback, preferred],
            [preferred, fallback],
        ]) {
            const all = getTemplateCatalogueReleases(catalogue);
            expect(all).toEqual([preferred]);
            const installed = getInstalledTemplateReleases(catalogue, [
                { version: '4.7-stable', mono: true, valid: true },
            ]);
            expect(installed).toHaveLength(1);
            expect(installed[0].id).toBe(preferred.id);
            expect(
                installed[0].templateAssets?.map((asset) => asset.id),
            ).toEqual(['4.7-stable:dotnet']);
        }
    });

    it('uses a downloadable fallback when the preferred provider has no template packages', () => {
        const preferred = { ...release('4.7-stable'), templateAssets: [] };
        const fallback = {
            ...release('4.7-stable'),
            id: 'builds',
            providerId: 'official-prerelease' as const,
            prerelease: true,
        };
        expect(getTemplateCatalogueReleases([preferred, fallback])).toEqual([
            { ...fallback, prerelease: false },
        ]);
    });

    it('keeps a coherent prerelease provider package set and distinct patch versions', () => {
        const stable = release('4.7-stable');
        const prerelease = {
            ...release('4.8-beta1'),
            prerelease: true,
            versionParts: {
                ...stable.versionParts,
                minor: 8,
                channel: 'beta',
                iteration: 1,
            },
        };
        const preferred = {
            ...prerelease,
            id: 'builds:beta',
            providerId: 'official-prerelease' as const,
        };
        const rows = getTemplateCatalogueReleases([
            prerelease,
            stable,
            preferred,
            release('4.7.1-stable'),
        ]);
        expect(rows.map((item) => item.id)).toEqual([
            'builds:beta',
            '4.7-stable',
            '4.7.1-stable',
        ]);
    });

    it('matches exact versions and editions without changing the full catalogue', () => {
        const catalogue = [release('4.7-stable'), release('4.7.1-stable')];
        const rows = getInstalledTemplateReleases(catalogue, [
            { version: '4.7-stable', mono: true, valid: true },
        ]);
        expect(rows.map((item) => item.version)).toEqual(['4.7-stable']);
        expect(rows[0].templateAssets?.map((asset) => asset.id)).toEqual([
            '4.7-stable:dotnet',
        ]);
        expect(catalogue[0].templateAssets).toHaveLength(2);
    });

    it('includes both installed editions once, including legacy official records', () => {
        const rows = getInstalledTemplateReleases(
            [release('4.7-stable')],
            [
                { version: '4.7-stable', mono: false, valid: true },
                {
                    version: '4.7-stable',
                    mono: true,
                    valid: true,
                    source: 'official',
                },
                { version: '4.7-stable', mono: true, valid: true },
            ],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].templateAssets?.map((asset) => asset.flavor)).toEqual([
            'gdscript',
            'dotnet',
        ]);
    });

    it('excludes custom and unavailable editors even if the version matches', () => {
        expect(
            getInstalledTemplateReleases(
                [release('4.7-stable')],
                [
                    {
                        version: '4.7-stable',
                        mono: false,
                        valid: true,
                        source: 'custom',
                    },
                    {
                        version: '4.7-stable',
                        mono: true,
                        valid: false,
                        source: 'official',
                    },
                ],
            ),
        ).toEqual([]);
    });

    it('requires a downloadable package for the installed edition', () => {
        const standard = release('4.7-stable');
        standard.templateAssets = standard.templateAssets?.filter(
            (asset) => asset.flavor === 'gdscript',
        );
        expect(
            getInstalledTemplateReleases(
                [standard],
                [{ version: '4.7-stable', mono: true, valid: true }],
            ),
        ).toEqual([]);
        expect(getInstalledTemplateReleases([standard], [])).toEqual([]);
    });
});
