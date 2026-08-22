import { randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net, { type Server, type Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Injectable } from '@mariodebono/di';
import { app } from 'electron';
import { isInstalledRuntime } from '../../../runtimeMode.js';
import { resolveWindowsGitAskPassExecutable } from './git-askpass-executable.util.js';
import {
    createGitCredentialResponse,
    getGitCredentialRequestLength,
    parseGitCredentialRequest,
} from './git-credential-protocol.util.js';

const CREDENTIAL_SOCKET_TIMEOUT_MS = 5_000;

export type GitCredentialSession = {
    environment: NodeJS.ProcessEnv;
    close: () => Promise<void>;
};

type GitCredential = {
    username: string;
    password: string;
};

type GitAskPassHandle = {
    executablePath: string;
    close: () => Promise<void>;
};

type GitCredentialServer = {
    server: Server;
    sockets: Set<Socket>;
};

@Injectable()
export class GitCredentialSessionService {
    /**
     * Opens one loopback credential session for a connected clone.
     *
     * @param credential - Provider-formatted one-operation Git credential.
     * @returns Opaque process environment and idempotent cleanup callback.
     */
    async open(credential: GitCredential): Promise<GitCredentialSession> {
        validateCredential(credential);
        const sessionRef = randomBytes(32).toString('base64url');
        const launcher = await createAskPassLauncher();
        let server: GitCredentialServer | undefined;
        try {
            server = await listenForCredential(sessionRef, credential);
            const address = server.server.address();
            if (!address || typeof address === 'string') {
                throw new Error('Credential service address is unavailable');
            }
            return createSession(launcher, server, sessionRef, address.port);
        } catch (error) {
            await closeServer(server);
            await launcher.close();
            throw error;
        }
    }

    /**
     * Creates a rejecting askpass environment for an anonymous clone.
     *
     * @returns Askpass environment with no credential session.
     */
    async openRejecting(): Promise<GitCredentialSession> {
        const launcher = await createAskPassLauncher();
        return {
            environment: {
                GIT_ASKPASS: launcher.executablePath,
                GIT_ASKPASS_REQUIRE: 'force',
            },
            close: launcher.close,
        };
    }
}

/** Creates the platform-specific askpass launcher. */
async function createAskPassLauncher(): Promise<GitAskPassHandle> {
    return process.platform === 'win32'
        ? createWindowsAskPassHandle()
        : createPosixAskPassLauncher();
}

/** Resolves the verified Windows executable without creating temporary files. */
async function createWindowsAskPassHandle(): Promise<GitAskPassHandle> {
    const appPath = app.getAppPath();
    const executablePath = await resolveWindowsGitAskPassExecutable({
        architecture: process.arch,
        isPackaged: isInstalledRuntime({
            isPackaged: app.isPackaged,
            appPath,
        }),
        appPath,
        resourcesPath: process.resourcesPath,
    });
    return {
        executablePath,
        close: async () => undefined,
    };
}

/** Creates an attempt-owned POSIX launcher containing no credential material. */
async function createPosixAskPassLauncher(): Promise<GitAskPassHandle> {
    const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'godot-launcher-git-askpass-'),
    );
    const executablePath = path.join(directory, 'askpass.sh');
    const helperPath = fileURLToPath(
        new URL('./git-credential-askpass.js', import.meta.url),
    );
    try {
        await fs.writeFile(
            executablePath,
            createPosixLauncher(process.execPath, helperPath),
            {
                encoding: 'utf8',
                mode: 0o700,
                flag: 'wx',
            },
        );
    } catch (error) {
        await fs.rm(directory, { recursive: true, force: true });
        throw error;
    }
    let closed = false;
    return {
        executablePath,
        close: async () => {
            if (closed) {
                return;
            }
            closed = true;
            await fs.rm(directory, { recursive: true, force: true });
        },
    };
}

/**
 * Builds a POSIX launcher containing no credential material.
 *
 * @param executable - Electron executable used as the Node runtime.
 * @param helper - Compiled Node askpass client path.
 * @returns Complete temporary shell launcher source.
 */
function createPosixLauncher(executable: string, helper: string): string {
    return `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quotePosix(executable)} ${quotePosix(helper)} "$@"\n`;
}

/**
 * Quotes one fixed POSIX shell argument.
 *
 * @param value - Fixed path to quote for the temporary shell launcher.
 * @returns Safely quoted shell argument.
 */
function quotePosix(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Validates provider credential fields before opening local resources.
 *
 * @param credential - Provider-formatted credential to validate.
 */
function validateCredential(credential: GitCredential): void {
    for (const value of [credential.username, credential.password]) {
        if (
            !value ||
            value.length > 4_096 ||
            Buffer.byteLength(value) > 8_192 ||
            [...value].some((character) => {
                const codePoint = character.codePointAt(0) ?? 0;
                return codePoint <= 31 || codePoint === 127;
            })
        ) {
            throw new Error('Git credential is invalid');
        }
    }
}

/**
 * Starts a loopback-only fixed-frame credential service.
 *
 * @param sessionRef - Opaque one-operation session reference.
 * @param credential - Provider-formatted credential kept in memory.
 * @returns Listening loopback server and its tracked sockets.
 */
function listenForCredential(
    sessionRef: string,
    credential: GitCredential,
): Promise<GitCredentialServer> {
    return new Promise((resolve, reject) => {
        const sockets = new Set<Socket>();
        const server = net.createServer((socket) => {
            sockets.add(socket);
            socket.setTimeout(CREDENTIAL_SOCKET_TIMEOUT_MS, () => {
                socket.destroy();
            });
            socket.once('close', () => sockets.delete(socket));
            socket.on('error', () => undefined);
            if (socket.remoteAddress !== '127.0.0.1') {
                socket.destroy();
                return;
            }
            const chunks: Buffer[] = [];
            let length = 0;
            socket.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
                length += chunk.length;
                if (length > getGitCredentialRequestLength()) {
                    socket.destroy();
                    return;
                }
                if (length < getGitCredentialRequestLength()) {
                    return;
                }
                socket.removeAllListeners('data');
                const request = parseGitCredentialRequest(
                    Buffer.concat(chunks, length),
                );
                const accepted =
                    request !== null &&
                    safeEqual(sessionRef, request.sessionRef);
                const response = createGitCredentialResponse(
                    accepted
                        ? request.kind === 'username'
                            ? credential.username
                            : credential.password
                        : null,
                );
                socket.once('close', () => response.fill(0));
                socket.end(response);
            });
        });
        server.once('error', reject);
        server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
            server.removeListener('error', reject);
            resolve({ server, sockets });
        });
    });
}

/**
 * Creates the environment and cleanup callback for an active session.
 *
 * @param launcher - Platform-specific askpass launcher.
 * @param server - Attempt-owned loopback credential server.
 * @param sessionRef - Opaque one-operation session reference.
 * @param port - Ephemeral loopback server port.
 * @returns Git process environment and idempotent cleanup callback.
 */
function createSession(
    launcher: GitAskPassHandle,
    server: GitCredentialServer,
    sessionRef: string,
    port: number,
): GitCredentialSession {
    let closed = false;
    return {
        environment: {
            GIT_ASKPASS: launcher.executablePath,
            GIT_ASKPASS_REQUIRE: 'force',
            GODOT_LAUNCHER_GIT_CREDENTIAL_PORT: String(port),
            GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION: sessionRef,
        },
        close: async () => {
            if (closed) {
                return;
            }
            closed = true;
            await closeServer(server);
            await launcher.close();
        },
    };
}

/**
 * Compares one supplied session reference without timing leakage.
 *
 * @param expected - Session reference created by the server.
 * @param supplied - Session reference supplied by the client.
 * @returns Whether both references match.
 */
function safeEqual(expected: string, supplied: string): boolean {
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    return (
        expectedBytes.length === suppliedBytes.length &&
        timingSafeEqual(expectedBytes, suppliedBytes)
    );
}

/**
 * Closes the credential server and every remaining loopback connection.
 *
 * @param credentialServer - Attempt-owned server, when listening succeeded.
 */
async function closeServer(
    credentialServer: GitCredentialServer | undefined,
): Promise<void> {
    if (!credentialServer) {
        return;
    }
    for (const socket of credentialServer.sockets) {
        socket.destroy();
    }
    await new Promise<void>((resolve) =>
        credentialServer.server.close(() => resolve()),
    );
}
