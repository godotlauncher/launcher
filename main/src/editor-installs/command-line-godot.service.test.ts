import * as path from 'node:path';
import type {
    CommandLineGodotSelection,
    InstalledRelease,
} from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLineGodotService } from './command-line-godot.service.js';

const io = vi.hoisted(() => ({
    lstat: vi.fn(),
    readFile: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    rm: vi.fn(),
    constants: { F_OK: 0, X_OK: 1 },
}));
const platform = vi.hoisted(() => ({
    register: vi.fn(),
    binDirectory: 'managed-bin',
    wrapperPath: 'managed-bin/godot',
}));
vi.mock('node:fs/promises', () => io);
vi.mock('node:os', () => ({
    platform: () => 'linux',
    userInfo: () => ({ shell: '/bin/bash' }),
}));
vi.mock('./command-line-path.adapter.js', () => ({
    CommandLinePathAdapter: class {
        binDirectory = platform.binDirectory;
        wrapperPath = platform.wrapperPath;
        register = platform.register;
    },
}));

describe('command-line Godot ownership and selection', () => {
    let files: Map<string, string>;
    let selection: CommandLineGodotSelection | null;
    let coordinator: {
        read: ReturnType<typeof vi.fn>;
        write: ReturnType<typeof vi.fn>;
    };
    let service: CommandLineGodotService;

    beforeEach(() => {
        vi.resetAllMocks();
        files = new Map();
        selection = null;
        coordinator = {
            read: vi.fn(async () => ({ value: selection, version: '1' })),
            write: vi.fn(async (_definition, value) => {
                selection = value;
                return { value, version: '2' };
            }),
        };
        io.lstat.mockImplementation(async (file) => {
            if (!files.has(file))
                throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
            return { isFile: () => true, isSymbolicLink: () => false };
        });
        io.readFile.mockImplementation(async (file) => files.get(file));
        io.stat.mockResolvedValue({ isFile: () => true });
        io.writeFile.mockImplementation(async (file, content) => {
            files.set(file, content);
        });
        io.rename.mockImplementation(async (source, target) => {
            files.set(target, files.get(source) as string);
            files.delete(source);
        });
        io.rm.mockImplementation(async (file) => {
            files.delete(file);
        });
        platform.register.mockResolvedValue(null);
        service = new CommandLineGodotService(
            coordinator as never,
            {
                getOrThrow: () => path.resolve('fixture-home', '.gd-launcher'),
                get: () => true,
            } as never,
        );
    });

    it('persists the registered version and reports existing command precedence', async () => {
        platform.register.mockResolvedValue('/usr/bin/godot');
        const state = await service.setDefault(editor('first'));
        expect(state.selection).toEqual({
            version: 'first',
            mono: false,
            editorPath: '/Editors/first',
        });
        expect(state.conflict).toBe('/usr/bin/godot');
        expect((await service.getState()).selection).toEqual(state.selection);
    });

    it('removes only the owned wrapper and selection, keeping PATH setup', async () => {
        await service.setDefault(editor('first'));
        platform.register.mockClear();
        io.rm.mockClear();
        await service.setDefault(null);
        expect(files.has(platform.wrapperPath)).toBe(false);
        expect((await service.getState()).selection).toBeNull();
        expect(platform.register).not.toHaveBeenCalled();
        expect(io.rm).toHaveBeenCalledExactlyOnceWith(platform.wrapperPath, {
            force: true,
        });
    });

    it('preserves a user-managed command and refuses symlinks', async () => {
        files.set(platform.wrapperPath, '#!/bin/sh\necho user command\n');
        await expect(service.setDefault(editor('first'))).rejects.toThrow(
            'not managed',
        );
        expect(files.get(platform.wrapperPath)).toContain('echo user command');
        io.lstat.mockResolvedValue({
            isFile: () => false,
            isSymbolicLink: () => true,
        });
        await expect(service.setDefault(null)).rejects.toThrow('not managed');
        expect(coordinator.write).not.toHaveBeenCalled();
    });

    it('restores the prior working wrapper when selection persistence fails', async () => {
        await service.setDefault(editor('first'));
        const original = files.get(platform.wrapperPath);
        coordinator.write.mockRejectedValueOnce(new Error('Disk full'));
        await expect(service.setDefault(editor('second'))).rejects.toThrow(
            'Disk full',
        );
        expect(files.get(platform.wrapperPath)).toBe(original);
        expect((await service.getState()).selection?.version).toBe('first');
    });

    it('leaves the previous command intact if PATH registration fails', async () => {
        await service.setDefault(editor('first'));
        const original = files.get(platform.wrapperPath);
        platform.register.mockRejectedValueOnce(
            new Error('Profile is read-only'),
        );
        await expect(service.setDefault(editor('second'))).rejects.toThrow(
            'Profile is read-only',
        );
        expect(files.get(platform.wrapperPath)).toBe(original);
        expect((await service.getState()).selection?.version).toBe('first');
    });

    it('does not clear another editor when an unrelated installation is removed', async () => {
        await service.setDefault(editor('first'));
        const remove = vi.fn().mockResolvedValue(undefined);
        await service.withEditorRemoval(editor('second'), remove);
        expect((await service.getState()).selection?.version).toBe('first');
        await service.withEditorRemoval(editor('first'), remove);
        expect((await service.getState()).selection).toBeNull();
        expect(remove).toHaveBeenCalledTimes(2);
    });

    it('refuses destructive removal when the selected wrapper is no longer owned', async () => {
        await service.setDefault(editor('first'));
        const changed = '#!/bin/sh\necho user command\n';
        files.set(platform.wrapperPath, changed);
        const remove = vi.fn().mockResolvedValue(undefined);
        await expect(
            service.withEditorRemoval(editor('first'), remove),
        ).rejects.toThrow('not managed');
        expect(remove).not.toHaveBeenCalled();
        expect(files.get(platform.wrapperPath)).toBe(changed);
        expect((await service.getState()).selection?.version).toBe('first');
    });

    it('does not remove editor files when clearing the persisted selection fails', async () => {
        await service.setDefault(editor('first'));
        const original = files.get(platform.wrapperPath);
        coordinator.write.mockRejectedValueOnce(new Error('Disk full'));
        const remove = vi.fn().mockResolvedValue(undefined);
        await expect(
            service.withEditorRemoval(editor('first'), remove),
        ).rejects.toThrow('Disk full');
        expect(remove).not.toHaveBeenCalled();
        expect(files.get(platform.wrapperPath)).toBe(original);
        expect((await service.getState()).selection?.version).toBe('first');
    });

    it('restores the previous command and selection if editor deletion fails', async () => {
        await service.setDefault(editor('first'));
        const original = files.get(platform.wrapperPath);
        const remove = vi.fn(async () => {
            expect(files.has(platform.wrapperPath)).toBe(false);
            expect(selection).toBeNull();
            throw new Error('Editor is in use');
        });
        await expect(
            service.withEditorRemoval(editor('first'), remove),
        ).rejects.toThrow('Editor is in use');
        expect(remove).toHaveBeenCalledOnce();
        expect(files.get(platform.wrapperPath)).toBe(original);
        expect((await service.getState()).selection?.version).toBe('first');
    });

    it('retargets a selected custom registration and rolls back a failed replacement', async () => {
        await service.setDefault(editor('first'));
        const replacement = {
            ...editor('first'),
            editor_path: '/new custom build/godot',
        };
        await service.updateRegisteredEditor(
            replacement,
            async () => 'registered',
        );
        expect(files.get(platform.wrapperPath)).toContain(
            '/new custom build/godot',
        );
        expect((await service.getState()).selection?.editorPath).toBe(
            replacement.editor_path,
        );
        await expect(
            service.updateRegisteredEditor(editor('first'), async () => {
                throw new Error('Registration failed');
            }),
        ).rejects.toThrow('Registration failed');
        expect(files.get(platform.wrapperPath)).toContain(
            '/new custom build/godot',
        );
        expect((await service.getState()).selection?.editorPath).toBe(
            replacement.editor_path,
        );
    });

    it('retains selection when an executable disappears but rejects selecting unavailable editors', async () => {
        await service.setDefault(editor('first'));
        io.stat.mockRejectedValue(new Error('Editor missing'));
        expect((await service.getState()).selection?.version).toBe('first');
        await expect(service.setDefault(editor('second'))).rejects.toThrow(
            'Editor missing',
        );
        expect((await service.getState()).selection?.version).toBe('first');
    });
});

/**
 * Creates the authoritative editor fields used by these command tests.
 * @param version - Editor identity and executable basename.
 */
function editor(version: string): InstalledRelease {
    return {
        version,
        mono: false,
        editor_path: `/Editors/${version}`,
        valid: true,
    } as InstalledRelease;
}
