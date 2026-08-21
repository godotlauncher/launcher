import { get } from 'node:http';
import { describe, expect, it } from 'vitest';
import { GitHubAuthLoopbackListenerService } from './github-auth-loopback-listener.service.js';

describe('GitHubAuthLoopbackListenerService', () => {
    it('accepts sequential nonce-bound tickets and redirects without credentials', async () => {
        const service = new GitHubAuthLoopbackListenerService();
        const controller = new AbortController();
        const nonce = 'n'.repeat(43);
        const oauthTicket = 'o'.repeat(38);
        const setupTicket = 's'.repeat(38);
        const listener = await service.start(nonce, true, controller.signal);
        const host = listener.descriptor.host === '::1' ? '[::1]' : '127.0.0.1';
        const oauthResponsePromise = request(
            `http://${host}:${listener.descriptor.port}/oauth/github/callback/${nonce}?ticket=${oauthTicket}`,
        );

        const oauthCompletion = await listener.waitForCompletion();
        expect(oauthCompletion.ticket).toBe(oauthTicket);
        oauthCompletion.respond(true);

        const oauthResponse = await oauthResponsePromise;
        expect(oauthResponse.status).toBe(302);
        expect(oauthResponse.location).toBe(
            'http://127.0.0.1:8787/v1/oauth/github/complete',
        );
        expect(oauthResponse.location).not.toContain(oauthTicket);

        const setupResponsePromise = request(
            `http://${host}:${listener.descriptor.port}/oauth/github/callback/${nonce}?ticket=${setupTicket}`,
        );
        const setupCompletion = await listener.waitForCompletion();
        expect(setupCompletion.ticket).toBe(setupTicket);
        setupCompletion.respond(true);

        const setupResponse = await setupResponsePromise;
        expect(setupResponse.status).toBe(302);
        expect(setupResponse.location).toBe(
            'http://127.0.0.1:8787/v1/oauth/github/complete',
        );
        expect(setupResponse.location).not.toContain(setupTicket);
        await listener.close();
    });
});

/** Sends one loopback request without following redirects. */
function request(
    url: string,
): Promise<{ status: number | undefined; location: string | undefined }> {
    return new Promise((resolve, reject) => {
        get(url, (response) => {
            response.resume();
            response.on('end', () =>
                resolve({
                    status: response.statusCode,
                    location: response.headers.location,
                }),
            );
        }).on('error', reject);
    });
}
