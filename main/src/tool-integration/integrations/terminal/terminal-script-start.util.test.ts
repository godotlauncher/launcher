import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => ({ access: vi.fn(), rm: vi.fn() }));
vi.mock('node:fs/promises', () => files);

import {
    terminalScriptStartPath,
    waitForTerminalScriptStart,
} from './terminal-script-start.util.js';

describe('terminal script startup', () => {
    const scriptPath = path.join('/tmp', 'private-launch', 'launch.sh');
    const missing = Object.assign(new Error('Missing marker'), {
        code: 'ENOENT',
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        files.access.mockResolvedValue(undefined);
        files.rm.mockResolvedValue(undefined);
    });
    afterEach(() => vi.useRealTimers());

    it('consumes only the marker belonging to this launch', async () => {
        const otherScript = path.join('/tmp', 'other-launch', 'launch.sh');
        files.access.mockImplementation(async (file: string) => {
            if (file !== terminalScriptStartPath(scriptPath)) throw missing;
        });
        await expect(
            waitForTerminalScriptStart(
                scriptPath,
                new AbortController().signal,
            ),
        ).resolves.toBe(true);
        expect(files.rm).toHaveBeenCalledExactlyOnceWith(
            terminalScriptStartPath(scriptPath),
            { force: true },
        );
        expect(files.rm).not.toHaveBeenCalledWith(
            terminalScriptStartPath(otherScript),
            expect.anything(),
        );
    });

    it('waits for a delayed marker before reporting success', async () => {
        files.access.mockRejectedValueOnce(missing);
        const startup = waitForTerminalScriptStart(
            scriptPath,
            new AbortController().signal,
        );
        await vi.advanceTimersByTimeAsync(50);
        await expect(startup).resolves.toBe(true);
        expect(files.rm).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('fails after five seconds without leaving a polling timer', async () => {
        files.access.mockRejectedValue(missing);
        const startup = waitForTerminalScriptStart(
            scriptPath,
            new AbortController().signal,
        );
        await vi.advanceTimersByTimeAsync(5000);
        await expect(startup).resolves.toBe(false);
        expect(files.rm).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not poll a cancelled launch', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(
            waitForTerminalScriptStart(scriptPath, controller.signal),
        ).resolves.toBe(false);
        expect(files.access).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stops polling when terminal dispatch fails', async () => {
        files.access.mockRejectedValue(missing);
        const controller = new AbortController();
        const startup = waitForTerminalScriptStart(
            scriptPath,
            controller.signal,
        );
        await vi.advanceTimersByTimeAsync(0);
        controller.abort();
        await vi.advanceTimersByTimeAsync(50);
        await expect(startup).resolves.toBe(false);
        expect(files.access).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['access', 'rm'] as const)(
        'reports a marker %s failure',
        async (operation) => {
            const error = Object.assign(new Error('Permission denied'), {
                code: 'EACCES',
            });
            files[operation].mockRejectedValue(error);
            await expect(
                waitForTerminalScriptStart(
                    scriptPath,
                    new AbortController().signal,
                ),
            ).rejects.toBe(error);
            expect(vi.getTimerCount()).toBe(0);
        },
    );
});
