import type { InstalledRelease } from '@shared/contracts';
import logger from 'electron-log';
import { JsonFileStore } from '../json-store/json-file.store.js';
import type { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { getReleaseBaseVersion } from '../utils/projectLauncherConfig.utils.js';

type InstalledEditorIdentity = Pick<InstalledRelease, 'version' | 'mono'>;

/**
 * Returns the stable identity used for installed editors and install jobs.
 *
 * @param release - Installed editor identity fields.
 * @returns The stable editor identity.
 */
export function getInstalledEditorIdentity(
    release: InstalledEditorIdentity,
): string {
    return `${release.version}:${release.mono ? 'mono' : 'standard'}`;
}

/**
 * Checks whether two installed editors have the same version and flavour.
 *
 * @param first - First installed editor identity.
 * @param second - Second installed editor identity.
 * @returns Whether the identities match.
 */
export function hasSameInstalledEditorIdentity(
    first: InstalledEditorIdentity,
    second: InstalledEditorIdentity,
): boolean {
    return (
        getInstalledEditorIdentity(first) === getInstalledEditorIdentity(second)
    );
}

function normaliseInstalledEditors(
    releases: InstalledRelease[],
): InstalledRelease[] {
    const releasesByIdentity = new Map<string, InstalledRelease>();

    for (const release of releases) {
        const candidate: InstalledRelease = {
            ...release,
            valid: typeof release.valid === 'boolean' ? release.valid : true,
            base_version: getReleaseBaseVersion(release),
        };
        const identity = getInstalledEditorIdentity(candidate);
        const current = releasesByIdentity.get(identity);

        if (!current || current.valid === false || candidate.valid !== false) {
            releasesByIdentity.set(identity, candidate);
        }
    }

    return [...releasesByIdentity.values()].sort(
        (first, second) => first.version_number - second.version_number,
    );
}

function matchesStoredLocation(
    stored: InstalledRelease,
    release: InstalledRelease,
): boolean {
    if (release.editor_path) {
        return stored.editor_path === release.editor_path;
    }
    if (release.install_path) {
        return stored.install_path === release.install_path;
    }
    return true;
}

/** Owns atomic persistence for registered Godot editors. */
export class InstalledEditorStore extends JsonFileStore<InstalledRelease[]> {
    /**
     * Creates the installed-editor store.
     *
     * @param coordinator - Service that serialises atomic JSON operations.
     * @param filePath - Existing installed-releases JSON path.
     */
    constructor(coordinator: JsonStoreCoordinatorService, filePath: string) {
        super(coordinator, {
            pathProvider: () => filePath,
            defaultValue: () => [],
            parse: (raw) => {
                try {
                    const parsed = JSON.parse(raw) as unknown;
                    return Array.isArray(parsed)
                        ? (parsed as InstalledRelease[])
                        : [];
                } catch (error) {
                    logger.error('Failed to read installed releases', error);
                    return [];
                }
            },
            normalize: normaliseInstalledEditors,
        });
    }

    /** Gets all normalised installed editors. */
    async list(): Promise<InstalledRelease[]> {
        return (await this.readValue()).value;
    }

    /**
     * Adds or replaces one installed editor by identity.
     *
     * @param release - Installed editor to persist.
     */
    async put(release: InstalledRelease): Promise<InstalledRelease[]> {
        return (
            await this.updateValue((current) => [
                ...current.filter(
                    (candidate) =>
                        !hasSameInstalledEditorIdentity(candidate, release),
                ),
                release,
            ])
        ).value;
    }

    /**
     * Removes one installed editor with matching identity and location.
     *
     * @param release - Installed editor identity and location to remove.
     */
    async remove(release: InstalledRelease): Promise<InstalledRelease[]> {
        return (
            await this.updateValue((current) =>
                current.filter(
                    (candidate) =>
                        !(
                            hasSameInstalledEditorIdentity(
                                candidate,
                                release,
                            ) && matchesStoredLocation(candidate, release)
                        ),
                ),
            )
        ).value;
    }

    /**
     * Replaces all installed editors.
     *
     * @param releases - Complete installed editor list.
     */
    async replace(releases: InstalledRelease[]): Promise<InstalledRelease[]> {
        return (await this.replaceValue(releases)).value;
    }
}
