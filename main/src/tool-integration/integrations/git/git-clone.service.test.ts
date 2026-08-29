import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitCloneService } from './git-clone.service.js';

describe('GitCloneService', () => {
    let supportDirectory: string;
    const executeStreaming = vi.fn();
    const closeCredential = vi.fn();
    const logger = { warn: vi.fn() };
    const credentials = {
        openRejecting: vi.fn(async () => ({
            environment: {
                GIT_ASKPASS: '/attempt/reject-askpass',
            },
            close: closeCredential,
        })),
        open: vi.fn(async () => ({
            environment: {
                GIT_ASKPASS: '/attempt/connected-askpass',
                GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION: 'opaque-ref',
            },
            close: closeCredential,
        })),
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        supportDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'git-clone-test-'),
        );
        executeStreaming.mockResolvedValue({ success: true, exitCode: 0 });
    });

    afterEach(async () => {
        await fs.rm(supportDirectory, { recursive: true, force: true });
        vi.unstubAllEnvs();
    });

    it('pins public DNS and isolates inherited Git credentials', async () => {
        vi.stubEnv('GIT_CONFIG_COUNT', '1');
        vi.stubEnv('GITHUB_TOKEN', 'inherited-secret');
        const onProgress = vi.fn();
        executeStreaming.mockImplementationOnce(async (_toolId, request) => {
            request.onStderr?.('Receiving objects: 42%');
            return { success: true, exitCode: 0 };
        });
        const service = new GitCloneService(
            { executeStreaming } as never,
            credentials as never,
            logger as never,
        );

        await expect(
            service.clone({
                source: 'public',
                canonicalUrl: 'https://example.com/team/game.git',
                approvedAddresses: ['93.184.216.34', '2606:2800:220:1::1'],
                destinationPath: '/projects/.game.clone',
                supportDirectory,
                signal: new AbortController().signal,
                onProgress,
            }),
        ).resolves.toEqual({ ok: true });

        const processRequest = executeStreaming.mock.calls[0]?.[1];
        expect(processRequest.args).toEqual(
            expect.arrayContaining([
                'credential.interactive=false',
                'http.curloptResolve=example.com:443:93.184.216.34',
                'http.curloptResolve=example.com:443:[2606:2800:220:1::1]',
                'https://example.com/team/game.git',
            ]),
        );
        expect(processRequest.env).toMatchObject({
            GIT_ALLOW_PROTOCOL: 'https',
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: '/attempt/reject-askpass',
        });
        expect(processRequest.env.GIT_CONFIG_COUNT).toBeUndefined();
        expect(processRequest.env.GITHUB_TOKEN).toBeUndefined();
        expect(onProgress).toHaveBeenCalledWith(42);
        expect(onProgress).toHaveBeenLastCalledWith(100);
        expect(credentials.open).not.toHaveBeenCalled();
        expect(credentials.openRejecting).toHaveBeenCalledOnce();
        expect(closeCredential).toHaveBeenCalledOnce();
    });

    it('uses an opaque connected credential session without secret arguments', async () => {
        const service = new GitCloneService(
            { executeStreaming } as never,
            credentials as never,
            logger as never,
        );

        await service.clone({
            source: 'connected',
            canonicalUrl: 'https://github.com/owner/game.git',
            credential: {
                username: 'x-access-token',
                password: 'secret-token',
            },
            destinationPath: '/projects/.game.clone',
            supportDirectory,
            signal: new AbortController().signal,
            onProgress: vi.fn(),
        });

        const processRequest = executeStreaming.mock.calls[0]?.[1];
        expect(JSON.stringify(processRequest)).not.toContain('secret-token');
        expect(processRequest.args).toContain('credential.interactive=true');
        expect(processRequest.args).not.toContain(
            'credential.interactive=false',
        );
        expect(credentials.open).toHaveBeenCalledWith({
            username: 'x-access-token',
            password: 'secret-token',
        });
        expect(credentials.openRejecting).not.toHaveBeenCalled();
        expect(closeCredential).toHaveBeenCalledOnce();
    });

    it('logs a credential-safe empty repository warning after Git succeeds', async () => {
        executeStreaming.mockImplementationOnce(async (_toolId, request) => {
            request.onStderr?.(
                'warning: You appear to have cloned an empty repository.',
            );
            return { success: true, exitCode: 0 };
        });
        const service = new GitCloneService(
            { executeStreaming } as never,
            credentials as never,
            logger as never,
        );

        await expect(
            service.clone({
                source: 'connected',
                canonicalUrl: 'https://github.com/owner/game.git',
                credential: {
                    username: 'x-access-token',
                    password: 'secret-token',
                },
                destinationPath: '/projects/.game.clone',
                supportDirectory,
                signal: new AbortController().signal,
                onProgress: vi.fn(),
            }),
        ).resolves.toEqual({ ok: true });

        expect(logger.warn).toHaveBeenCalledWith(
            'Remote Git clone reported an empty repository',
            {
                diagnostic: 'empty-repository',
                event: 'remote_git_clone_completed',
                lastPercent: -1,
                source: 'connected',
            },
        );
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
            'secret-token',
        );
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
            'github.com/owner/game',
        );
    });

    it('maps child cancellation without returning process output', async () => {
        executeStreaming.mockResolvedValueOnce({
            success: false,
            reason: 'cancelled',
            exitCode: null,
        });
        const service = new GitCloneService(
            { executeStreaming } as never,
            credentials as never,
            logger as never,
        );

        await expect(
            service.clone({
                source: 'public',
                canonicalUrl: 'https://example.com/team/game.git',
                approvedAddresses: ['93.184.216.34'],
                destinationPath: '/projects/.game.clone',
                supportDirectory,
                signal: new AbortController().signal,
                onProgress: vi.fn(),
            }),
        ).resolves.toEqual({ ok: false, reason: 'cancelled' });
    });

    it('fails closed when Git cannot apply public address pinning', async () => {
        executeStreaming.mockImplementationOnce(async (_toolId, request) => {
            request.onStderr?.(
                'fatal: unsupported configuration option curloptResolve',
            );
            return {
                success: false,
                reason: 'command-failed',
                exitCode: 128,
            };
        });
        const service = new GitCloneService(
            { executeStreaming } as never,
            credentials as never,
            logger as never,
        );

        await expect(
            service.clone({
                source: 'public',
                canonicalUrl: 'https://example.com/team/game.git',
                approvedAddresses: ['93.184.216.34'],
                destinationPath: '/projects/.game.clone',
                supportDirectory,
                signal: new AbortController().signal,
                onProgress: vi.fn(),
            }),
        ).resolves.toEqual({
            ok: false,
            reason: 'public-clone-incompatible',
        });
    });

    it('logs a credential-safe checkout failure classification', async () => {
        executeStreaming.mockImplementationOnce(async (_toolId, request) => {
            request.onStderr?.('Receiving objects: 100%');
            request.onStderr?.(
                "error: invalid path 'project/unsupported-file-name'",
            );
            return {
                success: false,
                reason: 'command-failed',
                exitCode: 128,
            };
        });
        const service = new GitCloneService(
            { executeStreaming } as never,
            credentials as never,
            logger as never,
        );

        await expect(
            service.clone({
                source: 'connected',
                canonicalUrl: 'https://github.com/owner/game.git',
                credential: {
                    username: 'x-access-token',
                    password: 'secret-token',
                },
                destinationPath: '/projects/.game.clone',
                supportDirectory,
                signal: new AbortController().signal,
                onProgress: vi.fn(),
            }),
        ).resolves.toEqual({ ok: false, reason: 'clone-failed' });

        expect(logger.warn).toHaveBeenCalledWith('Remote Git clone failed', {
            diagnostic: 'checkout-failed',
            event: 'remote_git_clone_failed',
            exitCode: 128,
            lastPercent: 100,
            processReason: 'command-failed',
            source: 'connected',
        });
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
            'secret-token',
        );
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
            'unsupported-file-name',
        );
    });
});
