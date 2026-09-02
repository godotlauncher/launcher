import net from 'node:net';
import {
    getGitCredentialResponseLimit,
    parseGitCredentialResponse,
} from './git-credential-protocol.util.js';

/**
 * Requests one credential field from an attempt-owned loopback service.
 *
 * @param port - Ephemeral loopback credential service port.
 * @param request - Complete validated credential request frame.
 * @returns Credential text returned by the session.
 */
export function requestGitCredential(
    port: number,
    request: Buffer,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let length = 0;
        const socket = net.createConnection({ host: '127.0.0.1', port }, () =>
            socket.end(request),
        );
        socket.setTimeout(5_000, () => {
            socket.destroy(new Error('Credential request timed out'));
        });
        socket.on('data', (chunk: Buffer) => {
            length += chunk.length;
            if (length > getGitCredentialResponseLimit()) {
                socket.destroy(new Error('Credential response too large'));
                return;
            }
            chunks.push(chunk);
        });
        socket.once('end', () => {
            try {
                resolve(
                    parseGitCredentialResponse(Buffer.concat(chunks, length)),
                );
            } catch (error) {
                reject(error);
            }
        });
        socket.once('error', reject);
    });
}
