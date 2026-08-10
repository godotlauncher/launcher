import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    EditorCatalogBridge,
    EditorCatalogQuery,
    EditorCatalogRelease,
    EditorCatalogResult,
    GetEditorCatalogOptions,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorCatalogService } from './editor-catalog.service.js';

const EditorCatalogHandler = createIpcHandleTyped<EditorCatalogBridge>();

/** Handles catalog requests from the renderer. */
@BridgeController({ namespace: 'editorCatalog' })
export class EditorCatalogController implements EditorCatalogBridge {
    /**
     * Creates the catalog controller.
     *
     * @param service - The service that handles catalog work.
     */
    constructor(private readonly service: EditorCatalogService) {}

    /**
     * Gets catalog releases for the renderer.
     *
     * @param options - Optional refresh and filter settings.
     * @returns The matching releases and provider status.
     */
    @EditorCatalogHandler('getCatalog')
    getCatalog(
        options?: GetEditorCatalogOptions,
    ): Promise<EditorCatalogResult> {
        return this.service.getCatalog(options);
    }

    /**
     * Finds one catalog release by its ID.
     *
     * @param id - The exact release ID to find.
     * @returns The release, or null when it does not exist.
     */
    @EditorCatalogHandler('getReleaseById')
    getReleaseById(id: string): Promise<EditorCatalogRelease | null> {
        return this.service.getReleaseById(id);
    }

    /**
     * Refreshes the catalog and returns matching releases.
     *
     * @param query - Optional filters for the returned releases.
     * @returns The refreshed releases and provider status.
     */
    @EditorCatalogHandler('refreshCatalog')
    refreshCatalog(query?: EditorCatalogQuery): Promise<EditorCatalogResult> {
        return this.service.refreshCatalog(query);
    }
}
