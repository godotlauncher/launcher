import type { ProjectTag, ProjectTagsSnapshot } from '@shared/contracts';
import { JsonFileStore } from '../json-store/json-file.store.js';
import type { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';

/** Normalises persisted tag state without changing project files. */
export function normaliseProjectTags(value: unknown): ProjectTagsSnapshot {
    const source =
        value && typeof value === 'object'
            ? (value as Record<string, unknown>)
            : {};
    const tags: ProjectTag[] = [];
    const ids = new Set<string>();
    const names = new Set<string>();

    if (Array.isArray(source.tags)) {
        for (const candidate of source.tags) {
            if (!candidate || typeof candidate !== 'object') continue;
            const tag = candidate as Record<string, unknown>;
            if (
                typeof tag.id !== 'string' ||
                !tag.id.trim() ||
                typeof tag.name !== 'string'
            )
                continue;
            const name = tag.name.trim();
            const key = name.toLowerCase();
            if (!name || ids.has(tag.id) || names.has(key)) continue;
            if (
                !Number.isInteger(tag.colour) ||
                (tag.colour as number) < 0 ||
                (tag.colour as number) > 29
            )
                continue;
            tags.push({ id: tag.id, name, colour: tag.colour as number });
            ids.add(tag.id);
            names.add(key);
        }
    }

    const assignments: Record<string, string[]> = {};
    if (
        source.assignments &&
        typeof source.assignments === 'object' &&
        !Array.isArray(source.assignments)
    ) {
        for (const [projectPath, assigned] of Object.entries(
            source.assignments,
        )) {
            if (!projectPath || !Array.isArray(assigned)) continue;
            const unique = [
                ...new Set(
                    assigned.filter(
                        (id): id is string =>
                            typeof id === 'string' && ids.has(id),
                    ),
                ),
            ];
            if (unique.length)
                Object.defineProperty(assignments, projectPath, {
                    value: unique,
                    enumerable: true,
                    writable: true,
                    configurable: true,
                });
        }
    }
    return { tags, assignments };
}

/** Owns the atomic project-tag catalogue and assignments JSON file. */
export class ProjectTagStore extends JsonFileStore<ProjectTagsSnapshot> {
    /**
     * Creates a tag store at a path in the Launcher config directory.
     * @param coordinator - Serialised atomic JSON file operations.
     * @param filePath - Exact file path for the tag store.
     */
    constructor(coordinator: JsonStoreCoordinatorService, filePath: string) {
        super(coordinator, {
            pathProvider: () => filePath,
            defaultValue: () => ({ tags: [], assignments: {} }),
            parse: (raw) => normaliseProjectTags(JSON.parse(raw) as unknown),
            normalize: normaliseProjectTags,
        });
    }

    /** Gets the current catalogue and assignments. */
    async snapshot(): Promise<ProjectTagsSnapshot> {
        return (await this.readValue()).value;
    }

    /**
     * Updates the catalogue and assignments in one serialised atomic write.
     * @param mutator - Change against the latest stored snapshot.
     */
    async update(
        mutator: (
            current: ProjectTagsSnapshot,
        ) => ProjectTagsSnapshot | Promise<ProjectTagsSnapshot>,
    ): Promise<ProjectTagsSnapshot> {
        return (await this.updateValue(mutator)).value;
    }
}
