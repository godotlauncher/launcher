import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    gitAddAndCommit,
    gitConfig,
    gitConfigGetGlobalIdentity,
    gitConfigGetUser,
    gitConfigSetAutoCrlf,
    gitConfigSetIdentity,
    gitConfigSetUser,
    gitExists,
    gitInit,
    gitRenameBranch,
} from './git.utils.js';

const mocks = vi.hoisted(() => ({
    execFile: vi.fn(),
    loggerError: vi.fn(),
}));

vi.mock('node:child_process', () => ({ execFile: mocks.execFile }));
vi.mock('electron-log', () => ({
    default: { error: mocks.loggerError },
}));

type GitCallback = (
    error: Error | null,
    stdout: string,
    stderr: string,
) => void;

/**
 * Queues a mocked Git process result.
 *
 * @param stdout - Standard output returned to the caller.
 * @param error - Optional process error returned to the caller.
 */
function completeGitCommand(stdout = '', error: Error | null = null): void {
    mocks.execFile.mockImplementationOnce(
        (
            _file: string,
            _args: string[],
            _options: unknown,
            callback: GitCallback,
        ) => callback(error, stdout, ''),
    );
}

describe('git.utils', () => {
    beforeEach(() => {
        mocks.execFile.mockReset();
        mocks.loggerError.mockReset();
    });

    it.each([
        { error: null, expected: true },
        { error: new Error('Git unavailable'), expected: false },
    ])('checks whether Git exists', async ({ error, expected }) => {
        completeGitCommand('git version 2.54.0\n', error);

        await expect(gitExists()).resolves.toBe(expected);
        expect(mocks.execFile).toHaveBeenCalledWith(
            'git',
            ['--version'],
            { cwd: undefined, windowsHide: true },
            expect.any(Function),
        );
    });

    it('sets Git identity values as literal sequential arguments', async () => {
        completeGitCommand();
        completeGitCommand();
        const name = 'John Doe $(touch injected)';
        const email = 'john.doe+test@example.com';

        await expect(gitConfigSetUser(name, email)).resolves.toBe(true);
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            1,
            'git',
            ['config', 'user.name', name],
            { cwd: undefined, windowsHide: true },
            expect.any(Function),
        );
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            2,
            'git',
            ['config', 'user.email', email],
            { cwd: undefined, windowsHide: true },
            expect.any(Function),
        );
    });

    it('stops setting Git identity when the name command fails', async () => {
        completeGitCommand('', new Error('name failed'));

        await expect(
            gitConfigSetUser('John Doe', 'john.doe@example.com'),
        ).resolves.toBe(false);
        expect(mocks.execFile).toHaveBeenCalledOnce();
    });

    it('returns false when setting the Git email fails', async () => {
        completeGitCommand();
        completeGitCommand('', new Error('email failed'));

        await expect(
            gitConfigSetUser('John Doe', 'john.doe@example.com'),
        ).resolves.toBe(false);
        expect(mocks.execFile).toHaveBeenCalledTimes(2);
    });

    it('reads global Git identity without trimming meaningful spaces', async () => {
        completeGitCommand('  John Doe  \n');
        completeGitCommand('john.doe@example.com\r\n');

        await expect(gitConfigGetUser()).resolves.toEqual({
            name: '  John Doe  ',
            email: 'john.doe@example.com',
        });
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            1,
            'git',
            ['config', '--global', 'user.name'],
            { cwd: undefined, windowsHide: true },
            expect.any(Function),
        );
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            2,
            'git',
            ['config', '--global', 'user.email'],
            { cwd: undefined, windowsHide: true },
            expect.any(Function),
        );
    });

    it('returns empty identity values when reading the name fails', async () => {
        completeGitCommand('', new Error('name failed'));

        await expect(gitConfigGetUser()).resolves.toEqual({
            name: '',
            email: '',
        });
        expect(mocks.execFile).toHaveBeenCalledOnce();
    });

    it('returns empty identity values when reading the email fails', async () => {
        completeGitCommand('John Doe\n');
        completeGitCommand('', new Error('email failed'));

        await expect(gitConfigGetUser()).resolves.toEqual({
            name: '',
            email: '',
        });
        expect(mocks.execFile).toHaveBeenCalledTimes(2);
    });

    it('reads partial global identity values without logging missing values', async () => {
        completeGitCommand('John Doe\n');
        completeGitCommand('', new Error('email is not configured'));

        await expect(gitConfigGetGlobalIdentity()).resolves.toEqual({
            name: 'John Doe',
            email: '',
        });
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            1,
            'git',
            ['config', '--global', '--get', 'user.name'],
            { cwd: undefined, windowsHide: true },
            expect.any(Function),
        );
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            2,
            'git',
            ['config', '--global', '--get', 'user.email'],
            { cwd: undefined, windowsHide: true },
            expect.any(Function),
        );
        expect(mocks.loggerError).not.toHaveBeenCalled();
    });

    it.each([
        {
            scope: 'repository' as const,
            cwd: '/projects/space & symbols',
            scopeArgs: [] as string[],
        },
        {
            scope: 'global' as const,
            cwd: undefined,
            scopeArgs: ['--global'],
        },
    ])('sets $scope Git identity sequentially', async (testCase) => {
        completeGitCommand();
        completeGitCommand();
        const name = 'John Doe $(literal)';
        const email = 'john.doe+test@example.com';
        const projectPath = '/projects/space & symbols';

        await expect(
            gitConfigSetIdentity(name, email, testCase.scope, projectPath),
        ).resolves.toBe(true);
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            1,
            'git',
            ['config', ...testCase.scopeArgs, 'user.name', name],
            { cwd: testCase.cwd, windowsHide: true },
            expect.any(Function),
        );
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            2,
            'git',
            ['config', ...testCase.scopeArgs, 'user.email', email],
            { cwd: testCase.cwd, windowsHide: true },
            expect.any(Function),
        );
    });

    it('stops scoped identity setup when the name write fails', async () => {
        completeGitCommand('', new Error('name failed'));

        await expect(
            gitConfigSetIdentity(
                'John Doe',
                'john.doe@example.com',
                'repository',
                '/projects/demo',
            ),
        ).resolves.toBe(false);
        expect(mocks.execFile).toHaveBeenCalledOnce();
        expect(mocks.loggerError).toHaveBeenCalledWith(
            'Failed to set Git identity name',
        );
        expect(mocks.loggerError).not.toHaveBeenCalledWith(
            expect.objectContaining({
                cmd: expect.stringContaining('John Doe'),
            }),
        );
    });

    it('returns false when the scoped identity email write fails', async () => {
        completeGitCommand();
        completeGitCommand('', new Error('email failed'));

        await expect(
            gitConfigSetIdentity(
                'John Doe',
                'john.doe@example.com',
                'global',
                '/projects/demo',
            ),
        ).resolves.toBe(false);
        expect(mocks.execFile).toHaveBeenCalledTimes(2);
        expect(mocks.loggerError).toHaveBeenCalledWith(
            'Failed to set Git identity email',
        );
    });

    it.each([
        { autoCrlf: true, value: 'true' },
        { autoCrlf: false, value: 'false' },
    ])('sets core.autocrlf to $value', async ({ autoCrlf, value }) => {
        completeGitCommand();

        await expect(gitConfigSetAutoCrlf(autoCrlf)).resolves.toBe(true);
        expect(mocks.execFile).toHaveBeenCalledWith(
            'git',
            ['config', 'core.autocrlf', value],
            { cwd: undefined, windowsHide: true },
            expect.any(Function),
        );
    });

    it('returns false when setting core.autocrlf fails', async () => {
        completeGitCommand('', new Error('config failed'));

        await expect(gitConfigSetAutoCrlf(true)).resolves.toBe(false);
    });

    it('returns Git configuration output unchanged', async () => {
        completeGitCommand('user.name=John Doe\ncore.autocrlf=false\n');

        await expect(gitConfig()).resolves.toBe(
            'user.name=John Doe\ncore.autocrlf=false\n',
        );
        expect(mocks.execFile).toHaveBeenCalledWith(
            'git',
            ['config', '--list'],
            { cwd: undefined, windowsHide: true },
            expect.any(Function),
        );
    });

    it('returns empty configuration output when reading fails', async () => {
        completeGitCommand('', new Error('config failed'));

        await expect(gitConfig()).resolves.toBe('');
    });

    it('initializes Git with the project path only as cwd', async () => {
        completeGitCommand();
        const projectPath = '/projects/space & $(not-a-command)';

        await expect(gitInit(projectPath)).resolves.toBe(true);
        expect(mocks.execFile).toHaveBeenCalledWith(
            'git',
            ['init'],
            { cwd: projectPath, windowsHide: true },
            expect.any(Function),
        );
    });

    it('returns false when Git initialization fails', async () => {
        completeGitCommand('', new Error('init failed'));

        await expect(gitInit('/projects/demo')).resolves.toBe(false);
    });

    it('renames an unborn branch to main in the project cwd', async () => {
        completeGitCommand();
        const projectPath = '/projects/space & symbols';

        await expect(gitRenameBranch(projectPath)).resolves.toBe(true);
        expect(mocks.execFile).toHaveBeenCalledWith(
            'git',
            ['branch', '-m', 'main'],
            { cwd: projectPath, windowsHide: true },
            expect.any(Function),
        );
    });

    it('runs initial commit commands sequentially in the project cwd', async () => {
        completeGitCommand();
        completeGitCommand();
        const projectPath = '/projects/space & symbols';

        await expect(gitAddAndCommit(projectPath)).resolves.toBe(true);
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            1,
            'git',
            ['add', '.'],
            { cwd: projectPath, windowsHide: true },
            expect.any(Function),
        );
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            2,
            'git',
            ['commit', '-m', 'Initial commit'],
            { cwd: projectPath, windowsHide: true },
            expect.any(Function),
        );
        expect(mocks.execFile).toHaveBeenCalledTimes(2);
    });

    it.each([
        { stage: 'add', commandsBeforeFailure: 0, expectedCalls: 1 },
        { stage: 'commit', commandsBeforeFailure: 1, expectedCalls: 2 },
    ])(
        'stops initial commit setup when $stage fails',
        async ({ commandsBeforeFailure, expectedCalls }) => {
            for (let index = 0; index < commandsBeforeFailure; index++) {
                completeGitCommand();
            }
            completeGitCommand('', new Error('stage failed'));

            await expect(gitAddAndCommit('/projects/demo')).resolves.toBe(
                false,
            );
            expect(mocks.execFile).toHaveBeenCalledTimes(expectedCalls);
        },
    );
});
