import { constants } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => ({
    access: vi.fn(),
    mkdtemp: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
}));
vi.mock('node:fs/promises', () => files);
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

import { createPosixTerminalLaunchScript } from './project-terminal-launch.posix.util.js';

describe('POSIX terminal launch script', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        files.access.mockResolvedValue(undefined);
        files.mkdtemp.mockResolvedValue(path.join('/tmp', 'godot-launch-test'));
        files.writeFile.mockResolvedValue(undefined);
    });

    it('creates a private Linux helper without forcing windowed mode', async () => {
        const executable = "/editors/artist's Godot";
        const scriptPath = await createPosixTerminalLaunchScript(
            executable,
            '/project with spaces',
            false,
            'sh',
        );
        expect(scriptPath).toBe(
            path.join('/tmp', 'godot-launch-test', 'launch.sh'),
        );
        expect(files.access).toHaveBeenCalledWith(executable, constants.X_OK);
        const [, contents, options] = files.writeFile.mock.calls[0];
        expect(contents).toContain(
            "'/editors/artist'\\''s Godot' --path '/project with spaces' -e\n",
        );
        expect(contents).toContain('status=$?');
        expect(contents).toContain('Press Return to finish...');
        expect(contents).toContain('IFS= read -r _answer || true');
        expect(contents).toContain('exit "$status"');
        expect(contents).toContain('trap');
        expect(options).toMatchObject({ mode: 0o700, flag: 'wx' });
    });

    it('rejects an unavailable editor before allocating a helper', async () => {
        files.access.mockRejectedValue(new Error('Missing editor'));
        await expect(
            createPosixTerminalLaunchScript(
                '/missing/editor',
                '/project',
                false,
                'sh',
            ),
        ).rejects.toThrow('Missing editor');
        expect(files.mkdtemp).not.toHaveBeenCalled();
    });
});
