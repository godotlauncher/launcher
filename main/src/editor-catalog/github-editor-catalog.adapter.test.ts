import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubEditorCatalogAdapter } from './github-editor-catalog.adapter.js';

vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(),
    },
}));

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('GithubEditorCatalogAdapter', () => {
    it('fetches and maps one provider page', async () => {
        const fetchMock = vi.fn(async () =>
            Response.json([
                {
                    id: 45,
                    name: 'Godot 4.5',
                    tag_name: '4.5-stable',
                    published_at: '2026-01-01T00:00:00.000Z',
                    draft: false,
                    prerelease: false,
                    assets: [
                        {
                            id: 1,
                            name: 'Godot_v4.5-stable_win64.exe.zip',
                            browser_download_url:
                                'https://example.com/windows.zip',
                        },
                    ],
                },
            ]),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await new GithubEditorCatalogAdapter().fetchProvider(
            'official-stable',
            null,
        );

        expect(result.releases).toHaveLength(1);
        expect(result.lastPublishedAt).toBe('2026-01-01T00:00:00.000Z');
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            '/godotengine/godot/releases',
        );
    });

    it('throws a useful response error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('rate limited', { status: 403 })),
        );

        await expect(
            new GithubEditorCatalogAdapter().fetchProvider(
                'official-stable',
                null,
            ),
        ).rejects.toThrow('Failed to fetch editor catalog: 403; rate limited');
    });
});
