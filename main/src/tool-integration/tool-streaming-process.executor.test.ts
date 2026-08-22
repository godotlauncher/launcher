import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn }));

import { ToolStreamingProcessExecutor } from './tool-streaming-process.executor.js';

describe('ToolStreamingProcessExecutor', () => {
    beforeEach(() => vi.clearAllMocks());

    it('streams output and resolves a successful process', async () => {
        const child = createChild();
        spawn.mockReturnValue(child);
        const onStdout = vi.fn();
        const onStderr = vi.fn();
        const result = new ToolStreamingProcessExecutor().execute(
            {
                executablePath: '/tools/git',
                executableArgs: ['--fixed'],
                version: '2.50.0',
                source: 'detected',
            },
            {
                args: ['clone'],
                env: { PATH: '/tools' },
                signal: new AbortController().signal,
                timeoutMs: 5_000,
                onStdout,
                onStderr,
            },
        );

        child.stdout.write('out');
        child.stderr.write('progress');
        child.emit('close', 0);

        await expect(result).resolves.toEqual({ success: true, exitCode: 0 });
        expect(spawn).toHaveBeenCalledWith('/tools/git', ['--fixed', 'clone'], {
            cwd: undefined,
            env: { PATH: '/tools' },
            shell: false,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        expect(onStdout).toHaveBeenCalledWith('out');
        expect(onStderr).toHaveBeenCalledWith('progress');
    });

    it('terminates an aborted process and returns cancellation', async () => {
        const child = createChild();
        spawn.mockReturnValue(child);
        const controller = new AbortController();
        const result = new ToolStreamingProcessExecutor().execute(
            {
                executablePath: '/tools/git',
                executableArgs: [],
                version: null,
                source: 'detected',
            },
            {
                args: ['clone'],
                env: {},
                signal: controller.signal,
                timeoutMs: 5_000,
            },
        );

        controller.abort();
        expect(child.kill).toHaveBeenCalledWith('SIGTERM');
        child.emit('close', null);

        await expect(result).resolves.toEqual({
            success: false,
            reason: 'cancelled',
            exitCode: null,
        });
    });
});

/** Creates a process-shaped event emitter with streaming pipes. */
function createChild() {
    const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn(() => true);
    return child;
}
