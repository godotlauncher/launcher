import type { ExecFileException } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

const processMocks = vi.hoisted(() => ({
    execFile: vi.fn(),
}));

vi.mock('node:child_process', () => processMocks);

import { ToolProcessExecutor } from './tool-process.executor.js';

const installation = {
    executablePath: '/tools/example',
    executableArgs: ['--prefix'],
    version: '1.0.0',
    source: 'detected' as const,
};

describe('ToolProcessExecutor', () => {
    it('executes the exact path and argument array without a shell', async () => {
        processMocks.execFile.mockImplementation(
            (
                _file: string,
                _args: readonly string[],
                _options: object,
                callback: (
                    error: ExecFileException | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => {
                callback(null, 'output', '');
            },
        );

        await expect(
            new ToolProcessExecutor().execute(installation, {
                args: ['status', '--short'],
                cwd: '/project',
            }),
        ).resolves.toEqual({
            success: true,
            stdout: 'output',
            stderr: '',
            exitCode: 0,
        });
        expect(processMocks.execFile).toHaveBeenCalledWith(
            '/tools/example',
            ['--prefix', 'status', '--short'],
            expect.objectContaining({
                cwd: '/project',
                shell: false,
                windowsHide: true,
            }),
            expect.any(Function),
        );
    });

    it('reports a killed process as timed out', async () => {
        processMocks.execFile.mockImplementation(
            (
                _file: string,
                _args: readonly string[],
                _options: object,
                callback: (
                    error: ExecFileException | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => {
                const error = Object.assign(new Error('timeout'), {
                    killed: true,
                }) as ExecFileException;
                callback(error, '', 'timed out');
            },
        );

        await expect(
            new ToolProcessExecutor().execute(installation, { args: [] }),
        ).resolves.toEqual({
            success: false,
            reason: 'timed-out',
            stdout: '',
            stderr: 'timed out',
            exitCode: null,
        });
    });

    it('returns a structured failure when process creation throws', async () => {
        processMocks.execFile.mockImplementation(() => {
            throw new TypeError('Invalid command');
        });

        await expect(
            new ToolProcessExecutor().execute(installation, { args: [] }),
        ).resolves.toEqual({
            success: false,
            reason: 'command-failed',
            stdout: '',
            stderr: '',
            exitCode: null,
        });
    });
});
