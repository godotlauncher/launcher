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

describe('GitService', () => {
    let service: GitService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new GitService(toolIntegrationService);
        execute.mockResolvedValue(success());
    });

    it('executes Git through the stable tool ID and explicit working directory', async () => {
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
        await expect(service.renameBranch('/projects/demo')).resolves.toBe(
            true,
        );

        expect(execute).toHaveBeenCalledWith('git', {
            args: ['branch', '-m', 'main'],
            cwd: '/projects/demo',
        });
    });

    it('stages and commits sequentially', async () => {
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
        execute.mockResolvedValueOnce(failure());

        await expect(service.addAndCommit('/projects/demo')).resolves.toBe(
            false,
        );
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('converts unexpected tool service failures into command failure', async () => {
        execute.mockRejectedValueOnce(new Error('unexpected'));

        await expect(service.init('/projects/demo')).resolves.toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
            'Git command failed unexpectedly',
        );
    });
});
