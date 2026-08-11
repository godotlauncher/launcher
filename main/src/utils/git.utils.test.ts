import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    gitAddAndCommit,
    gitConfig,
    gitConfigGetUser,
    gitConfigSetAutoCrlf,
    gitConfigSetUser,
    gitExists,
    gitInit,
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
        const name = 'Mario $(touch injected)';
        const email = 'mario+test@example.com';

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
            gitConfigSetUser('Mario', 'mario@example.com'),
        ).resolves.toBe(false);
        expect(mocks.execFile).toHaveBeenCalledOnce();
    });

    it('returns false when setting the Git email fails', async () => {
        completeGitCommand();
        completeGitCommand('', new Error('email failed'));

        await expect(
            gitConfigSetUser('Mario', 'mario@example.com'),
        ).resolves.toBe(false);
        expect(mocks.execFile).toHaveBeenCalledTimes(2);
    });

    it('reads global Git identity without trimming meaningful spaces', async () => {
        completeGitCommand('  Mario Debono  \n');
        completeGitCommand('mario@example.com\r\n');

        await expect(gitConfigGetUser()).resolves.toEqual({
            name: '  Mario Debono  ',
            email: 'mario@example.com',
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
        completeGitCommand('Mario\n');
        completeGitCommand('', new Error('email failed'));

        await expect(gitConfigGetUser()).resolves.toEqual({
            name: '',
            email: '',
        });
        expect(mocks.execFile).toHaveBeenCalledTimes(2);
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
        completeGitCommand('user.name=Mario\ncore.autocrlf=false\n');

        await expect(gitConfig()).resolves.toBe(
            'user.name=Mario\ncore.autocrlf=false\n',
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

    it('runs initial commit commands sequentially in the project cwd', async () => {
        completeGitCommand();
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
        expect(mocks.execFile).toHaveBeenNthCalledWith(
            3,
            'git',
            ['branch', '-m', 'main'],
            { cwd: projectPath, windowsHide: true },
            expect.any(Function),
        );
    });

    it.each([
        { stage: 'add', commandsBeforeFailure: 0, expectedCalls: 1 },
        { stage: 'commit', commandsBeforeFailure: 1, expectedCalls: 2 },
        { stage: 'branch', commandsBeforeFailure: 2, expectedCalls: 3 },
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
