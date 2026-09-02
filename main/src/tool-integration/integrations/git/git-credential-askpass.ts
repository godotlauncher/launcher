import { requestGitCredential } from './git-credential-client.util.js';
import { createGitCredentialRequest } from './git-credential-protocol.util.js';

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
    requestGitCredential(port, createGitCredentialRequest(sessionRef, kind))
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
