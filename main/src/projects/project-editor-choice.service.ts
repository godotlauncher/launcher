import { Injectable } from '@mariodebono/di';
import type {
    EditorCatalogArchitecture,
    EditorCatalogPlatform,
    EditorCatalogRelease,
    InstalledRelease,
    ProjectEditorChoice,
    ProjectInferredEditorRequest,
    ReleaseSummary,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorCatalogService } from '../editor-catalog/editor-catalog.service.js';
import {
    getReleaseBaseVersion,
    getReleaseFlavor,
} from '../utils/projectLauncherConfig.utils.js';

/** Resolves safe editor choices for metadata-free project imports. */
@Injectable()
export class ProjectEditorChoiceService {
    /**
     * Creates the editor-choice resolver.
     *
     * @param editorCatalog - Current official editor catalogue.
     */
    constructor(private readonly editorCatalog: EditorCatalogService) {}

    /**
     * Returns eligible official and custom editors for one inferred request.
     *
     * @param request - Editor branch and flavour inferred from the project.
     * @param configVersion - Minimum supported Godot project format.
     * @param installedEditors - Current registered editor snapshot.
     * @returns Ordered choices with the recommended official editor first.
     */
    async getChoices(
        request: ProjectInferredEditorRequest,
        configVersion: number,
        installedEditors: InstalledRelease[],
    ): Promise<ProjectEditorChoice[]> {
        const installed = installedEditors.filter(
            (release) =>
                release.valid &&
                release.config_version >= configVersion &&
                getReleaseBaseVersion(release) === request.base_version &&
                getReleaseFlavor(release) === request.flavor &&
                release.platform === process.platform &&
                release.arch === process.arch,
        );
        const installedByIdentity = new Map(
            installed.map((release) => [
                getIdentity(release.version, release.mono),
                release,
            ]),
        );
        const catalogue = await this.editorCatalog.getCatalog({
            query: {
                flavor: request.flavor,
                platform: process.platform as EditorCatalogPlatform,
                architecture: process.arch as EditorCatalogArchitecture,
            },
        });
        const officialCatalogue = catalogue.releases.filter(
            (release) => release.baseVersion === request.base_version,
        );
        const stableCatalogue = officialCatalogue.filter(
            (release) => !release.prerelease,
        );
        const stableInstalled = installed.filter(
            (release) => release.source !== 'custom' && !release.prerelease,
        );
        const usePrerelease =
            stableCatalogue.length === 0 && stableInstalled.length === 0;
        const officialChoices = new Map<string, ProjectEditorChoice>();

        for (const release of installed
            .filter(
                (candidate) =>
                    candidate.source !== 'custom' &&
                    (usePrerelease
                        ? candidate.prerelease
                        : !candidate.prerelease),
            )
            .sort(compareEditorVersions)) {
            officialChoices.set(getIdentity(release.version, release.mono), {
                id: getInstalledChoiceId(release),
                version: release.version,
                name: release.name,
                source: 'official',
                flavor: request.flavor,
                prerelease: release.prerelease,
                installed: true,
                recommended: false,
            });
        }

        const selectedCatalogue = usePrerelease
            ? officialCatalogue.filter((release) => release.prerelease)
            : stableCatalogue;
        for (const release of selectedCatalogue) {
            const identity = getIdentity(
                release.version,
                request.flavor === 'dotnet',
            );
            const collision = installedByIdentity.get(identity);
            if (
                collision?.source === 'custom' ||
                officialChoices.has(identity)
            ) {
                continue;
            }
            officialChoices.set(identity, {
                id: `catalog:${release.id}:${request.flavor}`,
                version: release.version,
                name: release.name,
                source: 'official',
                flavor: request.flavor,
                prerelease: release.prerelease,
                installed: false,
                recommended: false,
                release: mapCatalogueRelease(release, request.flavor),
            });
        }

        const orderedOfficial = [...officialChoices.values()].sort(
            compareEditorVersions,
        );
        if (usePrerelease) {
            orderedOfficial.splice(1);
        }
        if (orderedOfficial[0]) {
            orderedOfficial[0] = { ...orderedOfficial[0], recommended: true };
        }
        const customChoices = installed
            .filter((release) => release.source === 'custom')
            .sort(compareEditorVersions)
            .map<ProjectEditorChoice>((release) => ({
                id: getInstalledChoiceId(release),
                version: release.version,
                name: release.name,
                source: 'custom',
                flavor: request.flavor,
                prerelease: release.prerelease,
                installed: true,
                recommended: false,
            }));

        return [...orderedOfficial, ...customChoices];
    }

    /**
     * Revalidates an installed editor choice using the current registry.
     *
     * @param choiceId - Opaque choice identifier returned to the renderer.
     * @param request - Inferred project editor request.
     * @param configVersion - Minimum supported Godot project format.
     * @param installedEditors - Current registered editor snapshot.
     * @returns The current matching editor, or undefined when stale or ineligible.
     */
    resolveInstalledChoice(
        choiceId: string,
        request: ProjectInferredEditorRequest,
        configVersion: number,
        installedEditors: InstalledRelease[],
    ): InstalledRelease | undefined {
        return installedEditors.find(
            (release) =>
                getInstalledChoiceId(release) === choiceId &&
                release.valid &&
                release.config_version >= configVersion &&
                getReleaseBaseVersion(release) === request.base_version &&
                getReleaseFlavor(release) === request.flavor &&
                release.platform === process.platform &&
                release.arch === process.arch,
        );
    }
}

/**
 * Returns the registry identity shared by official and custom editors.
 *
 * @param version - Exact editor version.
 * @param mono - Whether the editor uses the .NET flavour.
 * @returns The shared registry identity.
 */
function getIdentity(version: string, mono: boolean): string {
    return `${version}:${mono ? 'mono' : 'standard'}`;
}

/**
 * Returns an opaque renderer-safe ID for one installed editor.
 *
 * @param release - Installed editor to identify.
 * @returns A source-qualified choice ID without local paths.
 */
function getInstalledChoiceId(release: InstalledRelease): string {
    return `installed:${release.source ?? 'official'}:${getIdentity(release.version, release.mono)}`;
}

/**
 * Orders Godot stable, RC, beta, and development versions newest first.
 *
 * @param first - First editor version.
 * @param second - Second editor version.
 * @returns A negative number when the first version is newer.
 */
function compareEditorVersions(
    first: Pick<InstalledRelease, 'version'>,
    second: Pick<InstalledRelease, 'version'>,
): number {
    const firstParts = parseEditorVersion(first.version);
    const secondParts = parseEditorVersion(second.version);
    for (let index = 0; index < 4; index++) {
        if (firstParts.numbers[index] !== secondParts.numbers[index]) {
            return secondParts.numbers[index] - firstParts.numbers[index];
        }
    }
    if (firstParts.channel !== secondParts.channel) {
        return firstParts.channel - secondParts.channel;
    }
    return secondParts.iteration - firstParts.iteration;
}

/**
 * Parses the sortable parts of one Godot editor version.
 *
 * @param version - Godot editor version.
 * @returns Numeric version and channel ordering fields.
 */
function parseEditorVersion(version: string): {
    numbers: number[];
    channel: number;
    iteration: number;
} {
    const match = version.match(
        /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(stable|rc|beta|dev)(\d+)?)?/i,
    );
    const channelPriority: Record<string, number> = {
        stable: 0,
        rc: 1,
        beta: 2,
        dev: 3,
    };
    return {
        numbers: [1, 2, 3, 4].map((index) =>
            Number.parseInt(match?.[index] ?? '0', 10),
        ),
        channel: channelPriority[match?.[5]?.toLowerCase() ?? 'dev'] ?? 3,
        iteration: Number.parseInt(match?.[6] ?? '0', 10),
    };
}

/**
 * Converts one catalogue entry to the existing installer request shape.
 *
 * @param release - Official catalogue release.
 * @param flavor - Requested editor flavour.
 * @returns Installer metadata limited to the selected flavour.
 */
function mapCatalogueRelease(
    release: EditorCatalogRelease,
    flavor: 'gdscript' | 'dotnet',
): ReleaseSummary {
    return {
        tag: release.tag,
        version: release.version,
        version_number: Number.parseFloat(release.baseVersion),
        name: release.name,
        published_at: release.publishedAt,
        draft: false,
        prerelease: release.prerelease,
        assets: release.variants
            .filter((variant) => variant.flavor === flavor)
            .flatMap((variant) =>
                variant.assets.map((asset) => ({
                    name: asset.name,
                    download_url: asset.downloadUrl,
                    digest: asset.digest,
                    checksum_manifest_url: asset.checksumManifestUrl,
                    platform_tags: [asset.platform, asset.architecture],
                    mono: flavor === 'dotnet',
                })),
            ),
    };
}
