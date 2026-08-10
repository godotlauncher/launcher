import type {
    EditorCatalogQuery,
    EditorCatalogResult,
    GetEditorCatalogOptions,
} from '@shared/contracts';
import { useCallback } from 'react';
import { editorCatalogBridge } from '../bridge.ts';

/** Catalog operations used by renderer state owners. */
export type EditorCatalogHook = {
    getCatalog: (
        options?: GetEditorCatalogOptions,
    ) => Promise<EditorCatalogResult>;
    refreshCatalog: (
        query?: EditorCatalogQuery,
    ) => Promise<EditorCatalogResult>;
};

/**
 * Provides stable functions for the editor catalog bridge.
 *
 * @returns The editor catalog bridge operations.
 */
export function useEditorCatalog(): EditorCatalogHook {
    const getCatalog = useCallback(
        (options?: GetEditorCatalogOptions) =>
            editorCatalogBridge.getCatalog(options),
        [],
    );
    const refreshCatalog = useCallback(
        (query?: EditorCatalogQuery) =>
            editorCatalogBridge.refreshCatalog(query),
        [],
    );

    return { getCatalog, refreshCatalog };
}
