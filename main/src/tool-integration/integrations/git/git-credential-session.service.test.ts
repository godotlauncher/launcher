import { promises as fs } from 'node:fs';
import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createGitCredentialRequest,
    parseGitCredentialResponse,
} from './git-credential-protocol.util.js';

const mocks = vi.hoisted(() => ({
    getAppPath: vi.fn(() => '/workspace/launcher'),
    resolveWindowsExecutable: vi.fn(
        async () => 'C:\\launcher\\godot-launcher-git-askpass.exe',
    ),
}));

vi.mock('electron', () => ({
    app: {
        getAppPath: mocks.getAppPath,
        isPackaged: false,
    },
}));

vi.mock('./git-askpass-executable.util.js', () => ({
    resolveWindowsGitAskPassExecutable: mocks.resolveWindowsExecutable,
}));

import { GitCredentialSessionService } from './git-credential-session.service.js';

describe('GitCredentialSessionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps credentials out of the process environment', async () => {
        const service = new GitCredentialSessionService();
        const session = await service.open({
            username: 'x-access-token',
            password: 'secret-token',
        });

        expect(JSON.stringify(session.environment)).not.toContain(
            'secret-token',
        );
        expect(session.environment).toMatchObject({
            GIT_ASKPASS_REQUIRE: 'force',
        });
        expect(session.environment.GIT_ASKPASS).toMatch(/askpass\.sh$/u);
        await expect(
            requestCredential(session.environment, 'username'),
        ).resolves.toBe('x-access-token');
        await expect(
            requestCredential(session.environment, 'password'),
        ).resolves.toBe('secret-token');

        const launcherPath = session.environment.GIT_ASKPASS as string;
        await session.close();
        await session.close();
        await expect(fs.access(launcherPath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    it('rejects a request with the wrong session reference', async () => {
        const service = new GitCredentialSessionService();
        const session = await service.open({
            username: 'user',
            password: 'secret',
        });

        await expect(
            requestCredential(
                {
                    ...session.environment,
                    GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION: 'B'.repeat(43),
                },
                'password',
            ),
        ).rejects.toThrow('Git credential response is invalid');
        await session.close();
    });

    it('rejects invalid credentials before opening resources', async () => {
        const service = new GitCredentialSessionService();

        await expect(
            service.open({ username: 'user', password: 'secret\nvalue' }),
        ).rejects.toThrow('Git credential is invalid');
        await expect(
            service.open({ username: 'user', password: '€'.repeat(2_731) }),
        ).rejects.toThrow('Git credential is invalid');
    });

    it('accepts a valid request delivered in separate TCP chunks', async () => {
        const service = new GitCredentialSessionService();
        const session = await service.open({
            username: 'user',
            password: 'secret',
        });

        await expect(
            requestCredential(session.environment, 'password', true),
        ).resolves.toBe('secret');
        await session.close();
    });

    it('creates a rejecting POSIX session without a credential endpoint', async () => {
        const service = new GitCredentialSessionService();
        const session = await service.openRejecting();

        expect(session.environment).toMatchObject({
            GIT_ASKPASS_REQUIRE: 'force',
        });
        expect(session.environment.GIT_ASKPASS).toMatch(/askpass\.sh$/u);
        expect(
            session.environment.GODOT_LAUNCHER_GIT_CREDENTIAL_PORT,
        ).toBeUndefined();
        await session.close();
    });

    it('uses the verified native executable for an installed Windows runtime', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        mocks.getAppPath.mockReturnValueOnce(
            'C:\\launcher\\resources\\app.asar',
        );
        const service = new GitCredentialSessionService();

        const session = await service.openRejecting();

        expect(session.environment.GIT_ASKPASS).toBe(
            'C:\\launcher\\godot-launcher-git-askpass.exe',
        );
        expect(mocks.resolveWindowsExecutable).toHaveBeenCalledWith(
            expect.objectContaining({
                appPath: 'C:\\launcher\\resources\\app.asar',
                isPackaged: true,
            }),
        );
        await session.close();
    });

    it('closes a client that sends only a partial request', async () => {
        const service = new GitCredentialSessionService();
        const session = await service.open({
            username: 'user',
            password: 'secret',
        });
        const socket = net.createConnection({
            host: '127.0.0.1',
            port: Number(
                session.environment.GODOT_LAUNCHER_GIT_CREDENTIAL_PORT,
            ),
        });
        await new Promise<void>((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('error', reject);
        });
        socket.write(Buffer.from('GLAP'));
        const closed = new Promise<void>((resolve) =>
            socket.once('close', () => resolve()),
        );

        await session.close();
        await closed;
    });
});

/**
 * Requests one field from a test-owned credential session.
 *
 * @param environment - Opaque credential session environment.
 * @param kind - Credential field requested by the test client.
 * @param splitRequest - Whether to split the request across TCP writes.
 * @returns The credential returned by the test server.
 */
function requestCredential(
    environment: NodeJS.ProcessEnv,
    kind: 'username' | 'password',
    splitRequest = false,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const socket = net.createConnection(
            {
                host: '127.0.0.1',
                port: Number(environment.GODOT_LAUNCHER_GIT_CREDENTIAL_PORT),
            },
            () => {
                const request = createGitCredentialRequest(
                    environment.GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION ?? '',
                    kind,
                );
                if (splitRequest) {
                    socket.write(request.subarray(0, 10));
                    socket.end(request.subarray(10));
                    return;
                }
                socket.end(request);
            },
        );
        socket.on('data', (chunk: Buffer) => chunks.push(chunk));
        socket.once('end', () => {
            try {
                resolve(parseGitCredentialResponse(Buffer.concat(chunks)));
            } catch (error) {
                reject(error);
            }
        });
        socket.once('error', reject);
    });
}
