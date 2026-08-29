import { describe, expect, it, vi } from 'vitest';
import { GitPushService } from './git-push.service.js';

describe('GitPushService', () => {
    it('adds a token-free origin, pushes main, and verifies its upstream', async () => {
        let originAdded = false;
        const execute = vi.fn(async ({ args }) => {
            if (args[0] === 'branch') {
                return { success: true, stdout: 'main\n', stderr: '' };
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
                credential: { username: 'x-access-token', password: 'secret' },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            ok: false,
            reason: 'local-repository-changed',
        });
        expect(tools.executeStreaming).not.toHaveBeenCalled();
    });
});
