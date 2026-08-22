import net from 'node:net';
import {
    createGitCredentialRequest,
    getGitCredentialResponseLimit,
    parseGitCredentialResponse,
} from './git-credential-protocol.util.js';

const port = Number.parseInt(
    process.env.GODOT_LAUNCHER_GIT_CREDENTIAL_PORT ?? '',
    10,
);
const sessionRef = process.env.GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION ?? '';
const prompt = process.argv.length === 3 ? process.argv[2] : undefined;
const kind = /username/iu.test(prompt ?? '') ? 'username' : 'password';

if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    !prompt ||
    prompt.length > 1_024 ||
    !/^[A-Za-z0-9_-]{43}$/u.test(sessionRef)
) {
    process.exitCode = 1;
} else {
    requestCredential(port, sessionRef, kind)
        .then((credential) => {
            process.stdout.write(`${credential}\n`);
        })
        .catch(() => {
            process.exitCode = 1;
        });
}

/**
 * Requests one credential field from the attempt-owned loopback service.
 *
 * @param targetPort - Ephemeral loopback service port.
 * @param targetSessionRef - Opaque one-operation session reference.
 * @param targetKind - Credential field requested by Git.
 * @returns The credential value supplied directly to Git.
 */
function requestCredential(
    targetPort: number,
    targetSessionRef: string,
    targetKind: 'username' | 'password',
): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let length = 0;
        const socket = net.createConnection(
            { host: '127.0.0.1', port: targetPort },
            () => {
                socket.end(
                    createGitCredentialRequest(targetSessionRef, targetKind),
                );
            },
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
