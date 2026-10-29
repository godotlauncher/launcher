import * as path from 'node:path';
import type {
    CommandLineGodotSelection,
    InstalledRelease,
} from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLineAliasService } from './command-line-alias.service.js';
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
const preferences = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
    readUserPreferencesSnapshot: vi.fn(),
    setUserPreferences: vi.fn(),
}));
vi.mock('../commands/userPreferences.js', () => preferences);
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
        preferences.getUserPreferences.mockResolvedValue({
            auto_create_editor_aliases: false,
        });
        preferences.readUserPreferencesSnapshot.mockResolvedValue({
            auto_create_editor_aliases: false,
            theme: 'dark',
        });
        preferences.setUserPreferences.mockImplementation(
            async (value) => value,
        );
        files = new Map();
        selection = null;
        coordinator = {
            read: vi.fn(async (definition) => ({
                value: definition
                    .pathProvider()
                    .endsWith('command-line-aliases.json')
                    ? []
                    : selection,
                version: '1',
            })),
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
        platform.register.mockResolvedValue({
            conflict: null,
            pathChanged: false,
        });
        service = new CommandLineGodotService(
            coordinator as never,
            {
                getOrThrow: () => path.resolve('fixture-home', '.gd-launcher'),
                get: () => true,
            } as never,
        );
    });

    it('applies selected creation as manual without reading or changing the global preference or default', async () => {
        const target = editor('4.8-stable');
        const item = {
            version: target.version,
            mono: false,
            name: 'godot48',
            management: 'manual' as const,
            action: 'create' as const,
        };
        const plan = vi
            .spyOn(CommandLineAliasService.prototype, 'previewChange')
            .mockResolvedValue({ items: [item], snapshot: 'same' });
        const apply = vi
            .spyOn(CommandLineAliasService.prototype, 'applyChangeItems')
            .mockResolvedValue([{ ...item, status: 'created' }]);
        platform.register.mockResolvedValue({ pathChanged: true });
        const reserve = vi.fn(() => unlock);
        const unlock = vi.fn();
        const preview = await service.previewSelectedAliasChange(
            { mode: 'create-missing', editors: [target, target] },
            async () => [target],
            () => undefined,
        );
        expect(plan).toHaveBeenCalledWith(
            { enabled: true, mode: 'create-missing' },
            [target],
            expect.any(Function),
            { editors: [target], management: 'manual' },
        );
        const result = await service.commitSelectedAliasChange(
            preview.token,
            async () => [target],
            reserve,
            () => undefined,
        );
        expect(result).toEqual({
            pathChanged: true,
            outcomes: [{ ...item, status: 'created' }],
        });
        expect(apply).toHaveBeenCalledWith([item], [target]);
        expect(reserve).toHaveBeenCalledWith([item]);
        expect(unlock).toHaveBeenCalledOnce();
        expect(preferences.readUserPreferencesSnapshot).not.toHaveBeenCalled();
        expect(preferences.setUserPreferences).not.toHaveBeenCalled();
        expect(selection).toBeNull();
        await expect(
            service.commitSelectedAliasChange(
                preview.token,
                async () => [target],
                reserve,
                () => undefined,
            ),
        ).rejects.toThrow('preview has changed');
        plan.mockRestore();
        apply.mockRestore();
    });

    it('rejects changed selected registrations and changed registry previews before writes', async () => {
        const target = editor('4.8-stable');
        const plan = vi
            .spyOn(CommandLineAliasService.prototype, 'previewChange')
            .mockResolvedValue({ items: [], snapshot: 'same' });
        const reserve = vi.fn(() => () => undefined);
        const preview = await service.previewSelectedAliasChange(
            { mode: 'remove', editors: [target] },
            async () => [target],
            () => undefined,
        );
        await expect(
            service.commitSelectedAliasChange(
                preview.token,
                async () => [{ ...target, editor_path: 'replacement' }],
                reserve,
                () => undefined,
            ),
        ).rejects.toThrow('editor has changed');
        plan.mockResolvedValue({ items: [], snapshot: 'changed' });
        await expect(
            service.commitSelectedAliasChange(
                preview.token,
                async () => [target],
                reserve,
                () => undefined,
            ),
        ).rejects.toThrow('preview has changed');
        expect(reserve).not.toHaveBeenCalled();
        expect(platform.register).not.toHaveBeenCalled();
        expect(coordinator.write).not.toHaveBeenCalled();
        plan.mockRestore();
    });

    it('keeps selected removal independent and releases reservations when execution fails', async () => {
        const target = editor('4.8-stable');
        const item = {
            version: target.version,
            mono: false,
            name: 'godot48',
            management: 'manual' as const,
            action: 'remove' as const,
        };
        const plan = vi
            .spyOn(CommandLineAliasService.prototype, 'previewChange')
            .mockResolvedValue({ items: [item], snapshot: 'same' });
        const apply = vi
            .spyOn(CommandLineAliasService.prototype, 'applyChangeItems')
            .mockRejectedValueOnce(new Error('Registry unavailable'))
            .mockResolvedValue([{ ...item, status: 'removed' }]);
        const unlock = vi.fn();
        const reserve = () => unlock;
        const preview = await service.previewSelectedAliasChange(
            { mode: 'remove', editors: [target] },
            async () => [target],
            () => undefined,
        );
        await expect(
            service.commitSelectedAliasChange(
                preview.token,
                async () => [target],
                reserve,
                () => undefined,
            ),
        ).rejects.toThrow('Registry unavailable');
        expect(unlock).toHaveBeenCalledOnce();
        const retry = await service.previewSelectedAliasChange(
            { mode: 'remove', editors: [target] },
            async () => [target],
            () => undefined,
        );
        await expect(
            service.commitSelectedAliasChange(
                retry.token,
                async () => [target],
                reserve,
                () => undefined,
            ),
        ).resolves.toMatchObject({ pathChanged: false });
        expect(platform.register).not.toHaveBeenCalled();
        expect(preferences.setUserPreferences).not.toHaveBeenCalled();
        plan.mockRestore();
        apply.mockRestore();
    });

    it('retains a newly opened choice when later options cross the preview capacity', async () => {
        const lookup = vi
            .spyOn(CommandLineAliasService.prototype, 'previewChange')
            .mockResolvedValue({ items: [], snapshot: 'same' });
        const installed = async () => [];
        const reserve = vi.fn(() => () => undefined);
        let oldest = '';
        for (let index = 0; index < 19; index++) {
            const preview = await service.previewAutomaticAliasChange(
                { enabled: false, mode: 'keep' },
                installed,
            );
            if (index === 0) oldest = preview.token;
        }
        const keep = await service.previewAutomaticAliasChange(
            { enabled: false, mode: 'keep' },
            installed,
        );
        await service.previewAutomaticAliasChange(
            { enabled: false, mode: 'remove-automatic' },
            installed,
        );
        await service.previewAutomaticAliasChange(
            { enabled: false, mode: 'remove-all' },
            installed,
        );
        await expect(
            service.commitAutomaticAliasChange(oldest, installed, reserve),
        ).rejects.toThrow('preview has changed');
        expect(preferences.setUserPreferences).not.toHaveBeenCalled();
        await expect(
            service.commitAutomaticAliasChange(keep.token, installed, reserve),
        ).resolves.toMatchObject({ outcomes: [] });
        expect(preferences.setUserPreferences).toHaveBeenCalledOnce();
        lookup.mockRestore();
    });

    it('saves the current preference before executing the reviewed batch and returns its outcomes', async () => {
        const items = [
            {
                name: 'first',
                version: 'first',
                mono: false,
                management: 'automatic' as const,
                action: 'remove' as const,
            },
            {
                name: 'second',
                version: 'second',
                mono: false,
                management: 'automatic' as const,
                action: 'remove' as const,
            },
        ];
        const plan = vi
            .spyOn(CommandLineAliasService.prototype, 'previewChange')
            .mockResolvedValue({ items, snapshot: 'same' });
        const apply = vi
            .spyOn(CommandLineAliasService.prototype, 'applyChangeItems')
            .mockImplementation(async (reviewed) => {
                expect(preferences.setUserPreferences).toHaveBeenCalledWith({
                    auto_create_editor_aliases: false,
                    theme: 'dark',
                });
                return reviewed.map((item) => ({
                    ...item,
                    status:
                        item.name === 'first'
                            ? ('failed' as const)
                            : ('removed' as const),
                    ...(item.name === 'first'
                        ? { error: 'Permission denied' }
                        : {}),
                }));
            });
        const unlock = vi.fn();
        const reserve = vi.fn(() => unlock);
        const preview = await service.previewAutomaticAliasChange(
            { enabled: false, mode: 'remove-all' },
            async () => [],
        );
        expect(preferences.setUserPreferences).not.toHaveBeenCalled();
        const result = await service.commitAutomaticAliasChange(
            preview.token,
            async () => [],
            reserve,
        );
        expect(result.outcomes.map(({ status }) => status)).toEqual([
            'failed',
            'removed',
        ]);
        expect(result.outcomes[0].error).toBe('Permission denied');
        expect(apply).toHaveBeenCalledExactlyOnceWith(items, []);
        expect(result.preferences.auto_create_editor_aliases).toBe(false);
        expect(unlock).toHaveBeenCalledOnce();
        expect(platform.register).not.toHaveBeenCalled();
        expect(coordinator.write).not.toHaveBeenCalled();
        plan.mockRestore();
        apply.mockRestore();
    });

    it('persists the preference before starting the staged creation batch', async () => {
        const items = [
            {
                name: 'godot48',
                version: '4.8-stable',
                mono: false,
                management: 'automatic' as const,
                action: 'create' as const,
            },
        ];
        const plan = vi
            .spyOn(CommandLineAliasService.prototype, 'previewChange')
            .mockResolvedValue({ items, snapshot: 'same' });
        const apply = vi
            .spyOn(CommandLineAliasService.prototype, 'applyChangeItems')
            .mockImplementation(async (reviewed) => {
                expect(preferences.setUserPreferences).toHaveBeenCalledWith({
                    auto_create_editor_aliases: true,
                    theme: 'dark',
                });
                return reviewed.map((item) => ({
                    ...item,
                    status: 'created' as const,
                }));
            });
        const preview = await service.previewAutomaticAliasChange(
            { enabled: true, mode: 'create-missing' },
            async () => [],
        );
        const result = await service.commitAutomaticAliasChange(
            preview.token,
            async () => [],
            () => vi.fn(),
        );
        expect(apply).toHaveBeenCalledExactlyOnceWith(items, []);
        expect(result.outcomes[0].status).toBe('created');
        plan.mockRestore();
        apply.mockRestore();
    });

    it('rejects stale previews before preferences or commands change', async () => {
        const plan = vi
            .spyOn(CommandLineAliasService.prototype, 'previewChange')
            .mockResolvedValueOnce({ items: [], snapshot: 'old' })
            .mockResolvedValueOnce({ items: [], snapshot: 'new' });
        const apply = vi.spyOn(
            CommandLineAliasService.prototype,
            'applyChangeItems',
        );
        const preview = await service.previewAutomaticAliasChange(
            { enabled: true, mode: 'create-missing' },
            async () => [],
        );
        await expect(
            service.commitAutomaticAliasChange(
                preview.token,
                async () => [],
                () => vi.fn(),
            ),
        ).rejects.toThrow('preview has changed');
        expect(preferences.setUserPreferences).not.toHaveBeenCalled();
        expect(apply).not.toHaveBeenCalled();
        plan.mockRestore();
        apply.mockRestore();
    });

    it('does not mutate aliases when preference persistence fails and releases reservations', async () => {
        const plan = vi
            .spyOn(CommandLineAliasService.prototype, 'previewChange')
            .mockResolvedValue({ items: [], snapshot: 'same' });
        const apply = vi.spyOn(
            CommandLineAliasService.prototype,
            'applyChangeItems',
        );
        preferences.setUserPreferences.mockRejectedValueOnce(
            new Error('Disk full'),
        );
        const unlock = vi.fn();
        const preview = await service.previewAutomaticAliasChange(
            { enabled: true, mode: 'keep' },
            async () => [],
        );
        await expect(
            service.commitAutomaticAliasChange(
                preview.token,
                async () => [],
                () => unlock,
            ),
        ).rejects.toThrow('Disk full');
        expect(apply).not.toHaveBeenCalled();
        expect(unlock).toHaveBeenCalledOnce();
        plan.mockRestore();
        apply.mockRestore();
    });

    it('rechecks future automatic creation after queued work completes', async () => {
        preferences.getUserPreferences.mockResolvedValue({
            auto_create_editor_aliases: true,
        });
        let complete: (value: { items: []; snapshot: string }) => void = () =>
            undefined;
        const held = new Promise<{ items: []; snapshot: string }>((resolve) => {
            complete = resolve;
        });
        const plan = vi
            .spyOn(CommandLineAliasService.prototype, 'previewChange')
            .mockReturnValueOnce(held);
        const create = vi.spyOn(
            CommandLineAliasService.prototype,
            'createAutomatically',
        );
        const preceding = service.previewAutomaticAliasChange(
            { enabled: false, mode: 'keep' },
            async () => [],
        );
        const automatic = service.createAutomaticAlias(
            editor('first'),
            'first',
        );
        preferences.getUserPreferences.mockResolvedValue({
            auto_create_editor_aliases: false,
        });
        complete({ items: [], snapshot: 'same' });
        await preceding;
        expect(await automatic).toBeUndefined();
        expect(create).not.toHaveBeenCalled();
        plan.mockRestore();
        create.mockRestore();
    });

    it('persists the registered version and reports existing command precedence', async () => {
        platform.register.mockResolvedValue({
            conflict: '/usr/bin/godot',
            pathChanged: true,
        });
        const state = await service.setDefault(editor('first'));
        expect(state.selection).toEqual({
            version: 'first',
            mono: false,
            editorPath: '/Editors/first',
        });
        expect(state.conflict).toBe('/usr/bin/godot');
        expect(state.pathChanged).toBe(true);
        expect((await service.getState()).selection).toEqual(state.selection);
    });

    it('reports unchanged PATH setup while switching or clearing the default', async () => {
        await service.setDefault(editor('first'));
        expect((await service.setDefault(editor('second'))).pathChanged).toBe(
            false,
        );
        expect((await service.setDefault(null)).pathChanged).toBe(false);
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

    it.each(['ENOENT', 'EACCES'])(
        'does not restore a default after deletion makes the target unavailable (%s)',
        async (code) => {
            await service.setDefault(editor('first'));
            await expect(
                service.withEditorRemoval(editor('first'), async () => {
                    io.stat.mockRejectedValue(
                        Object.assign(new Error('Target unavailable'), {
                            code,
                        }),
                    );
                    throw new Error('Partial deletion');
                }),
            ).rejects.toThrow('could not be restored');
            expect(files.has(platform.wrapperPath)).toBe(false);
            expect((await service.getState()).selection).toBeNull();
        },
    );

    it('preserves a foreign command introduced during failed removal', async () => {
        await service.setDefault(editor('first'));
        const foreign = '#!/bin/sh\necho foreign\n';
        await expect(
            service.withEditorRemoval(editor('first'), async () => {
                files.set(platform.wrapperPath, foreign);
                throw new Error('Deletion failed');
            }),
        ).rejects.toThrow('could not be restored');
        expect(files.get(platform.wrapperPath)).toBe(foreign);
        expect((await service.getState()).selection).toBeNull();
    });

    it('clears a replacement command rather than restoring a missing original after registration fails', async () => {
        await service.setDefault(editor('first'));
        await expect(
            service.updateRegisteredEditor(
                { ...editor('first'), editor_path: '/new-editor' },
                async () => {
                    io.stat.mockRejectedValue(
                        Object.assign(new Error('Original missing'), {
                            code: 'ENOENT',
                        }),
                    );
                    throw new Error('Registration failed');
                },
                editor('first'),
            ),
        ).rejects.toThrow('could not be restored');
        expect(files.has(platform.wrapperPath)).toBe(false);
        expect((await service.getState()).selection).toBeNull();
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
