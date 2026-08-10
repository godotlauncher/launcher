import path from 'node:path';
import { JsonFileStore } from '../json-store/json-file.store.js';
import type { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import {
    createEmptyEditorCatalog,
    normalizeEditorCatalog,
} from './editor-catalog.schema.js';
import type {
    EditorCatalogFile,
    EditorCatalogModuleOptions,
} from './editor-catalog.types.js';

/** Stores the editor catalog in one JSON file. */
export class EditorCatalogStore extends JsonFileStore<EditorCatalogFile> {
    /**
     * Creates the catalog store.
     *
     * @param coordinator - The service that keeps JSON writes in order.
     * @param options - The directory and file name used by the store.
     */
    constructor(
        coordinator: JsonStoreCoordinatorService,
        options: EditorCatalogModuleOptions,
    ) {
        super(coordinator, {
            pathProvider: () =>
                path.resolve(options.directory, options.fileName),
            defaultValue: createEmptyEditorCatalog,
            parse: (raw) => normalizeEditorCatalog(JSON.parse(raw)),
            normalize: normalizeEditorCatalog,
        });
    }

    /**
     * Reads and normalizes the stored catalog.
     *
     * @returns The current normalized catalog.
     */
    async read(): Promise<EditorCatalogFile> {
        const current = await this.readValue();
        return (
            await this.replaceValue(current.value, {
                expectedVersion: current.version,
            })
        ).value;
    }

    /**
     * Replaces all stored catalog data.
     *
     * @param value - The complete catalog to store.
     * @returns The stored catalog.
     */
    async replace(value: EditorCatalogFile): Promise<EditorCatalogFile> {
        return (await this.replaceValue(value)).value;
    }

    /**
     * Updates the catalog while keeping writes in order.
     *
     * @param mutator - The function that creates the next catalog value.
     * @returns The updated catalog.
     */
    async update(
        mutator: (current: EditorCatalogFile) => EditorCatalogFile,
    ): Promise<EditorCatalogFile> {
        return (await this.updateValue(mutator)).value;
    }
}
