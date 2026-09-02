import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { formatGitAlternateObjectPath } from './git-alternate-object-path.util.js';
import { GitPushService } from './git-push.service.js';

const MAIN_SHA = 'a'.repeat(40);

describe('GitPushService', () => {
    it('adds a token-free origin, pushes main, and verifies its upstream', async () => {
        let originAdded = false;
        let stagingAlternate: string | undefined;
        const execute = vi.fn(async ({ args, cwd }) => {
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
            if (args[0] === 'remote' && cwd === '/projects/my-game') {
                originAdded = true;
                return { success: true, stdout: '', stderr: '' };
            }
            if (args[0] === 'update-ref' && cwd !== '/projects/my-game') {
                stagingAlternate = await fs.readFile(
                    path.join(cwd, 'objects', 'info', 'alternates'),
                    'utf8',
                );
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
        const networkCredentialSession = {
            environment: { GIT_ASKPASS: '/tmp/askpass' },
            close: vi.fn(async () => undefined),
        };
        const credentialSession = {
            environment: {
                GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION: 'bound-session-ref',
            },
            helper: "!exec '/tmp/credential-helper'",
            close: vi.fn(async () => undefined),
        };
        const credentials = {
            open: vi.fn(async () => networkCredentialSession),
            openBound: vi.fn(async () => credentialSession),
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
        const stagingInit = execute.mock.calls.find(
            ([executionRequest]) => executionRequest.args[2] === 'init',
        )?.[0];
        expect(stagingInit).toMatchObject({
            args: expect.arrayContaining([
                'init.templateDir=',
                '--bare',
                '--initial-branch=main',
            ]),
            env: expect.objectContaining({
                GIT_CONFIG_NOSYSTEM: '1',
            }),
            inheritEnv: false,
        });
        expect(stagingInit?.env).not.toHaveProperty(
            'GIT_ALTERNATE_OBJECT_DIRECTORIES',
        );
        expect(stagingAlternate).toBe(
            `${formatGitAlternateObjectPath(path.join('/projects/my-game', '.git', 'objects'))}\n`,
        );
        expect(stagingInit?.cwd).not.toBe('/projects/my-game');
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                args: ['update-ref', 'refs/heads/main', MAIN_SHA],
                cwd: expect.not.stringContaining('/projects/my-game'),
                inheritEnv: false,
            }),
        );
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                args: [
                    'remote',
                    'add',
                    '--',
                    'origin',
                    'https://github.com/godotlauncher/my-game.git',
                ],
                cwd: expect.not.stringContaining('/projects/my-game'),
                inheritEnv: false,
            }),
        );
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                args: [
                    '-c',
                    expect.stringMatching(/^core\.hooksPath=/u),
                    'update-ref',
                    'refs/remotes/origin/main',
                    MAIN_SHA,
                ],
                cwd: '/projects/my-game',
            }),
        );
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                args: [
                    'config',
                    '--local',
                    'branch.main.merge',
                    'refs/heads/main',
                ],
                cwd: '/projects/my-game',
            }),
        );
        expect(JSON.stringify(execute.mock.calls)).not.toContain(
            'secret-token',
        );
        expect(tools.executeStreaming).toHaveBeenCalledTimes(2);
        const [toolId, request] = tools.executeStreaming.mock.calls[1];
        expect(toolId).toBe('git');
        expect(request.cwd).not.toBe('/projects/my-game');
        expect(request.args).toContain('--no-verify');
        expect(request.args).toContain('--force-with-lease=refs/heads/main:');
        expect(request.args).toContain('refs/heads/main:refs/heads/main');
        expect(request.args).not.toContain('--set-upstream');
        expect(request.args).not.toContain('--force');
        expect(request.args).not.toContain('--mirror');
        expect(request.args).not.toContain('--all');
        expect(request.args).not.toContain('--tags');
        expect(request.env).not.toHaveProperty(
            'GIT_ALTERNATE_OBJECT_DIRECTORIES',
        );
        expect(request.env.GIT_ASKPASS).toBeUndefined();
        expect(readCommandArguments(request.args)).toMatchObject({
            'core.askPass': '',
            'credential.helper': "!exec '/tmp/credential-helper'",
            'remote.origin.pushurl':
                'https://github.com/godotlauncher/my-game.git',
        });
        expect(
            readCommandArgumentValues(request.args, 'credential.helper'),
        ).toEqual(['', "!exec '/tmp/credential-helper'"]);
        expect(
            readCommandArgumentValues(request.args, 'remote.origin.pushurl'),
        ).toEqual(['', 'https://github.com/godotlauncher/my-game.git']);
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
        expect(networkCredentialSession.close).toHaveBeenCalledOnce();
        expect(credentials.open).toHaveBeenCalledOnce();
        expect(credentials.openBound).toHaveBeenCalledWith(
            expect.objectContaining({ password: 'secret-token' }),
            'https://github.com/godotlauncher/my-game.git',
        );
        const reconciliationIndex = execute.mock.calls.findIndex(
            ([executionRequest]) =>
                executionRequest.args.includes('refs/remotes/origin/main'),
        );
        expect(
            credentialSession.close.mock.invocationCallOrder[0],
        ).toBeLessThan(
            execute.mock.invocationCallOrder[reconciliationIndex] ?? 0,
        );
        const originAddIndex = execute.mock.calls.findIndex(
            ([executionRequest]) =>
                executionRequest.cwd === '/projects/my-game' &&
                executionRequest.args[0] === 'remote',
        );
        expect(tools.executeStreaming.mock.invocationCallOrder[1]).toBeLessThan(
            execute.mock.invocationCallOrder[originAddIndex] ?? 0,
        );
    });

    it('refuses to overwrite a different existing origin', async () => {
        const execute = vi.fn(async ({ args }) => {
            if (args[0] === 'branch') {
                return { success: true, stdout: 'main\n', stderr: '' };
            }
            if (args[0] === 'rev-parse' && args[1] === '--verify') {
                return { success: true, stdout: `${MAIN_SHA}\n`, stderr: '' };
            }
            return {
                success: true,
                stdout: 'https://github.com/someone/else.git\n',
                stderr: '',
            };
        });
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
                credential: { username: 'x-access-token', password: 'secret' },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            ok: false,
            reason: 'local-repository-changed',
        });
        expect(tools.executeStreaming).not.toHaveBeenCalled();
    });

    it.each(['command-failed', 'cancelled'])(
        'closes the bound session after a %s branch push',
        async (reason) => {
            const execute = vi.fn(async ({ args }) => {
                if (args[0] === 'branch') {
                    return { success: true, stdout: 'main\n', stderr: '' };
                }
                if (args[0] === 'rev-parse' && args[1] === '--verify') {
                    return {
                        success: true,
                        stdout: `${MAIN_SHA}\n`,
                        stderr: '',
                    };
                }
                if (args[0] === 'config') {
                    return {
                        success: true,
                        stdout: 'https://github.com/godotlauncher/my-game.git\n',
                        stderr: '',
                    };
                }
                return {
                    success: true,
                    stdout: 'origin/main\n',
                    stderr: '',
                };
            });
            const boundCredentialSession = {
                environment: {
                    GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION: 'bound-session-ref',
                },
                helper: "!exec '/tmp/credential-helper'",
                close: vi.fn(async () => undefined),
            };
            const networkCredentialSession = {
                environment: { GIT_ASKPASS: '/tmp/askpass' },
                close: vi.fn(async () => undefined),
            };
            const service = new GitPushService(
                {
                    createExecutionSession: vi.fn(async () => execute),
                    executeStreaming: vi.fn(async (_toolId, request) =>
                        request.args.includes('ls-remote')
                            ? { success: true, exitCode: 0 }
                            : {
                                  success: false,
                                  reason,
                                  exitCode: null,
                              },
                    ),
                } as never,
                {
                    open: vi.fn(async () => networkCredentialSession),
                    openBound: vi.fn(async () => boundCredentialSession),
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
                    canonicalUrl:
                        'https://github.com/godotlauncher/my-game.git',
                    requiresGitLfsUpload: false,
                    credential: {
                        username: 'x-access-token',
                        password: 'secret',
                    },
                    signal: new AbortController().signal,
                }),
            ).resolves.toEqual({ ok: false, reason: 'push-failed' });
            expect(boundCredentialSession.close).toHaveBeenCalledOnce();
            expect(networkCredentialSession.close).toHaveBeenCalledOnce();
        },
    );

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

    it('refuses a different remote main before origin or LFS mutation', async () => {
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
            request.onStdout?.(`${'b'.repeat(40)}\trefs/heads/main\n`);
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
                credential: { username: 'x-access-token', password: 'secret' },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({ ok: false, reason: 'remote-not-empty' });
        expect(
            execute.mock.calls.some(
                ([request]) =>
                    request.cwd === '/projects/my-game' &&
                    request.args[0] === 'remote' &&
                    request.args[1] === 'add',
            ),
        ).toBe(false);
        expect(executeStreaming).toHaveBeenCalledOnce();
        expect(executeStreaming.mock.calls[0]?.[0]).toBe('git');
    });

    it('refuses a recovered remote when main appears after inspection', async () => {
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
            }
            return { success: true, stdout: '', stderr: '' };
        });
        const executeStreaming = vi.fn(async (_toolId, request) => {
            if (request.args.includes('push')) {
                request.onStderr?.('[rejected] main -> main (stale info)');
                return {
                    success: false,
                    reason: 'command-failed',
                    exitCode: 1,
                };
            }
            return { success: true, exitCode: 0 };
        });
        const credentialSession = {
            environment: { GIT_ASKPASS: '/tmp/askpass' },
            close: vi.fn(async () => undefined),
        };
        const service = new GitPushService(
            {
                createExecutionSession: vi.fn(async () => execute),
                executeStreaming,
            } as never,
            {
                open: vi.fn(async () => credentialSession),
                openBound: vi.fn(async () => ({
                    ...credentialSession,
                    helper: "!exec '/tmp/credential-helper'",
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
                requiresGitLfsUpload: false,
                credential: { username: 'x-access-token', password: 'secret' },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({ ok: false, reason: 'remote-not-empty' });
        const pushRequest = executeStreaming.mock.calls.find(([, request]) =>
            request.args.includes('push'),
        )?.[1];
        expect(pushRequest?.args).toContain(
            '--force-with-lease=refs/heads/main:',
        );
    });

    it('refuses an exact remote main that changes before the push', async () => {
        const execute = createSuccessfulLocalGitExecution();
        const executeStreaming = vi.fn(async (_toolId, request) => {
            if (request.args.includes('ls-remote')) {
                request.onStdout?.(`${MAIN_SHA}\trefs/heads/main\n`);
                return { success: true, exitCode: 0 };
            }
            request.onStderr?.('[rejected] main -> main (stale info)');
            return {
                success: false,
                reason: 'command-failed',
                exitCode: 1,
            };
        });
        const service = createPushService(execute, executeStreaming);

        await expect(pushTestMain(service)).resolves.toEqual({
            ok: false,
            reason: 'remote-not-empty',
        });
        const pushRequest = executeStreaming.mock.calls.find(([, request]) =>
            request.args.includes('push'),
        )?.[1];
        expect(pushRequest?.args).toContain(
            `--force-with-lease=refs/heads/main:${MAIN_SHA}`,
        );
    });

    it('reports a generic protected-branch rejection as a push failure', async () => {
        const execute = createSuccessfulLocalGitExecution();
        const executeStreaming = vi.fn(async (_toolId, request) => {
            if (request.args.includes('ls-remote')) {
                return { success: true, exitCode: 0 };
            }
            request.onStderr?.(
                '[remote rejected] main -> main (protected branch hook declined)',
            );
            return {
                success: false,
                reason: 'command-failed',
                exitCode: 1,
            };
        });
        const service = createPushService(execute, executeStreaming);

        await expect(pushTestMain(service)).resolves.toEqual({
            ok: false,
            reason: 'push-failed',
        });
    });

    it('keeps concurrent non-main refs outside inspection and the push refspec', async () => {
        const execute = createSuccessfulLocalGitExecution();
        const executeStreaming = vi.fn(async () => ({
            success: true,
            exitCode: 0,
        }));
        const service = createPushService(execute, executeStreaming);

        await expect(pushTestMain(service)).resolves.toMatchObject({
            ok: true,
        });
        const inspectionRequest = executeStreaming.mock.calls[0]?.[1];
        expect(inspectionRequest?.args.slice(-2)).toEqual([
            'https://github.com/godotlauncher/my-game.git',
            'refs/heads/main',
        ]);
        const pushRequest = executeStreaming.mock.calls[1]?.[1];
        expect(pushRequest?.args).toContain('refs/heads/main:refs/heads/main');
        expect(pushRequest?.args).not.toContain('--mirror');
        expect(pushRequest?.args).not.toContain('--all');
        expect(pushRequest?.args).not.toContain('--tags');
        expect(
            pushRequest?.args.some(
                (argument) =>
                    argument.startsWith('refs/tags/') ||
                    (argument.startsWith('refs/heads/') &&
                        argument !== 'refs/heads/main:refs/heads/main'),
            ),
        ).toBe(false);
    });

    it('reports origin failure only after the guarded push succeeds', async () => {
        const execute = vi.fn(async ({ args, cwd }) => {
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
            if (args[0] === 'remote' && cwd === '/projects/my-game') {
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
        const executeStreaming = vi.fn(async () => ({
            success: true,
            exitCode: 0,
        }));
        const service = createPushService(execute, executeStreaming);

        await expect(pushTestMain(service)).resolves.toEqual({
            ok: false,
            reason: 'origin-failed',
        });
        const originAddIndex = execute.mock.calls.findIndex(
            ([request]) =>
                request.cwd === '/projects/my-game' &&
                request.args[0] === 'remote',
        );
        expect(executeStreaming).toHaveBeenCalledTimes(2);
        expect(executeStreaming.mock.invocationCallOrder[1]).toBeLessThan(
            execute.mock.invocationCallOrder[originAddIndex] ?? 0,
        );
    });

    it('accepts exact remote main for an idempotent retry', async () => {
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
        const boundCredentialSession = {
            environment: {
                GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION: 'bound-session-ref',
            },
            helper: "!exec '/tmp/credential-helper'",
            close: vi.fn(async () => undefined),
        };
        const credentials = {
            open: vi.fn(async () => credentialSession),
            openBound: vi.fn(async () => boundCredentialSession),
        };
        const service = new GitPushService(
            tools as never,
            credentials as never,
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
        expect(lfsRequest.cwd).not.toBe('/projects/my-game');
        expect(lfsRequest.args).toEqual(['push', 'origin', 'main']);
        const lfsConfig = readCommandConfig(lfsRequest.env);
        expect(lfsConfig).toEqual({
            'credential.helper': '',
            'lfs.url': 'https://github.com/godotlauncher/my-game.git/info/lfs',
            'lfs.pushurl':
                'https://github.com/godotlauncher/my-game.git/info/lfs',
            'lfs.storage': path.join('/projects/my-game', '.git', 'lfs'),
            'lfs.standalonetransferagent': '',
            'lfs.basictransfersonly': 'true',
        });
        expect(lfsRequest.env.GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION).toBe(
            'session-ref',
        );
        expect(tools.executeStreaming.mock.calls[2][0]).toBe('git');
        expect(tools.executeStreaming.mock.calls[2][1].args).toContain(
            `--force-with-lease=refs/heads/main:${MAIN_SHA}`,
        );
        expect(credentialSession.close).toHaveBeenCalledOnce();
        expect(boundCredentialSession.close).toHaveBeenCalledOnce();
        expect(credentials.open.mock.invocationCallOrder[0]).toBeLessThan(
            credentials.openBound.mock.invocationCallOrder[0] ?? 0,
        );
        expect(
            credentialSession.close.mock.invocationCallOrder[0],
        ).toBeLessThan(credentials.openBound.mock.invocationCallOrder[0] ?? 0);
        expect(JSON.stringify(tools.executeStreaming.mock.calls)).not.toContain(
            'secret-token',
        );
    });

    it('stops before Git push when the controlled Git LFS upload fails', async () => {
        let originAdded = false;
        const execute = vi.fn(async ({ args, cwd }) => {
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
            if (args[0] === 'remote' && cwd === '/projects/my-game') {
                originAdded = true;
            }
            return { success: true, stdout: '', stderr: '' };
        });
        const tools = {
            createExecutionSession: vi.fn(async () => execute),
            executeStreaming: vi.fn(async (_toolId, request) => {
                if (request.args.includes('ls-remote')) {
                    return { success: true, exitCode: 0 };
                }
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
                credential: { username: 'x-access-token', password: 'secret' },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            ok: false,
            reason: 'authentication-failed',
        });
        expect(tools.executeStreaming).toHaveBeenCalledTimes(2);
        expect(tools.executeStreaming.mock.calls[0][0]).toBe('git');
        expect(tools.executeStreaming.mock.calls[1][0]).toBe('git-lfs');
        expect(
            execute.mock.calls.some(
                ([request]) =>
                    request.cwd === '/projects/my-game' &&
                    request.args[0] === 'remote',
            ),
        ).toBe(false);
        expect(credentialSession.close).toHaveBeenCalledOnce();
    });

    it('refuses authenticated work when main changes after staging', async () => {
        const changedSha = 'b'.repeat(40);
        let mainReadCount = 0;
        const execute = vi.fn(async ({ args }) => {
            if (args[0] === 'branch') {
                return { success: true, stdout: 'main\n', stderr: '' };
            }
            if (args[0] === 'rev-parse' && args[1] === '--verify') {
                mainReadCount += 1;
                return {
                    success: true,
                    stdout: `${mainReadCount === 1 ? MAIN_SHA : changedSha}\n`,
                    stderr: '',
                };
            }
            if (args[0] === 'config') {
                return {
                    success: true,
                    stdout: 'https://github.com/godotlauncher/my-game.git\n',
                    stderr: '',
                };
            }
            return { success: true, stdout: '', stderr: '' };
        });
        const credentials = {
            open: vi.fn(),
            openBound: vi.fn(),
        };
        const executeStreaming = vi.fn();
        const service = new GitPushService(
            {
                createExecutionSession: vi.fn(async () => execute),
                executeStreaming,
            } as never,
            credentials as never,
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
                credential: { username: 'x-access-token', password: 'secret' },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            ok: false,
            reason: 'local-repository-changed',
        });
        expect(credentials.open).not.toHaveBeenCalled();
        expect(credentials.openBound).not.toHaveBeenCalled();
        expect(executeStreaming).not.toHaveBeenCalled();
    });

    it('does not reconcile upstream when main changes after the remote push', async () => {
        const changedSha = 'b'.repeat(40);
        let mainReadCount = 0;
        const execute = vi.fn(async ({ args }) => {
            if (args[0] === 'branch') {
                return { success: true, stdout: 'main\n', stderr: '' };
            }
            if (args[0] === 'rev-parse' && args[1] === '--verify') {
                mainReadCount += 1;
                return {
                    success: true,
                    stdout: `${mainReadCount < 4 ? MAIN_SHA : changedSha}\n`,
                    stderr: '',
                };
            }
            if (args[0] === 'config') {
                return {
                    success: true,
                    stdout: 'https://github.com/godotlauncher/my-game.git\n',
                    stderr: '',
                };
            }
            return { success: true, stdout: '', stderr: '' };
        });
        const credentialSession = {
            environment: {},
            helper: "!exec '/tmp/credential-helper'",
            close: vi.fn(async () => undefined),
        };
        const networkCredentialSession = {
            environment: { GIT_ASKPASS: '/tmp/askpass' },
            close: vi.fn(async () => undefined),
        };
        const service = new GitPushService(
            {
                createExecutionSession: vi.fn(async () => execute),
                executeStreaming: vi.fn(async () => ({
                    success: true,
                    exitCode: 0,
                })),
            } as never,
            {
                open: vi.fn(async () => networkCredentialSession),
                openBound: vi.fn(async () => credentialSession),
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
                requiresGitLfsUpload: false,
                credential: { username: 'x-access-token', password: 'secret' },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            ok: false,
            reason: 'local-repository-changed',
        });
        expect(
            execute.mock.calls.some(
                ([request]) =>
                    request.cwd === '/projects/my-game' &&
                    request.args.includes('update-ref') &&
                    request.args.includes('refs/remotes/origin/main'),
            ),
        ).toBe(false);
        expect(credentialSession.close).toHaveBeenCalledOnce();
    });
});

/** Creates a local Git execution mock with a matching origin and stable main. */
function createSuccessfulLocalGitExecution() {
    return vi.fn(async ({ args }) => {
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
}

/**
 * Creates a push service with isolated credential sessions.
 *
 * @param execute - Local Git execution mock.
 * @param executeStreaming - Network execution mock.
 * @returns Configured Git push service.
 */
function createPushService(
    execute: ReturnType<typeof vi.fn>,
    executeStreaming: ReturnType<typeof vi.fn>,
): GitPushService {
    return new GitPushService(
        {
            createExecutionSession: vi.fn(async () => execute),
            executeStreaming,
        } as never,
        {
            open: vi.fn(async () => ({
                environment: { GIT_ASKPASS: '/tmp/askpass' },
                close: vi.fn(async () => undefined),
            })),
            openBound: vi.fn(async () => ({
                environment: {},
                helper: "!exec '/tmp/credential-helper'",
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
}

/**
 * Pushes the standard test project.
 *
 * @param service - Configured service under test.
 * @returns Guarded push outcome.
 */
function pushTestMain(service: GitPushService) {
    return service.pushMain({
        projectPath: '/projects/my-game',
        canonicalUrl: 'https://github.com/godotlauncher/my-game.git',
        requiresGitLfsUpload: false,
        credential: { username: 'x-access-token', password: 'secret' },
        signal: new AbortController().signal,
    });
}

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

/**
 * Reads the final value for each command-scoped Git configuration argument.
 *
 * @param argumentsList - Git command arguments.
 * @returns Final command configuration keyed by setting name.
 */
function readCommandArguments(argumentsList: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let index = 0; index < argumentsList.length - 1; index += 1) {
        if (argumentsList[index] !== '-c') {
            continue;
        }
        const entry = argumentsList[index + 1] ?? '';
        const separator = entry.indexOf('=');
        if (separator > 0) {
            result[entry.slice(0, separator)] = entry.slice(separator + 1);
        }
    }
    return result;
}

/**
 * Reads every command-scoped value for one Git configuration key.
 *
 * @param argumentsList - Git command arguments.
 * @param key - Exact configuration key.
 * @returns Values in command precedence order.
 */
function readCommandArgumentValues(
    argumentsList: string[],
    key: string,
): string[] {
    return argumentsList
        .filter(
            (value, index) =>
                argumentsList[index - 1] === '-c' &&
                value.startsWith(`${key}=`),
        )
        .map((value) => value.slice(key.length + 1));
}
