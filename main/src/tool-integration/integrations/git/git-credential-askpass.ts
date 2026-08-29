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
const invocationIssue = getInvocationIssue(port, sessionRef, prompt);

if (invocationIssue) {
    process.stderr.write(
        `Godot Launcher Git credential helper rejected ${invocationIssue}.\n`,
    );
    process.exitCode = 1;
} else {
    requestCredential(port, sessionRef, kind)
        .then((credential) => {
            process.stdout.write(`${credential}\n`);
        })
        .catch(() => {
            process.stderr.write(
                'Godot Launcher Git credential helper could not reach its credential session.\n',
            );
            process.exitCode = 1;
        });
}

type GitCredentialInvocationIssue =
    | 'an invalid port'
    | 'an invalid prompt'
    | 'an invalid session reference';

/**
 * Identifies an invalid askpass invocation without exposing supplied values.
 *
 * @param targetPort - Parsed loopback credential service port.
 * @param targetSessionRef - Opaque one-operation session reference.
 * @param targetPrompt - Prompt supplied by Git.
 * @returns A credential-safe diagnostic, or null for a valid invocation.
 */
function getInvocationIssue(
    targetPort: number,
    targetSessionRef: string,
    targetPrompt: string | undefined,
): GitCredentialInvocationIssue | null {
    if (
        !Number.isInteger(targetPort) ||
        targetPort < 1 ||
        targetPort > 65_535
    ) {
        return 'an invalid port';
    }
    if (!targetPrompt || targetPrompt.length > 1_024) {
        return 'an invalid prompt';
    }
    if (!/^[A-Za-z0-9_-]{43}$/u.test(targetSessionRef)) {
        return 'an invalid session reference';
    }
    return null;
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
