import { describe, expect, it, vi } from 'vitest';
import {
    GitHubJsonResponseError,
    readGitHubJsonResponse,
} from './github-json-response.util.js';

describe('readGitHubJsonResponse', () => {
    it('accepts valid JSON at the byte limit', async () => {
        const body = '{"ok":true}';

        await expect(
            readGitHubJsonResponse(new Response(body), body.length),
        ).resolves.toEqual({ ok: true });
    });

    it('rejects and cancels a streamed response above the byte limit', async () => {
        const cancel = vi.fn();
        const response = new Response(
            new ReadableStream({
                cancel,
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('{"value":"'));
                    controller.enqueue(new TextEncoder().encode('too large"}'));
                },
            }),
        );

        await expect(readGitHubJsonResponse(response, 10)).rejects.toThrow(
            GitHubJsonResponseError,
        );
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('uses streamed bytes when Content-Length is misleading', async () => {
        const response = new Response('{"value":"too large"}', {
            headers: { 'Content-Length': '2' },
        });

        await expect(readGitHubJsonResponse(response, 10)).rejects.toThrow(
            'GitHub returned an invalid response',
        );
    });

    it('rejects malformed JSON without exposing its content', async () => {
        const unsafeBody = 'secret-provider-body';

        await expect(
            readGitHubJsonResponse(new Response(unsafeBody), 64),
        ).rejects.toThrow('GitHub returned an invalid response');
        await expect(
            readGitHubJsonResponse(new Response(unsafeBody), 64),
        ).rejects.not.toThrow(unsafeBody);
    });
});
