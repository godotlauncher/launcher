import logger from 'electron-log';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolIntegrationService } from '../../tool-integration.service.js';
import type { ToolExecutionResult } from '../../tool-integration.types.js';
import { GitService } from './git.service.js';

vi.mock('electron-log', () => ({
    default: {
        error: vi.fn(),
    },
}));

const execute = vi.fn();
const toolIntegrationService = {
    execute,
} as unknown as ToolIntegrationService;

const success = (stdout = ''): ToolExecutionResult => ({
    success: true,
    stdout,
    stderr: '',
    exitCode: 0,
});

const failure = (): ToolExecutionResult => ({
    success: false,
    reason: 'command-failed',
    stdout: '',
    stderr: '',
    exitCode: 1,
});

const notRepositoryFailure = (): ToolExecutionResult => ({
    success: false,
    reason: 'command-failed',
    stdout: '',
    stderr: 'fatal: not a git repository',
    exitCode: 128,
});

describe('GitService', () => {
    let service: GitService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new GitService(toolIntegrationService);
        execute.mockResolvedValue(success());
    });

    it('executes Git through the stable tool ID and explicit working directory', async () => {
        vi.spyOn(service, 'inspectRepository')
            .mockResolvedValueOnce({ status: 'not-a-repository' })
            .mockResolvedValueOnce({
                status: 'inside-work-tree',
                root: '/projects/demo',
                isProjectRoot: true,
                kind: 'standard',
            });

        await expect(service.init('/projects/demo')).resolves.toBe(true);

        expect(execute).toHaveBeenCalledWith('git', {
            args: ['init'],
            cwd: '/projects/demo',
        });
    });

    it('reports Git availability from the validated command result', async () => {
        await expect(service.exists()).resolves.toBe(true);
        expect(execute).toHaveBeenCalledWith('git', {
            args: ['--version'],
            cwd: undefined,
        });

        execute.mockResolvedValueOnce(failure());
        await expect(service.exists()).resolves.toBe(false);
    });

    it('reads a token-free origin with one repository-local command', async () => {
        execute.mockResolvedValueOnce(
            success('https://GitHub.com:443/Owner/Demo.git\n'),
        );

        await expect(
            service.getNormalizedRemoteOrigin('/projects/demo'),
        ).resolves.toBe('https://github.com/Owner/Demo');
        expect(execute).toHaveBeenCalledWith('git', {
            args: [
                'config',
                '--local',
                '--no-includes',
                '--get',
                'remote.origin.url',
            ],
            cwd: '/projects/demo',
            env: { LC_ALL: 'C', LANG: 'C' },
            timeoutMs: 5000,
        });
    });

    it('reads the repository-local origin from a nested project', async () => {
        execute.mockResolvedValueOnce(
            success('https://github.com/Owner/Monorepo.git\n'),
        );

        await expect(
            service.getNormalizedRemoteOrigin('/projects/demo'),
        ).resolves.toBe('https://github.com/Owner/Monorepo');
        expect(execute).toHaveBeenCalledOnce();
    });

    it('returns no origin when repository-local configuration is unavailable', async () => {
        execute.mockResolvedValueOnce(failure());

        await expect(
            service.getNormalizedRemoteOrigin('/projects/demo'),
        ).resolves.toBeNull();
        expect(execute).toHaveBeenCalledOnce();
    });

    it('reads and normalizes the complete global user identity', async () => {
        execute
            .mockResolvedValueOnce(success('Mario\n'))
            .mockResolvedValueOnce(success('mario@example.com\r\n'));

        await expect(service.getUser()).resolves.toEqual({
            name: 'Mario',
            email: 'mario@example.com',
        });
        expect(execute).toHaveBeenNthCalledWith(1, 'git', {
            args: ['config', '--global', 'user.name'],
            cwd: undefined,
        });
        expect(execute).toHaveBeenNthCalledWith(2, 'git', {
            args: ['config', '--global', 'user.email'],
            cwd: undefined,
        });
    });

    it('returns an empty user identity when either required read fails', async () => {
        execute.mockResolvedValueOnce(failure());

        await expect(service.getUser()).resolves.toEqual({
            name: '',
            email: '',
        });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('preserves partial global identity without logging expected missing values', async () => {
        execute
            .mockResolvedValueOnce(success('Mario\n'))
            .mockResolvedValueOnce(failure());

        await expect(service.getGlobalIdentity()).resolves.toEqual({
            name: 'Mario',
            email: '',
        });
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('reads effective and repository-local identity independently', async () => {
        execute
            .mockResolvedValueOnce(success('Inherited Name\n'))
            .mockResolvedValueOnce(success('inherited@example.com\n'))
            .mockResolvedValueOnce(success('Local Name\n'))
            .mockResolvedValueOnce(failure());

        await expect(service.getIdentity('/projects/demo')).resolves.toEqual({
            name: 'Inherited Name',
            email: 'inherited@example.com',
        });
        await expect(
            service.getLocalIdentity('/projects/demo'),
        ).resolves.toEqual({ name: 'Local Name', email: '' });

        expect(execute).toHaveBeenNthCalledWith(3, 'git', {
            args: ['config', '--local', '--get', 'user.name'],
            cwd: '/projects/demo',
        });
    });

    it('rejects empty identity values before running Git', async () => {
        await expect(
            service.setIdentity(' ', 'email@example.com', 'global'),
        ).resolves.toBe(false);
        expect(execute).not.toHaveBeenCalled();
    });

    it.each([
        {
            scope: 'repository' as const,
            expectedArgs: ['config', 'user.name', 'Mario'],
            expectedCwd: '/projects/demo',
        },
        {
            scope: 'global' as const,
            expectedArgs: ['config', '--global', 'user.name', 'Mario'],
            expectedCwd: undefined,
        },
    ])(
        'sets $scope identity with separate arguments',
        async ({ scope, expectedArgs, expectedCwd }) => {
            if (scope === 'repository') {
                vi.spyOn(service, 'inspectRepository').mockResolvedValue({
                    status: 'inside-work-tree',
                    root: '/projects/demo',
                    isProjectRoot: true,
                    kind: 'standard',
                });
            }
            await expect(
                service.setIdentity(
                    'Mario',
                    'mario@example.com',
                    scope,
                    '/projects/demo',
                ),
            ).resolves.toBe(true);

            expect(execute).toHaveBeenNthCalledWith(1, 'git', {
                args: expectedArgs,
                cwd: expectedCwd,
            });
            expect(execute).toHaveBeenNthCalledWith(2, 'git', {
                args: [
                    'config',
                    ...(scope === 'global' ? ['--global'] : []),
                    'user.email',
                    'mario@example.com',
                ],
                cwd: expectedCwd,
            });
        },
    );

    it('redacts identity values when a write fails', async () => {
        execute.mockResolvedValueOnce(failure());

        await expect(
            service.setIdentity(
                'Secret Name',
                'secret@example.com',
                'global',
                '/projects/demo',
            ),
        ).resolves.toBe(false);

        expect(logger.error).toHaveBeenCalledWith(
            'Failed to set Git identity name',
        );
        expect(
            JSON.stringify(vi.mocked(logger.error).mock.calls),
        ).not.toContain('Secret Name');
        expect(
            JSON.stringify(vi.mocked(logger.error).mock.calls),
        ).not.toContain('secret@example.com');
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('sets the effective user sequentially and stops after a failed name', async () => {
        execute.mockResolvedValueOnce(failure());

        await expect(
            service.setUser('Secret Name', 'secret@example.com'),
        ).resolves.toBe(false);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to set Git user name',
        );
    });

    it('maps configuration operations to their existing results', async () => {
        execute
            .mockResolvedValueOnce(success())
            .mockResolvedValueOnce(success('core.autocrlf=true\n'));

        await expect(service.setAutoCrlf(true)).resolves.toBe(true);
        await expect(service.getConfig()).resolves.toBe('core.autocrlf=true\n');

        expect(execute).toHaveBeenNthCalledWith(1, 'git', {
            args: ['config', 'core.autocrlf', 'true'],
            cwd: undefined,
        });
        expect(execute).toHaveBeenNthCalledWith(2, 'git', {
            args: ['config', '--list'],
            cwd: undefined,
        });
    });

    it('renames the initial branch in the repository working directory', async () => {
        vi.spyOn(service, 'inspectRepository').mockResolvedValue({
            status: 'inside-work-tree',
            root: '/projects/demo',
            isProjectRoot: true,
            kind: 'standard',
        });
        await expect(service.renameBranch('/projects/demo')).resolves.toBe(
            true,
        );

        expect(execute).toHaveBeenCalledWith('git', {
            args: ['branch', '-m', 'main'],
            cwd: '/projects/demo',
        });
    });

    it('stages and commits sequentially', async () => {
        vi.spyOn(service, 'inspectRepository').mockResolvedValue({
            status: 'inside-work-tree',
            root: '/projects/demo',
            isProjectRoot: true,
            kind: 'standard',
        });
        await expect(service.addAndCommit('/projects/demo')).resolves.toBe(
            true,
        );

        expect(execute).toHaveBeenNthCalledWith(1, 'git', {
            args: ['add', '.'],
            cwd: '/projects/demo',
        });
        expect(execute).toHaveBeenNthCalledWith(2, 'git', {
            args: ['commit', '-m', 'Initial commit'],
            cwd: '/projects/demo',
        });
    });

    it('does not commit when staging fails', async () => {
        vi.spyOn(service, 'inspectRepository').mockResolvedValue({
            status: 'inside-work-tree',
            root: '/projects/demo',
            isProjectRoot: true,
            kind: 'standard',
        });
        execute.mockResolvedValueOnce(failure());

        await expect(service.addAndCommit('/projects/demo')).resolves.toBe(
            false,
        );
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('converts unexpected tool service failures into command failure', async () => {
        vi.spyOn(service, 'inspectRepository').mockResolvedValueOnce({
            status: 'not-a-repository',
        });
        execute.mockRejectedValueOnce(new Error('unexpected'));

        await expect(service.init('/projects/demo')).resolves.toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
            'Git command failed unexpectedly',
        );
    });

    it('reports a project nested in a standard repository', async () => {
        execute
            .mockResolvedValueOnce(success('true\n'))
            .mockResolvedValueOnce(success('/projects/parent\n'))
            .mockResolvedValueOnce(success('\n'));

        await expect(
            service.inspectRepository('/projects/parent/demo'),
        ).resolves.toEqual({
            status: 'inside-work-tree',
            root: '/projects/parent',
            isProjectRoot: false,
            kind: 'standard',
        });

        expect(execute).toHaveBeenNthCalledWith(1, 'git', {
            args: ['rev-parse', '--is-inside-work-tree'],
            cwd: '/',
            env: { LC_ALL: 'C', LANG: 'C' },
            timeoutMs: 5000,
        });
    });

    it('classifies a submodule before considering its .git file marker', async () => {
        execute
            .mockResolvedValueOnce(success('true\n'))
            .mockResolvedValueOnce(success('/projects/parent/submodule\n'))
            .mockResolvedValueOnce(success('/projects/parent\n'));

        await expect(
            service.inspectRepository('/projects/parent/submodule'),
        ).resolves.toMatchObject({
            status: 'inside-work-tree',
            kind: 'submodule',
        });
    });

    it('classifies a repository root with a .git file as a linked worktree', async () => {
        vi.spyOn(
            service as unknown as {
                isGitFile: (gitPath: string) => Promise<boolean>;
            },
            'isGitFile',
        ).mockResolvedValue(true);
        execute
            .mockResolvedValueOnce(success('true\n'))
            .mockResolvedValueOnce(success('/projects/worktree\n'))
            .mockResolvedValueOnce(success('\n'));

        await expect(
            service.inspectRepository('/projects/worktree'),
        ).resolves.toEqual({
            status: 'inside-work-tree',
            root: '/projects/worktree',
            isProjectRoot: true,
            kind: 'linked-worktree',
        });
    });

    it('distinguishes no repository from unavailable Git', async () => {
        execute.mockResolvedValueOnce(notRepositoryFailure());
        await expect(
            service.inspectRepository('/projects/demo'),
        ).resolves.toEqual({ status: 'not-a-repository' });

        execute.mockResolvedValueOnce({
            ...failure(),
            reason: 'unavailable',
        });
        await expect(
            service.inspectRepository('/projects/demo'),
        ).resolves.toEqual({ status: 'git-unavailable' });
    });

    it('refuses repository mutations when the project is nested', async () => {
        vi.spyOn(service, 'inspectRepository').mockResolvedValue({
            status: 'inside-work-tree',
            root: '/projects/parent',
            isProjectRoot: false,
            kind: 'standard',
        });

        await expect(
            service.renameBranch('/projects/parent/demo'),
        ).resolves.toBe(false);
        await expect(
            service.addAndCommit('/projects/parent/demo'),
        ).resolves.toBe(false);
        await expect(
            service.setIdentity(
                'Mario',
                'mario@example.com',
                'repository',
                '/projects/parent/demo',
            ),
        ).resolves.toBe(false);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rechecks repository scope between staging and committing', async () => {
        vi.spyOn(service, 'inspectRepository')
            .mockResolvedValueOnce({
                status: 'inside-work-tree',
                root: '/projects/demo',
                isProjectRoot: true,
                kind: 'standard',
            })
            .mockResolvedValueOnce({
                status: 'inside-work-tree',
                root: '/projects',
                isProjectRoot: false,
                kind: 'standard',
            });

        await expect(service.addAndCommit('/projects/demo')).resolves.toBe(
            false,
        );
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledWith('git', {
            args: ['add', '.'],
            cwd: '/projects/demo',
        });
    });
});
