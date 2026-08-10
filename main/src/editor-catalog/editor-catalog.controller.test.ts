import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

import { EditorCatalogController } from './editor-catalog.controller.js';
import type { EditorCatalogService } from './editor-catalog.service.js';

describe('EditorCatalogController', () => {
    it('delegates its bridge methods to the catalog service', async () => {
        const result = { releases: [], providers: [] };
        const service = {
            getCatalog: vi.fn(async () => result),
            getReleaseById: vi.fn(async () => null),
            refreshCatalog: vi.fn(async () => result),
        } as unknown as EditorCatalogService;
        const controller = new EditorCatalogController(service);

        await controller.getCatalog({ refreshIfStale: false });
        await controller.getReleaseById('official-stable:4.5-stable');
        await controller.refreshCatalog({ prerelease: false });

        expect(service.getCatalog).toHaveBeenCalledWith({
            refreshIfStale: false,
        });
        expect(service.getReleaseById).toHaveBeenCalledWith(
            'official-stable:4.5-stable',
        );
        expect(service.refreshCatalog).toHaveBeenCalledWith({
            prerelease: false,
        });
    });
});
