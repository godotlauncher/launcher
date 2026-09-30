import { constants } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const processMocks = vi.hoisted(() => ({
    execFile: vi.fn(),
}));
const fileMocks = vi.hoisted(() => ({
    access: vi.fn(),
    mkdtemp: vi.fn(),
    rm: vi.fn(),
    writeFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({ execFile: processMocks.execFile }));
vi.mock('node:fs/promises', () => fileMocks);
vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => '/tmp') },
}));

import { createMacOSTerminalLaunchScript } from './project-terminal-launch.macos.util.js';
import { removePosixTerminalLaunchScript } from './project-terminal-launch.posix.util.js';

describe('macOS terminal launch script', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        processMocks.execFile.mockImplementation(
            (_command, _args, _options, callback) => {
                callback(
                    null,
                    JSON.stringify({ CFBundleExecutable: 'Custom Godot' }),
                    '',
                );
            },
        );
        fileMocks.access.mockResolvedValue(undefined);
        fileMocks.mkdtemp.mockResolvedValue('/tmp/godot-launch-123456');
        fileMocks.writeFile.mockResolvedValue(undefined);
        fileMocks.rm.mockResolvedValue(undefined);
    });

    it('uses the bundle executable and quotes paths with spaces and apostrophes', async () => {
        const scriptPath = await createMacOSTerminalLaunchScript(
            "/editors/Mario's Godot.app",
            "/projects/artist's demo",
            true,
        );

        expect(processMocks.execFile).toHaveBeenCalledWith(
            '/usr/bin/plutil',
            [
                '-convert',
                'json',
                '-o',
                '-',
                path.join(
                    "/editors/Mario's Godot.app",
                    'Contents',
                    'Info.plist',
                ),
            ],
            expect.objectContaining({ encoding: 'utf8' }),
            expect.any(Function),
        );
        expect(fileMocks.access).toHaveBeenCalledWith(
            path.join(
                "/editors/Mario's Godot.app",
                'Contents',
                'MacOS',
                'Custom Godot',
            ),
            constants.X_OK,
        );
        expect(scriptPath).toBe('/tmp/godot-launch-123456/launch.command');
        const [writtenPath, script, options] =
            fileMocks.writeFile.mock.calls[0];
        expect(writtenPath).toBe(scriptPath);
        expect(script).toContain(
            "'/editors/Mario'\\''s Godot.app/Contents/MacOS/Custom Godot' --path '/projects/artist'\\''s demo' -e -w",
        );
        expect(script).toContain('IFS= read -r _answer || true');
        expect(options).toEqual(
            expect.objectContaining({ mode: 0o700, flag: 'wx' }),
        );
    });

    it('rejects invalid executable names before creating a script', async () => {
        processMocks.execFile.mockImplementation(
            (_command, _args, _options, callback) => {
                callback(
                    null,
                    JSON.stringify({ CFBundleExecutable: '../Godot' }),
                    '',
                );
            },
        );

        await expect(
            createMacOSTerminalLaunchScript(
                '/editors/Godot.app',
                '/game',
                false,
            ),
        ).rejects.toThrow('no valid executable name');
        expect(fileMocks.mkdtemp).not.toHaveBeenCalled();
    });

    it('cleans the private directory if writing fails', async () => {
        fileMocks.writeFile.mockRejectedValue(new Error('Disk full'));

        await expect(
            createMacOSTerminalLaunchScript(
                '/editors/Godot.app',
                '/game',
                false,
            ),
        ).rejects.toThrow('Disk full');
        expect(fileMocks.rm).toHaveBeenCalledWith('/tmp/godot-launch-123456', {
            recursive: true,
            force: true,
        });
    });

    it('removes an unused script directory when Terminal cannot start', async () => {
        await removePosixTerminalLaunchScript(
            '/tmp/godot-launch-123456/launch.command',
        );
        expect(fileMocks.rm).toHaveBeenCalledWith('/tmp/godot-launch-123456', {
            recursive: true,
            force: true,
        });
    });
});
