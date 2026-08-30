import { requestGitCredential } from './git-credential-client.util.js';
import {
    getGitCredentialHelperInputLimit,
    parseGitCredentialHelperOperation,
    parseGitCredentialHelperTarget,
} from './git-credential-helper.util.js';
import { createBoundGitCredentialRequest } from './git-credential-protocol.util.js';

const port = Number.parseInt(
    process.env.GODOT_LAUNCHER_GIT_CREDENTIAL_PORT ?? '',
    10,
);
const sessionRef = process.env.GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION ?? '';
const operation = parseGitCredentialHelperOperation(
    process.argv.length === 3 ? process.argv[2] : undefined,
);

run().catch(() => {
    process.exitCode = 1;
});

/** Runs one bounded, non-persisting Git credential-helper operation. */
async function run(): Promise<void> {
    if (!operation || !isInvocationValid(port, sessionRef)) {
        throw new Error('Git credential helper invocation is invalid');
    }
    const input = await readInput();
    if (operation !== 'get') {
        return;
    }
    const target = parseGitCredentialHelperTarget(input);
    if (!target) {
        throw new Error('Git credential helper target is invalid');
    }
    const username = await requestGitCredential(
        port,
        createBoundGitCredentialRequest(sessionRef, 'username', target),
    );
    const password = await requestGitCredential(
        port,
        createBoundGitCredentialRequest(sessionRef, 'password', target),
    );
    process.stdout.write(`username=${username}\npassword=${password}\n\n`);
}

/** Reads bounded helper input without retaining an unbounded credential body. */
function readInput(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let length = 0;
        process.stdin.on('data', (chunk: Buffer) => {
            length += chunk.length;
            if (length > getGitCredentialHelperInputLimit()) {
                reject(new Error('Git credential helper input is too large'));
                process.stdin.destroy();
                return;
            }
            chunks.push(chunk);
        });
        process.stdin.once('end', () => resolve(Buffer.concat(chunks, length)));
        process.stdin.once('error', reject);
    });
}

/**
 * Returns whether loopback routing values match the private protocol shape.
 *
 * @param targetPort - Parsed loopback credential service port.
 * @param targetSessionRef - Opaque one-operation session reference.
 * @returns Whether both routing values are valid.
 */
function isInvocationValid(
    targetPort: number,
    targetSessionRef: string,
): boolean {
    return (
        Number.isInteger(targetPort) &&
        targetPort >= 1 &&
        targetPort <= 65_535 &&
        /^[A-Za-z0-9_-]{43}$/u.test(targetSessionRef)
    );
}
