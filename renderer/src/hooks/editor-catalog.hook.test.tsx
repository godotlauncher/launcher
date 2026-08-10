import type { EditorCatalogResult } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorCatalog } from './editor-catalog.hook.ts';

const emptyCatalog: EditorCatalogResult = {
    releases: [],
    providers: [],
};

type TestElectronApi = {
    'editorCatalog.getCatalog': () => Promise<EditorCatalogResult>;
    'editorCatalog.refreshCatalog': () => Promise<EditorCatalogResult>;
};

describe('useEditorCatalog', () => {
    const getCatalog = vi.fn(async () => emptyCatalog);
    const refreshCatalog = vi.fn(async () => emptyCatalog);

    beforeEach(() => {
        vi.clearAllMocks();
        (
            globalThis as unknown as {
                window: { electron: TestElectronApi };
            }
        ).window = {
            electron: {
                'editorCatalog.getCatalog': getCatalog,
                'editorCatalog.refreshCatalog': refreshCatalog,
            },
        };
    });

    /**
     * Renders the hook and returns its captured value.
     *
     * @returns The rendered catalog hook.
     */
    function renderHook(): ReturnType<typeof useEditorCatalog> {
        let captured: ReturnType<typeof useEditorCatalog> | undefined;

        /** Captures the hook value during server rendering. */
        const Capture = () => {
            captured = useEditorCatalog();
            return null;
        };

        renderToStaticMarkup(<Capture />);

        if (!captured) {
            throw new Error('Hook was not rendered');
        }
        return captured;
    }

    it('delegates catalog reads and refreshes to its bridge', async () => {
        const hook = renderHook();

        await expect(
            hook.getCatalog({ refreshIfStale: false }),
        ).resolves.toEqual(emptyCatalog);
        await expect(
            hook.refreshCatalog({ platform: 'linux' }),
        ).resolves.toEqual(emptyCatalog);

        expect(getCatalog).toHaveBeenCalledWith({ refreshIfStale: false });
        expect(refreshCatalog).toHaveBeenCalledWith({ platform: 'linux' });
    });
});
