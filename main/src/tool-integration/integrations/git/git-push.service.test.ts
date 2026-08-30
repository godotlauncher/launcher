import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GitPushService } from './git-push.service.js';

const MAIN_SHA = 'a'.repeat(40);

describe('GitPushService', () => {
    it('adds a token-free origin, pushes main, and verifies its upstream', async () => {
        let originAdded = false;
        const execute = vi.fn(async ({ args }) => {
            if (args[0] === 'branch') {
                return { success: true, stdout: 'main\n', stderr: '' };
            }
            if (args[0] === 'rev-parse' && args[1] === '--verify') {
                return { success: true, stdout: `${MAIN_SHA}\n`, stderr: '' };
            }
            if (args[0] === 'config') {
                return originAdded
                    ? {
                          success: true,
                          stdout: 'https://github.com/godotlauncher/my-game.git\n',
                          stderr: '',
                      }
                    : {
                          success: false,
                          reason: 'command-failed',
                          exitCode: 1,
                          stdout: '',
                          stderr: '',
                      };
            }
            if (args[0] === 'remote') {
                originAdded = true;
                return { success: true, stdout: '', stderr: '' };
            }
            return {
                success: true,
                stdout: 'origin/main\n',
                stderr: '',
            };
        });
        const tools = {
            createExecutionSession: vi.fn(async () => execute),
            executeStreaming: vi.fn(async () => ({
                success: true,
                stdout: '',
                stderr: '',
            })),
        };
        const credentialSession = {
            environment: { GIT_ASKPASS: '/tmp/askpass' },
            close: vi.fn(async () => undefined),
        };
        const credentials = {
            open: vi.fn(async () => credentialSession),
        };
        const git = {
            inspectRepository: vi.fn(async () => ({
                status: 'inside-work-tree',
                isProjectRoot: true,
                kind: 'standard',
            })),
        };
        const service = new GitPushService(
            tools as never,
            credentials as never,
            git as never,
        );

        await expect(
            service.pushMain({
                projectPath: '/projects/my-game',
                canonicalUrl: 'https://github.com/godotlauncher/my-game.git',
                requiresGitLfsUpload: false,
                requiresEmptyRemote: false,
                credential: {
                    username: 'x-access-token',
                    password: 'secret-token',
                },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            ok: true,
            canonicalUrl: 'https://github.com/godotlauncher/my-game.git',
        });
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                args: [
                    'remote',
                    'add',
                    '--',
                    'origin',
                    'https://github.com/godotlauncher/my-game.git',
                ],
            }),
        );
        expect(JSON.stringify(execute.mock.calls)).not.toContain(
            'secret-token',
        );
        expect(tools.executeStreaming).toHaveBeenCalledOnce();
        const [toolId, request] = tools.executeStreaming.mock.calls[0];
        expect(toolId).toBe('git');
        expect(request.args).toContain('--no-verify');
        const hooksArgument = request.args.find((argument) =>
            argument.startsWith('core.hooksPath='),
        );
        expect(hooksArgument).toBeDefined();
        expect(
            path.isAbsolute(
                hooksArgument?.slice('core.hooksPath='.length) ?? '',
            ),
        ).toBe(true);
        expect(JSON.stringify(tools.executeStreaming.mock.calls)).not.toContain(
            'secret-token',
        );
        expect(credentialSession.close).toHaveBeenCalledOnce();
    });

    it('refuses to overwrite a different existing origin', async () => {
        const execute = vi.fn(async ({ args }) =>
            args[0] === 'branch'
                ? { success: true, stdout: 'main\n', stderr: '' }
                : {
                      success: true,
                      stdout: 'https://github.com/someone/else.git\n',
                      stderr: '',
                  },
        );
        const tools = {
            createExecutionSession: vi.fn(async () => execute),
            executeStreaming: vi.fn(),
        };
        const service = new GitPushService(
            tools as never,
            { open: vi.fn() } as never,
            {
                inspectRepository: vi.fn(async () => ({
                    status: 'inside-work-tree',
                    isProjectRoot: true,
                    kind: 'standard',
                })),
            } as never,
        );

        await expect(
            service.pushMain({
                projectPath: '/projects/my-game',
                canonicalUrl: 'https://github.com/godotlauncher/my-game.git',
                requiresGitLfsUpload: false,
                requiresEmptyRemote: false,
                credential: { username: 'x-access-token', password: 'secret' },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            ok: false,
            reason: 'local-repository-changed',
        });
        expect(tools.executeStreaming).not.toHaveBeenCalled();
    });

    it('checks remote refs through the isolated credential session', async () => {
        const executeStreaming = vi.fn(async (_toolId, request) => {
            request.onStdout?.('abc123\trefs/heads/main\n');
            return { success: true, exitCode: 0 };
        });
        const credentialSession = {
            environment: { GIT_ASKPASS: '/tmp/askpass' },
            close: vi.fn(async () => undefined),
        };
        const service = new GitPushService(
            {
                executeStreaming,
            } as never,
            { open: vi.fn(async () => credentialSession) } as never,
            {} as never,
        );

        await expect(
            service.checkRemoteEmpty({
                canonicalUrl: 'https://github.com/godotlauncher/my-game.git',
                credential: {
                    username: 'x-access-token',
                    password: 'secret-token',
                },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({ ok: true, empty: false });
        expect(executeStreaming).toHaveBeenCalledWith(
            'git',
            expect.objectContaining({
                args: expect.arrayContaining(['ls-remote', '--refs']),
            }),
        );
        const request = executeStreaming.mock.calls[0]?.[1];
        expect(request.cwd).not.toBe('/projects/my-game');
        expect(JSON.stringify(executeStreaming.mock.calls)).not.toContain(
            'secret-token',
        );
        expect(credentialSession.close).toHaveBeenCalledOnce();
    });

    it('refuses a recovered non-empty remote before origin or LFS mutation', async () => {
        const execute = vi.fn(async ({ args }) => {
            if (args[0] === 'branch') {
                return { success: true, stdout: 'main\n', stderr: '' };
            }
            if (args[0] === 'rev-parse' && args[1] === '--verify') {
                return { success: true, stdout: `${MAIN_SHA}\n`, stderr: '' };
            }
            if (args[0] === 'config') {
                return {
                    success: false,
                    reason: 'command-failed',
                    exitCode: 1,
                    stdout: '',
                    stderr: '',
                };
            }
            return { success: true, stdout: '', stderr: '' };
        });
        const executeStreaming = vi.fn(async (_toolId, request) => {
            request.onStdout?.('abc123\trefs/heads/main\n');
            return { success: true, exitCode: 0 };
        });
        const service = new GitPushService(
            {
                createExecutionSession: vi.fn(async () => execute),
                executeStreaming,
            } as never,
            {
                open: vi.fn(async () => ({
                    environment: { GIT_ASKPASS: '/tmp/askpass' },
                    close: vi.fn(async () => undefined),
                })),
            } as never,
            {
                inspectRepository: vi.fn(async () => ({
                    status: 'inside-work-tree',
                    isProjectRoot: true,
                    kind: 'standard',
                })),
            } as never,
        );

        await expect(
            service.pushMain({
                projectPath: '/projects/my-game',
                canonicalUrl: 'https://github.com/godotlauncher/my-game.git',
                requiresGitLfsUpload: true,
                requiresEmptyRemote: true,
                credential: { username: 'x-access-token', password: 'secret' },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({ ok: false, reason: 'remote-not-empty' });
        expect(execute).not.toHaveBeenCalledWith(
            expect.objectContaining({
                args: expect.arrayContaining(['remote', 'add']),
            }),
        );
        expect(executeStreaming).toHaveBeenCalledOnce();
        expect(executeStreaming.mock.calls[0]?.[0]).toBe('git');
    });

    it('uploads Git LFS objects through pinned configuration before pushing Git', async () => {
        const execute = vi.fn(async ({ args }) => {
            if (args[0] === 'branch') {
                return { success: true, stdout: 'main\n', stderr: '' };
            }
            if (args[0] === 'rev-parse' && args[1] === '--verify') {
                return { success: true, stdout: `${MAIN_SHA}\n`, stderr: '' };
            }
            if (args[0] === 'config') {
                return {
                    success: true,
                    stdout: 'https://github.com/godotlauncher/my-game.git\n',
                    stderr: '',
                };
            }
            return { success: true, stdout: 'origin/main\n', stderr: '' };
        });
        const tools = {
            createExecutionSession: vi.fn(async () => execute),
            executeStreaming: vi.fn(async (_toolId, request) => {
                if (request.args.includes('ls-remote')) {
                    request.onStdout?.(`${MAIN_SHA}\trefs/heads/main\n`);
                }
                return {
                    success: true,
                    exitCode: 0,
                };
            }),
        };
        const credentialSession = {
            environment: {
                GIT_ASKPASS: '/tmp/askpass',
                GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION: 'session-ref',
            },
            close: vi.fn(async () => undefined),
        };
        const service = new GitPushService(
            tools as never,
            { open: vi.fn(async () => credentialSession) } as never,
            {
                inspectRepository: vi.fn(async () => ({
                    status: 'inside-work-tree',
                    isProjectRoot: true,
                    kind: 'standard',
                })),
            } as never,
        );

        await expect(
            service.pushMain({
                projectPath: '/projects/my-game',
                canonicalUrl: 'https://github.com/godotlauncher/my-game.git',
                requiresGitLfsUpload: true,
                requiresEmptyRemote: true,
                credential: {
                    username: 'x-access-token',
                    password: 'secret-token',
                },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            ok: true,
            canonicalUrl: 'https://github.com/godotlauncher/my-game.git',
        });

        expect(tools.executeStreaming).toHaveBeenCalledTimes(3);
        expect(tools.executeStreaming.mock.calls[0][0]).toBe('git');
        expect(tools.executeStreaming.mock.calls[0][1].args).toContain(
            'ls-remote',
        );
        const [lfsToolId, lfsRequest] = tools.executeStreaming.mock.calls[1];
        expect(lfsToolId).toBe('git-lfs');
        expect(lfsRequest.args).toEqual(['push', 'origin', 'main']);
        const lfsConfig = readCommandConfig(lfsRequest.env);
        expect(lfsConfig).toEqual({
            'credential.helper': '',
            'lfs.url': 'https://github.com/godotlauncher/my-game.git/info/lfs',
            'lfs.pushurl':
                'https://github.com/godotlauncher/my-game.git/info/lfs',
            'lfs.standalonetransferagent': '',
            'lfs.basictransfersonly': 'true',
        });
        expect(lfsRequest.env.GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION).toBe(
            'session-ref',
        );
        expect(tools.executeStreaming.mock.calls[2][0]).toBe('git');
        expect(JSON.stringify(tools.executeStreaming.mock.calls)).not.toContain(
            'secret-token',
        );
    });

    it('stops before Git push when the controlled Git LFS upload fails', async () => {
        const execute = vi.fn(async ({ args }) => {
            if (args[0] === 'branch') {
                return { success: true, stdout: 'main\n', stderr: '' };
            }
            return {
                success: true,
                stdout: 'https://github.com/godotlauncher/my-game.git\n',
                stderr: '',
            };
        });
        const tools = {
            createExecutionSession: vi.fn(async () => execute),
            executeStreaming: vi.fn(async (_toolId, request) => {
                request.onStderr?.('authentication failed');
                return {
                    success: false,
                    reason: 'command-failed',
                    exitCode: 1,
                };
            }),
        };
        const credentialSession = {
            environment: { GIT_ASKPASS: '/tmp/askpass' },
            close: vi.fn(async () => undefined),
        };
        const service = new GitPushService(
            tools as never,
            { open: vi.fn(async () => credentialSession) } as never,
            {
                inspectRepository: vi.fn(async () => ({
                    status: 'inside-work-tree',
                    isProjectRoot: true,
                    kind: 'standard',
                })),
            } as never,
        );

        await expect(
            service.pushMain({
                projectPath: '/projects/my-game',
                canonicalUrl: 'https://github.com/godotlauncher/my-game.git',
                requiresGitLfsUpload: true,
                requiresEmptyRemote: false,
                credential: { username: 'x-access-token', password: 'secret' },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            ok: false,
            reason: 'authentication-failed',
        });
        expect(tools.executeStreaming).toHaveBeenCalledOnce();
        expect(tools.executeStreaming.mock.calls[0][0]).toBe('git-lfs');
        expect(credentialSession.close).toHaveBeenCalledOnce();
    });
});

/**
 * Reads command-scoped Git configuration from one process environment.
 *
 * @param environment - Process environment passed to the tested command.
 * @returns Git configuration keyed by command-scoped setting name.
 */
function readCommandConfig(
    environment: NodeJS.ProcessEnv,
): Record<string, string> {
    const count = Number(environment.GIT_CONFIG_COUNT ?? 0);
    return Object.fromEntries(
        Array.from({ length: count }, (_, index) => [
            environment[`GIT_CONFIG_KEY_${index}`] ?? '',
            environment[`GIT_CONFIG_VALUE_${index}`] ?? '',
        ]),
    );
}
