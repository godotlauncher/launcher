import * as path from 'node:path';
import type { InstalledRelease } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLineAliasService } from './command-line-alias.service.js';
import type { AliasEntry } from './command-line-alias.store.js';
import {
    getAliasNameError,
    suggestAutomaticAlias,
} from './command-line-alias.util.js';

const io = vi.hoisted(() => ({
    lstat: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
    open: vi.fn(),
    link: vi.fn(),
    unlink: vi.fn(),
    constants: { F_OK: 0, X_OK: 1, O_RDONLY: 0, O_NOFOLLOW: 131072 },
}));
vi.mock('node:fs/promises', () => io);
vi.mock('../i18n/index.js', () => ({
    t: (key: string, values?: { previous?: string; name?: string }) =>
        key.endsWith('renameRecovery')
            ? `${key}: ${values?.previous} -> ${values?.name}`
            : key,
}));

/**
 * Supplies an authoritative installation for a portable mocked filesystem.
 * @param version - Installation identity.
 */
function editor(version = '4.8-stable'): InstalledRelease {
    return {
        version,
        mono: false,
        editor_path: path.resolve('editors', version),
        valid: true,
    } as InstalledRelease;
}

describe('alias naming', () => {
    it.each(['godot48', 'g', 'a'.repeat(48), 'studio-48'])(
        'accepts %s',
        (name) => expect(getAliasNameError(name)).toBeNull(),
    );
    it.each([
        '',
        'Godot48',
        '4godot',
        '-godot',
        'godot_48',
        'a'.repeat(49),
        'godot 48',
        '../godot',
        'godot\n',
        'gódot',
    ])('rejects literal invalid name %j', (name) =>
        expect(getAliasNameError(name)).toBe('invalid'),
    );
    it.each([
        'godot',
        'con',
        'prn',
        'aux',
        'nul',
        'com1',
        'com9',
        'lpt1',
        'lpt9',
    ])('reserves %s', (name) =>
        expect(getAliasNameError(name)).toBe('reserved'),
    );
});

describe('exclusive alias transactions', () => {
    let entries: AliasEntry[];
    let files: Map<string, { ino: bigint; content: string; symlink?: boolean }>;
    let nextInode: bigint;
    let service: CommandLineAliasService;
    let coordinator: {
        read: ReturnType<typeof vi.fn>;
        write: ReturnType<typeof vi.fn>;
    };
    const bin = path.resolve('profile', 'bin');
    const destination = (name: string) => path.join(bin, name);
    const adapter = {
        binDirectory: bin,
        pathForCommand: destination,
        findConflict: vi.fn(),
        findConflicts: vi.fn(),
        register: vi.fn(),
    };
    const missing = () =>
        Object.assign(new Error('Missing'), { code: 'ENOENT' });
    const info = (node: { ino: bigint; symlink?: boolean }) => ({
        dev: 1n,
        ino: node.ino,
        isFile: () => !node.symlink,
        isSymbolicLink: () => !!node.symlink,
    });
    beforeEach(() => {
        vi.resetAllMocks();
        entries = [];
        files = new Map();
        nextInode = 1n;
        coordinator = {
            read: vi.fn(async () => ({
                value: structuredClone(entries),
                version: '1',
            })),
            write: vi.fn(async (definition, value) => {
                entries = structuredClone(definition.normalize(value));
                return { value: entries, version: '2' };
            }),
        };
        adapter.findConflict.mockResolvedValue(null);
        adapter.findConflicts.mockImplementation(
            async (names: string[]) =>
                new Map(names.map((name) => [name, null])),
        );
        adapter.register.mockResolvedValue({
            pathChanged: false,
            conflict: null,
        });
        io.stat.mockResolvedValue({ isFile: () => true });
        io.lstat.mockImplementation(async (file) => {
            const node = files.get(file);
            if (!node) throw missing();
            return info(node);
        });
        io.open.mockImplementation(async (file, flags) => {
            if (flags === 'wx') {
                if (files.has(file))
                    throw Object.assign(new Error('Exists'), {
                        code: 'EEXIST',
                    });
                files.set(file, { ino: nextInode++, content: '' });
            }
            const node = files.get(file);
            if (!node) throw missing();
            return {
                writeFile: vi.fn(async (content) => {
                    node.content = content;
                }),
                sync: vi.fn(),
                stat: vi.fn(async () => info(node)),
                close: vi.fn(),
                readFile: vi.fn(async () => node.content),
            };
        });
        io.link.mockImplementation(async (source, target) => {
            if (files.has(target))
                throw Object.assign(new Error('Exists'), { code: 'EEXIST' });
            const node = files.get(source);
            if (!node) throw missing();
            files.set(target, node);
        });
        io.unlink.mockImplementation(async (file) => {
            if (!files.delete(file)) throw missing();
        });
        service = new CommandLineAliasService(
            coordinator as never,
            path.resolve('profile'),
            adapter as never,
            'linux',
        );
    });

    it.each([
        ['4.8-stable', 'godot48'],
        ['4.8-beta1', 'godot48b1'],
        ['4.8-beta2', 'godot48b2'],
        ['4.8.0-beta1', 'godot48b1'],
        ['4.8-beta.2', 'godot48b2'],
        ['4.8-dev1', 'godot48d1'],
        ['4.8-dev2', 'godot48d2'],
        ['4.8-alpha1', 'godot48a1'],
        ['4.8-rc1', 'godot48rc1'],
        ['4.8-rc2', 'godot48rc2'],
        ['4.7.2-rc1', 'godot472rc1'],
        ['4.8.0-stable', 'godot48'],
        ['4.7.2-stable', 'godot472'],
        ['4.8.0-custom.1', 'godot48'],
        ['studio-build', 'godot-custom'],
    ])('suggests automatic command %s as %s', (version, expected) =>
        expect(suggestAutomaticAlias(version)).toBe(expected),
    );

    it('creates separate aliases for numbered prereleases and stable', async () => {
        const installed = [
            '4.8-beta1',
            '4.8-beta2',
            '4.8-dev1',
            '4.8-rc1',
            '4.8-stable',
        ].map(editor);
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            installed,
        );
        expect(
            plan.items.map(({ name, action }) => ({ name, action })),
        ).toEqual(
            [
                'godot48b1',
                'godot48b2',
                'godot48d1',
                'godot48rc1',
                'godot48',
            ].map((name) => ({ name, action: 'create' })),
        );
        await service.applyChangeItems(plan.items, installed);
        expect(entries.map(({ binding }) => binding.name)).toEqual([
            'godot48b1',
            'godot48b2',
            'godot48d1',
            'godot48rc1',
            'godot48',
        ]);
    });

    it('keeps an existing prerelease alias while creating the next beta alias', async () => {
        const first = editor('4.8-beta1');
        const second = editor('4.8-beta2');
        await service.apply(first, 'godot48', [first, second]);
        const saved = structuredClone(entries[0]);
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [first, second],
        );
        expect(plan.items).toMatchObject([
            { version: second.version, name: 'godot48b2', action: 'create' },
        ]);
        await service.applyChangeItems(plan.items, [first, second]);
        expect(entries[0]).toEqual(saved);
        expect(entries[1].binding.name).toBe('godot48b2');
    });

    it('does not recover unrelated pending work or replace a saved binding during automatic creation', async () => {
        await service.apply(editor('other'), 'godot-other', [editor('other')]);
        entries[0].operation = { kind: 'remove' };
        const unrelated = structuredClone(entries[0]);
        await service.createAutomatically(editor(), 'godot48');
        expect(
            entries.find((entry) => entry.binding.name === 'godot-other'),
        ).toEqual(unrelated);
        const saved = structuredClone(
            entries.find((entry) => entry.binding.name === 'godot48'),
        );
        expect(
            await service.createAutomatically(editor(), 'godot-new'),
        ).toBeUndefined();
        expect(
            entries.find((entry) => entry.binding.name === 'godot48'),
        ).toEqual(saved);
        expect(files.has(destination('godot-new'))).toBe(false);
    });

    it('preserves the default and skips a binding with pending work during automatic creation', async () => {
        const defaultCommand = { ino: 998n, content: 'default' };
        files.set(destination('godot'), defaultCommand);
        await service.createAutomatically(editor(), 'godot48');
        expect(files.get(destination('godot'))).toBe(defaultCommand);
        entries[0].operation = { kind: 'remove' };
        const pending = structuredClone(entries[0]);
        expect(
            await service.createAutomatically(editor(), 'godot-new'),
        ).toBeUndefined();
        expect(entries[0]).toEqual(pending);
        expect(files.has(destination('godot-new'))).toBe(false);
    });

    it('never completes failed automatic creation when both failure persistence and cleanup were blocked', async () => {
        const write = coordinator.write.getMockImplementation();
        const unlink = io.unlink.getMockImplementation();
        if (!write || !unlink) throw new Error('Missing filesystem fixture');
        let blocked = false;
        coordinator.write.mockImplementation(async (...args) => {
            if (blocked) throw new Error('Registry unavailable');
            return write(...args);
        });
        io.unlink.mockImplementation(async (...args) => {
            if (blocked) throw new Error('Cleanup unavailable');
            return unlink(...args);
        });
        adapter.register.mockImplementationOnce(async () => {
            blocked = true;
            throw new Error('PATH setup failed');
        });
        await expect(
            service.createAutomatically(editor(), 'godot48'),
        ).rejects.toThrow('PATH setup failed');
        expect(entries[0].operation?.kind).toBe('remove');
        blocked = false;
        expect((await service.getState([editor()])).aliases).toEqual([]);
        expect(io.link).not.toHaveBeenCalled();
        expect(files.size).toBe(0);
    });

    it('attempts owned-file cleanup even when a failed manual creation cannot persist its removal intent', async () => {
        const write = coordinator.write.getMockImplementation();
        if (!write) throw new Error('Missing persistence fixture');
        let blocked = false;
        coordinator.write.mockImplementation(async (...args) => {
            if (blocked) throw new Error('Registry unavailable');
            return write(...args);
        });
        adapter.register.mockImplementationOnce(async () => {
            blocked = true;
            throw new Error('PATH setup failed');
        });
        await expect(
            service.apply(editor(), 'godot48', [editor()]),
        ).rejects.toThrow('PATH setup failed');
        expect(files.size).toBe(0);
        blocked = false;
        await service.getState([editor()]);
        expect(files.has(destination('godot48'))).toBe(false);
        expect(io.link).not.toHaveBeenCalled();
    });

    it('does not suffix or overwrite an unavailable automatic name', async () => {
        const foreign = { ino: 999n, content: 'foreign' };
        files.set(destination('godot48'), foreign);
        await expect(
            service.createAutomatically(editor(), 'godot48'),
        ).rejects.toThrow('external');
        expect(files.get(destination('godot48'))).toBe(foreign);
        expect(entries).toEqual([]);
        expect(adapter.register).not.toHaveBeenCalled();
    });

    it('checks names without writing files, PATH or registrations', async () => {
        expect(await service.check(editor(), 'godot48')).toEqual({
            available: true,
        });
        expect(coordinator.write).not.toHaveBeenCalled();
        expect(io.open).not.toHaveBeenCalled();
        expect(adapter.register).not.toHaveBeenCalled();
    });
    it('creates only missing selected aliases as manual and preserves existing origins', async () => {
        const existing = editor('4.7-stable');
        const selected = editor();
        const unselected = editor('4.9-stable');
        await service.createAutomatically(existing, 'custom-saved-name');
        const before = structuredClone(entries);
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [existing, selected, unselected],
            () => undefined,
            { editors: [existing, selected], management: 'manual' },
        );
        expect(plan.items).toMatchObject([
            {
                version: selected.version,
                name: 'godot48',
                action: 'create',
                management: 'manual',
            },
        ]);
        await service.applyChangeItems(plan.items, [
            existing,
            selected,
            unselected,
        ]);
        expect(
            entries.find(({ binding }) => binding.version === existing.version),
        ).toEqual(before[0]);
        expect(
            entries.find(({ binding }) => binding.version === selected.version)
                ?.binding.management,
        ).toBe('manual');
        expect(
            entries.some(
                ({ binding }) => binding.version === unselected.version,
            ),
        ).toBe(false);
    });

    it('removes only selected named commands regardless of origin without PATH changes', async () => {
        const first = editor();
        const second = editor('4.9-stable');
        await service.apply(first, 'manual-command', [first, second]);
        await service.createAutomatically(second, 'automatic-command');
        const before = structuredClone(
            entries.find(({ binding }) => binding.version === second.version),
        );
        vi.clearAllMocks();
        const plan = await service.previewChange(
            { enabled: false, mode: 'remove-all' },
            [first, second],
            () => undefined,
            { editors: [first], management: 'manual' },
        );
        expect(plan.items).toMatchObject([
            { name: 'manual-command', action: 'remove' },
        ]);
        await service.applyChangeItems(plan.items, [first, second]);
        expect(entries).toEqual([before]);
        expect(files.has(destination('automatic-command'))).toBe(true);
        expect(adapter.register).not.toHaveBeenCalled();
    });

    it('skips duplicate suggestions and busy selected targets without overwriting', async () => {
        const first = editor();
        const mono = { ...first, mono: true };
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [first, mono],
            () => undefined,
            { editors: [first, mono], management: 'manual' },
        );
        expect(plan.items.map((item) => item.action)).toEqual([
            'create',
            'skip',
        ]);
        const busy = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [first],
            () => 'Busy',
            { editors: [first], management: 'manual' },
        );
        expect(busy.items[0]).toMatchObject({ action: 'skip', reason: 'Busy' });
        expect(entries).toEqual([]);
        expect(io.link).not.toHaveBeenCalled();
    });

    it('previews missing commands without recovery, persistence, files or PATH changes', async () => {
        await service.apply(editor('other'), 'other-command', [
            editor('other'),
        ]);
        entries[0].operation = { kind: 'remove' };
        const before = structuredClone(entries);
        vi.clearAllMocks();
        const result = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [editor(), editor('other')],
        );
        expect(result.items.map(({ action }) => action)).toEqual(['create']);
        expect(entries).toEqual(before);
        expect(coordinator.write).not.toHaveBeenCalled();
        expect(io.link).not.toHaveBeenCalled();
        expect(io.unlink).not.toHaveBeenCalled();
        expect(adapter.register).not.toHaveBeenCalled();
    });

    it('shares terminal lookups within one preview and refreshes the next request', async () => {
        const releases = [editor(), editor('4.9.0')];
        await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            releases,
        );
        expect(adapter.findConflicts).toHaveBeenCalledTimes(1);
        expect(adapter.findConflict).not.toHaveBeenCalled();
        adapter.findConflicts.mockImplementationOnce(
            async (names: string[]) =>
                new Map(names.map((name) => [name, '/external/command'])),
        );
        const next = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            releases,
        );
        expect(next.items.every(({ action }) => action === 'skip')).toBe(true);
        expect(adapter.findConflicts).toHaveBeenCalledTimes(2);
    });

    it('skips invalid suggested names before terminal lookup', async () => {
        const result = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [editor(`${'1'.repeat(60)}.0`)],
        );
        expect(result.items[0].action).toBe('skip');
        expect(adapter.findConflicts).not.toHaveBeenCalled();
    });

    it('does not start terminal lookups for a local file conflict', async () => {
        files.set(destination('godot48'), { ino: 999n, content: 'external' });
        const result = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [editor()],
        );
        expect(result.items[0].action).toBe('skip');
        expect(adapter.findConflicts).not.toHaveBeenCalled();
    });

    it('fails closed when the preview batch fails and checks freshly when applying', async () => {
        adapter.findConflicts.mockRejectedValueOnce(new Error('Shell failed'));
        const failed = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [editor()],
        );
        expect(failed.items[0]).toMatchObject({
            action: 'skip',
            reason: 'Shell failed',
        });
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [editor()],
        );
        adapter.findConflicts.mockResolvedValueOnce(
            new Map([['godot48', '/new/external/command']]),
        );
        expect(
            (await service.applyChangeItems(plan.items, [editor()]))[0].status,
        ).toBe('failed');
        expect(files.has(destination('godot48'))).toBe(false);
    });

    it('reserves colliding suggested names within a preview', async () => {
        const mono = { ...editor(), mono: true };
        const result = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [editor(), mono],
        );
        expect(result.items.map(({ action }) => action)).toEqual([
            'create',
            'skip',
        ]);
        expect(result.items[1].reason).toBeDefined();
    });

    it('creates reviewed missing commands automatically without touching PATH or the default', async () => {
        const original = { ino: 99n, content: 'default' };
        files.set(destination('godot'), original);
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [editor()],
        );
        expect(
            (await service.applyChangeItems(plan.items, [editor()]))[0].status,
        ).toBe('created');
        expect(entries[0].binding.management).toBe('automatic');
        expect(files.has(destination('godot48'))).toBe(true);
        expect(files.get(destination('godot'))).toBe(original);
        expect(adapter.register).not.toHaveBeenCalled();
    });

    it('stages every bulk command before one fresh terminal lookup and publishes sequentially', async () => {
        const releases = [editor(), editor('4.9.0')];
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            releases,
        );
        vi.clearAllMocks();
        adapter.findConflicts.mockImplementationOnce(
            async (names: string[]) => {
                expect(entries).toHaveLength(2);
                expect(
                    entries.every(
                        ({ operation }) => operation?.kind === 'remove',
                    ),
                ).toBe(true);
                expect(files.size).toBe(2);
                expect(io.link).not.toHaveBeenCalled();
                return new Map(names.map((name) => [name, null]));
            },
        );
        const outcomes = await service.applyChangeItems(plan.items, releases);
        expect(outcomes.map(({ status }) => status)).toEqual([
            'created',
            'created',
        ]);
        expect(adapter.findConflicts).toHaveBeenCalledExactlyOnceWith([
            'godot48',
            'godot49',
        ]);
        expect(adapter.findConflict).not.toHaveBeenCalled();
        expect(adapter.register).not.toHaveBeenCalled();
        expect(
            entries.every(
                ({ operation, binding }) =>
                    !operation && binding.management === 'automatic',
            ),
        ).toBe(true);
    });

    it('preserves an external command arriving after staging and reports actual partial outcomes', async () => {
        const releases = [editor(), editor('4.9.0')];
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            releases,
        );
        const foreign = { ino: 999n, content: 'external' };
        adapter.findConflicts.mockImplementationOnce(
            async (names: string[]) => {
                files.set(destination(names[0]), foreign);
                return new Map(names.map((name) => [name, null]));
            },
        );
        const outcomes = await service.applyChangeItems(plan.items, releases);
        expect(outcomes.map(({ status }) => status)).toEqual([
            'failed',
            'created',
        ]);
        expect(files.get(destination('godot48'))).toBe(foreign);
        expect(files.has(destination('godot49'))).toBe(true);
        expect(
            entries.find(({ binding }) => binding.name === 'godot48')?.operation
                ?.kind,
        ).toBe('remove');
    });

    it('cleans a failed stage and excludes it from the fresh batch while completing other commands', async () => {
        const releases = [editor(), editor('4.9.0')];
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            releases,
        );
        vi.clearAllMocks();
        const write = coordinator.write.getMockImplementation();
        if (!write) throw new Error('Missing persistence fixture');
        let failStage = true;
        coordinator.write.mockImplementation(async (definition, value) => {
            if (
                failStage &&
                value.some((entry: AliasEntry) => entry.binding.ino)
            ) {
                failStage = false;
                throw new Error('Stage failed');
            }
            return write(definition, value);
        });
        const outcomes = await service.applyChangeItems(plan.items, releases);
        expect(outcomes.map(({ status }) => status)).toEqual([
            'failed',
            'created',
        ]);
        expect(outcomes[0].error).toBe('Stage failed');
        expect(adapter.findConflicts).toHaveBeenCalledExactlyOnceWith([
            'godot49',
        ]);
        expect(entries).toHaveLength(1);
        expect(files.size).toBe(2);
    });

    it('fails all staged commands closed when the fresh terminal batch fails', async () => {
        const releases = [editor(), editor('4.9.0')];
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            releases,
        );
        adapter.findConflicts.mockRejectedValueOnce(new Error('Shell failed'));
        const outcomes = await service.applyChangeItems(plan.items, releases);
        expect(
            outcomes.map(({ status, error }) => ({ status, error })),
        ).toEqual([
            { status: 'failed', error: 'Shell failed' },
            { status: 'failed', error: 'Shell failed' },
        ]);
        expect(io.link).not.toHaveBeenCalled();
        expect(entries).toEqual([]);
        expect(files.size).toBe(0);
    });

    it.each(['collision', 'missing result'])(
        'fails closed on a fresh terminal %s',
        async (failure) => {
            const plan = await service.previewChange(
                { enabled: true, mode: 'create-missing' },
                [editor()],
            );
            adapter.findConflicts.mockResolvedValueOnce(
                failure === 'collision'
                    ? new Map([['godot48', '/external/command']])
                    : new Map(),
            );
            expect(
                (await service.applyChangeItems(plan.items, [editor()]))[0]
                    .status,
            ).toBe('failed');
            expect(entries).toEqual([]);
            expect(files.size).toBe(0);
            expect(io.link).not.toHaveBeenCalled();
        },
    );

    it('rechecks executable availability after the staged terminal lookup', async () => {
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [editor()],
        );
        adapter.findConflicts.mockImplementationOnce(
            async (names: string[]) => {
                io.access.mockRejectedValueOnce(
                    new Error('Executable missing'),
                );
                return new Map(names.map((name) => [name, null]));
            },
        );
        expect(
            (await service.applyChangeItems(plan.items, [editor()]))[0].status,
        ).toBe('failed');
        expect(entries).toEqual([]);
        expect(files.size).toBe(0);
        expect(io.link).not.toHaveBeenCalled();
    });

    it('removes a published bulk command when the final active registry write fails', async () => {
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [editor()],
        );
        const write = coordinator.write.getMockImplementation();
        if (!write) throw new Error('Missing persistence fixture');
        coordinator.write.mockImplementation(async (definition, value) => {
            if (value.some((entry: AliasEntry) => !entry.operation))
                throw new Error('Final write failed');
            return write(definition, value);
        });
        const outcomes = await service.applyChangeItems(plan.items, [editor()]);
        expect(outcomes[0]).toMatchObject({
            status: 'failed',
            error: 'Final write failed',
        });
        expect(io.link).toHaveBeenCalledOnce();
        expect(entries).toEqual([]);
        expect(files.size).toBe(0);
    });

    it('retains cleanup-only reservations after batch failure when owned witnesses cannot be removed', async () => {
        const releases = [editor(), editor('4.9.0')];
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            releases,
        );
        adapter.findConflicts.mockRejectedValueOnce(new Error('Shell failed'));
        io.unlink.mockRejectedValue(new Error('Locked'));
        await service.applyChangeItems(plan.items, releases);
        expect(entries).toHaveLength(2);
        expect(
            entries.every(({ operation }) => operation?.kind === 'remove'),
        ).toBe(true);
        expect(io.link).not.toHaveBeenCalled();
        expect(
            (await service.getState(releases)).aliases.every(
                ({ state }) => state === 'unresolved',
            ),
        ).toBe(true);
    });

    it('recovers an interrupted staged batch solely by removing provisional witnesses', async () => {
        const releases = [editor(), editor('4.9.0')];
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            releases,
        );
        let snapshot:
            | { entries: AliasEntry[]; files: typeof files }
            | undefined;
        adapter.findConflicts.mockImplementationOnce(
            async (names: string[]) => {
                snapshot = {
                    entries: structuredClone(entries),
                    files: structuredClone(files),
                };
                return new Map(names.map((name) => [name, null]));
            },
        );
        await service.applyChangeItems(plan.items, releases);
        if (!snapshot) throw new Error('Missing interruption snapshot');
        entries = snapshot.entries;
        files = snapshot.files;
        vi.clearAllMocks();
        expect((await service.getState(releases)).aliases).toEqual([]);
        expect(io.link).not.toHaveBeenCalled();
        expect(files.size).toBe(0);
    });

    it('keeps manual and legacy unknown registrations when removing automatic commands', async () => {
        await service.createAutomatically(editor(), 'automatic');
        await service.apply(editor('manual'), 'manual-command', [
            editor(),
            editor('manual'),
        ]);
        await service.apply(editor('legacy'), 'legacy-command', [
            editor(),
            editor('manual'),
            editor('legacy'),
        ]);
        delete entries.find(({ binding }) => binding.name === 'legacy-command')
            ?.binding.management;
        const plan = await service.previewChange(
            { enabled: false, mode: 'remove-automatic' },
            [],
        );
        expect(
            plan.items.map(({ name, action, management }) => ({
                name,
                action,
                management,
            })),
        ).toEqual([
            { name: 'automatic', action: 'remove', management: 'automatic' },
        ]);
        expect((await service.applyChangeItems(plan.items, []))[0].status).toBe(
            'removed',
        );
        expect(files.has(destination('automatic'))).toBe(false);
        expect(files.has(destination('manual-command'))).toBe(true);
        expect(files.has(destination('legacy-command'))).toBe(true);
    });

    it('includes legacy unknown commands only in the explicit remove-all choice', async () => {
        await service.apply(editor(), 'legacy-command', [editor()]);
        delete entries[0].binding.management;
        const plan = await service.previewChange(
            { enabled: false, mode: 'remove-all' },
            [editor()],
        );
        expect(plan.items[0]).toMatchObject({
            management: 'unknown',
            action: 'remove',
        });
        expect(
            (await service.applyChangeItems(plan.items, [editor()]))[0].status,
        ).toBe('removed');
        expect(entries).toEqual([]);
        expect(files.has(destination('legacy-command'))).toBe(false);
    });

    it('reports busy commands as skipped without acquiring reservations', async () => {
        const busy = vi.fn(() => 'Editor is busy');
        const plan = await service.previewChange(
            { enabled: true, mode: 'create-missing' },
            [editor()],
            busy,
        );
        expect(plan.items[0]).toMatchObject({
            action: 'skip',
            reason: 'Editor is busy',
        });
        expect(coordinator.write).not.toHaveBeenCalled();
    });

    it('does not offer changed external files for bulk removal', async () => {
        await service.createAutomatically(editor(), 'godot48');
        files.set(destination('godot48'), { ino: 999n, content: 'external' });
        const plan = await service.previewChange(
            { enabled: false, mode: 'remove-all' },
            [editor()],
        );
        expect(plan.items[0].action).toBe('skip');
        expect(plan.items[0].reason).toBeDefined();
        expect(files.get(destination('godot48'))?.content).toBe('external');
    });

    it('makes a successfully renamed automatic command manual and preserves replacement classification', async () => {
        await service.createAutomatically(editor(), 'godot48');
        await service.withReplacement(
            { ...editor(), editor_path: path.resolve('replacement') },
            async () => undefined,
        );
        expect(entries[0].binding.management).toBe('automatic');
        const replaced = {
            ...editor(),
            editor_path: path.resolve('replacement'),
        };
        await service.apply(replaced, 'studio-command', [replaced]);
        expect(entries[0].binding.management).toBe('manual');
    });

    it('creates a complete exclusive wrapper and reserves the name and installation', async () => {
        const result = await service.apply(editor(), 'godot48', [editor()]);
        expect(result.aliases).toEqual([
            {
                name: 'godot48',
                version: editor().version,
                mono: false,
                management: 'manual',
                state: 'active',
            },
        ]);
        expect(files.get(destination('godot48'))?.content).toContain('exec ');
        expect(files.get(destination('godot48'))?.content).toContain('"$@"');
        expect(
            (await service.check(editor('other'), 'godot48')).available,
        ).toBe(false);
        expect((await service.check(editor(), 'another')).available).toBe(true);
        expect(files.has(destination('godot'))).toBe(false);
    });
    it('blocks unmanaged files and symlinks without touching them', async () => {
        const foreign = { ino: 99n, content: 'foreign', symlink: true };
        files.set(destination('godot48'), foreign);
        expect((await service.check(editor(), 'godot48')).available).toBe(
            false,
        );
        await expect(
            service.apply(editor(), 'godot48', [editor()]),
        ).rejects.toThrow();
        expect(files.get(destination('godot48'))).toBe(foreign);
        expect(io.unlink).not.toHaveBeenCalled();
    });
    it('fails closed on lookup failures and external commands', async () => {
        adapter.findConflict.mockRejectedValueOnce(new Error('Shell failed'));
        await expect(service.check(editor(), 'godot48')).rejects.toThrow(
            'Shell failed',
        );
        adapter.findConflict.mockResolvedValue('/external/godot48');
        await expect(
            service.apply(editor(), 'godot48', [editor()]),
        ).rejects.toThrow('external');
        expect(io.link).not.toHaveBeenCalled();
    });
    it('rechecks at commit and never overwrites a file created during publication', async () => {
        const foreign = { ino: 99n, content: 'foreign' };
        io.link.mockImplementationOnce(async (_source, target) => {
            files.set(target, foreign);
            throw Object.assign(new Error('Exists'), { code: 'EEXIST' });
        });
        await expect(
            service.apply(editor(), 'godot48', [editor()]),
        ).rejects.toThrow('Exists');
        expect(files.get(destination('godot48'))).toBe(foreign);
        const state = await service.getState([editor()]);
        expect(state.aliases[0].state).toBe('unresolved');
        expect(entries[0].operation?.kind).toBe('remove');
        expect(io.link).toHaveBeenCalledOnce();
    });
    it('does not retry a returned creation failure as a later creation', async () => {
        adapter.register.mockRejectedValueOnce(new Error('PATH write failed'));
        await expect(
            service.apply(editor(), 'godot48', [editor()]),
        ).rejects.toThrow('PATH write failed');
        expect((await service.getState([editor()])).aliases).toEqual([]);
        expect(files.size).toBe(0);
    });
    it('finishes interrupted owned publication on restart', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        entries[0].operation = { kind: 'create' };
        files.delete(destination('godot48'));
        const restarted = new CommandLineAliasService(
            coordinator as never,
            path.resolve('profile'),
            adapter as never,
            'linux',
        );
        expect((await restarted.getState([editor()])).aliases[0].state).toBe(
            'active',
        );
        expect(files.has(destination('godot48'))).toBe(true);
    });
    it('retains ambiguous witness reservations instead of adopting a matching script', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        entries[0].operation = { kind: 'create' };
        delete entries[0].binding.ino;
        expect((await service.getState([editor()])).aliases[0].state).toBe(
            'unresolved',
        );
        expect(entries).toHaveLength(1);
        expect(io.unlink).not.toHaveBeenCalled();
    });
    it('removes only its own command and witness', async () => {
        const godot = { ino: 99n, content: 'default' };
        files.set(destination('godot'), godot);
        await service.apply(editor(), 'godot48', [editor()]);
        await service.apply(editor(), null, [editor()]);
        expect(entries).toEqual([]);
        expect(files.size).toBe(1);
        expect(files.get(destination('godot'))).toBe(godot);
    });
    it('refuses to remove a replaced foreign destination even if its marker matches', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        const foreign = { ino: 900n, content: entries[0].binding.content };
        files.set(destination('godot48'), foreign);
        await expect(service.apply(editor(), null, [editor()])).rejects.toThrow(
            'recovery',
        );
        expect(files.get(destination('godot48'))).toBe(foreign);
    });
    it('cleans before uninstall and restores on a failed deletion', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        await expect(
            service.withRemoval(editor(), async () => {
                expect(files.has(destination('godot48'))).toBe(false);
                throw new Error('Removal failed');
            }),
        ).rejects.toThrow('Removal failed');
        expect((await service.getState([editor()])).aliases[0].state).toBe(
            'active',
        );
        await service.withRemoval(editor(), async () => undefined);
        expect(entries).toEqual([]);
        expect(files.size).toBe(0);
    });
    it('keeps deletion blocked and a foreign alias untouched when cleanup fails', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        const foreign = { ino: 999n, content: 'foreign' };
        files.set(destination('godot48'), foreign);
        const remove = vi.fn();
        await expect(service.withRemoval(editor(), remove)).rejects.toThrow(
            'recovery',
        );
        expect(remove).not.toHaveBeenCalled();
        expect(files.get(destination('godot48'))).toBe(foreign);
        expect(entries[0].operation?.kind).toBe('uninstall');
        expect((await service.getState([editor()])).aliases[0].state).toBe(
            'unresolved',
        );
    });

    it.each(['foreign', 'unreadable'])(
        'blocks editor deletion when its recovery witness is %s',
        async (state) => {
            await service.apply(editor(), 'godot48', [editor()]);
            const witness = path.join(
                bin,
                `.godot-launcher-alias-${entries[0].binding.id}`,
            );
            const original = files.get(destination('godot48'));
            if (state === 'foreign')
                files.set(witness, { ino: 999n, content: 'foreign witness' });
            else {
                const lstat = io.lstat.getMockImplementation();
                if (!lstat) throw new Error('Missing stat fixture');
                io.lstat.mockImplementation(async (file) => {
                    if (file === witness)
                        throw Object.assign(new Error('Access denied'), {
                            code: 'EACCES',
                        });
                    return lstat(file);
                });
            }
            const remove = vi.fn();
            await expect(
                service.withRemoval(editor(), remove),
            ).rejects.toThrow();
            expect(remove).not.toHaveBeenCalled();
            expect(files.get(destination('godot48'))).toBe(original);
            expect(entries[0].operation).toBeUndefined();
            expect(files.has(witness)).toBe(true);
        },
    );

    it('does not republish an alias after partial deletion removes its executable', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        await expect(
            service.withRemoval(editor(), async () => {
                io.stat.mockRejectedValue(missing());
                throw new Error('Partial deletion');
            }),
        ).rejects.toThrow('recovery');
        expect(files.has(destination('godot48'))).toBe(false);
        expect(entries[0].operation?.kind).toBe('uninstall');
        expect((await service.getState([editor()])).aliases).toEqual([]);
        expect(files.size).toBe(0);
    });

    it('retains uninstall reservations when target verification is uncertain and recovers after access returns', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        await expect(
            service.withRemoval(editor(), async () => {
                io.stat.mockRejectedValue(
                    Object.assign(new Error('Access denied'), {
                        code: 'EACCES',
                    }),
                );
                throw new Error('Deletion failed');
            }),
        ).rejects.toThrow('recovery');
        expect((await service.getState([editor()])).aliases[0].state).toBe(
            'unresolved',
        );
        expect(entries[0].operation?.kind).toBe('uninstall');
        expect(files.has(destination('godot48'))).toBe(false);
        io.stat.mockResolvedValue({ isFile: () => true });
        expect((await service.getState([editor()])).aliases[0].state).toBe(
            'active',
        );
    });

    it('does not restore an interrupted uninstall to an old path after the identity is replaced', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        entries[0].operation = { kind: 'uninstall' };
        files.delete(destination('godot48'));
        const replacement = {
            ...editor(),
            editor_path: path.resolve('new-editor'),
        };
        expect((await service.getState([replacement])).aliases[0].state).toBe(
            'unresolved',
        );
        expect(files.has(destination('godot48'))).toBe(false);
        expect(entries[0].operation?.kind).toBe('uninstall');
    });

    it('retains replacement intent when original-target restoration fails and safely retries later', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        const replacement = {
            ...editor(),
            editor_path: path.resolve('replacement'),
        };
        await expect(
            service.withReplacement(replacement, async () => {
                io.stat.mockRejectedValue(
                    Object.assign(new Error('Access denied'), {
                        code: 'EACCES',
                    }),
                );
                throw new Error('Registration failed');
            }),
        ).rejects.toThrow('recovery');
        expect(entries[0].operation?.kind).toBe('rebind');
        expect((await service.getState([editor()])).aliases[0].state).toBe(
            'unresolved',
        );
        io.stat.mockResolvedValue({ isFile: () => true });
        expect((await service.getState([editor()])).aliases[0].state).toBe(
            'active',
        );
        expect(entries[0].binding.editorPath).toBe(editor().editor_path);
    });

    it('keeps replacement recovery context until obsolete witness cleanup succeeds', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        const previous = structuredClone(entries[0].binding);
        const replacement = {
            ...editor(),
            editor_path: path.resolve('replacement'),
        };
        const unlink = io.unlink.getMockImplementation();
        if (!unlink) throw new Error('Missing unlink fixture');
        const oldWitness = path.join(
            bin,
            `.godot-launcher-alias-${previous.id}`,
        );
        io.unlink.mockImplementation(async (file) => {
            if (file === oldWitness) throw new Error('Witness locked');
            return unlink(file);
        });
        await expect(
            service.withReplacement(replacement, async () => undefined),
        ).rejects.toThrow('Witness locked');
        expect((await service.getState([replacement])).aliases[0].state).toBe(
            'unresolved',
        );
        expect(entries[0].operation?.kind).toBe('rebind');
        io.unlink.mockImplementation(unlink);
        expect((await service.getState([replacement])).aliases[0].state).toBe(
            'active',
        );
        expect(files.has(oldWitness)).toBe(false);
        expect(files.size).toBe(2);
    });

    it('recovers a committed replacement after the final registry write fails', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        const replacement = {
            ...editor(),
            editor_path: path.resolve('replacement'),
        };
        const write = coordinator.write.getMockImplementation();
        if (!write) throw new Error('Missing coordinator fixture');
        let committed = false;
        coordinator.write.mockImplementation(async (definition, value) => {
            if (committed && value[0] && !value[0].operation) {
                committed = false;
                throw new Error('Final registry write failed');
            }
            return write(definition, value);
        });
        await expect(
            service.withReplacement(replacement, async () => {
                committed = true;
            }),
        ).rejects.toThrow('Final registry write failed');
        expect(entries[0].operation?.kind).toBe('rebind');
        expect((await service.getState([replacement])).aliases[0].state).toBe(
            'active',
        );
        expect(entries[0].binding.editorPath).toBe(replacement.editor_path);
        expect(files.get(destination('godot48'))?.content).toContain(
            'replacement',
        );
    });

    it('recovers a changed Windows console target even when the editor path is unchanged', async () => {
        const windows = new CommandLineAliasService(
            coordinator as never,
            path.resolve('profile'),
            adapter as never,
            'win32',
        );
        const original = {
            ...editor(),
            source: 'custom' as const,
            console_path: path.resolve('original-console.exe'),
        };
        await windows.apply(original, 'godot48', [original]);
        const replacement = {
            ...original,
            console_path: path.resolve('replacement-console.exe'),
        };
        const write = coordinator.write.getMockImplementation();
        if (!write) throw new Error('Missing coordinator fixture');
        let committed = false;
        coordinator.write.mockImplementation(async (definition, value) => {
            if (committed && value[0] && !value[0].operation) {
                committed = false;
                throw new Error('Final registry write failed');
            }
            return write(definition, value);
        });
        await expect(
            windows.withReplacement(replacement, async () => {
                committed = true;
            }),
        ).rejects.toThrow();
        expect((await windows.getState([replacement])).aliases[0].state).toBe(
            'active',
        );
        expect(entries[0].binding.executable).toBe(replacement.console_path);
    });

    it('preserves the name across explicit replacement and rolls back failed registration', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        const replacement = {
            ...editor(),
            editor_path: path.resolve('new-editor'),
        };
        await expect(
            service.withReplacement(replacement, async () => {
                throw new Error('Registration failed');
            }),
        ).rejects.toThrow('Registration failed');
        expect(entries[0].binding.editorPath).toBe(editor().editor_path);
        await service.withReplacement(replacement, async () => undefined);
        expect(entries[0].binding.name).toBe('godot48');
        expect(entries[0].binding.editorPath).toBe(replacement.editor_path);
        expect(files.size).toBe(2);
    });
    it('publishes the new command before retiring old and keeps other registrations independent', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        await service.apply(editor('other'), 'godot-other', [
            editor(),
            editor('other'),
        ]);
        const original = files.get(destination('godot48'));
        const link = io.link.getMockImplementation();
        if (!link) throw new Error('Missing link fixture');
        io.link.mockImplementation(async (source, target) => {
            if (target === destination('godot-studio'))
                expect(files.get(destination('godot48'))).toBe(original);
            return link(source, target);
        });
        const unlink = io.unlink.getMockImplementation();
        if (!unlink) throw new Error('Missing unlink fixture');
        io.unlink.mockImplementation(async (file) => {
            if (file === destination('godot48')) {
                expect(files.has(destination('godot-studio'))).toBe(true);
                expect(
                    entries.find(
                        (entry) => entry.binding.name === 'godot-studio',
                    )?.operation?.phase,
                ).toBe('commit');
            }
            return unlink(file);
        });
        const state = await service.apply(editor(), 'godot-studio', [
            editor(),
            editor('other'),
        ]);
        expect(
            state.aliases.find((alias) => alias.version === editor().version),
        ).toMatchObject({ name: 'godot-studio', state: 'active' });
        expect(files.has(destination('godot48'))).toBe(false);
        expect(files.has(destination('godot-other'))).toBe(true);
        expect(files.has(destination('godot'))).toBe(false);
        expect(entries).toHaveLength(2);
    });

    it('keeps the old alias and never resumes a returned precommit failure as a rename', async () => {
        await service.createAutomatically(editor(), 'godot48');
        const old = files.get(destination('godot48'));
        adapter.register.mockRejectedValueOnce(new Error('PATH failed'));
        await expect(
            service.apply(editor(), 'godot-studio', [editor()]),
        ).rejects.toThrow('PATH failed');
        expect((await service.getState([editor()])).aliases).toEqual([
            {
                name: 'godot48',
                version: editor().version,
                mono: false,
                management: 'automatic',
                state: 'active',
            },
        ]);
        expect(files.get(destination('godot48'))).toBe(old);
        expect(files.has(destination('godot-studio'))).toBe(false);
        expect(files.size).toBe(2);
    });

    it('reserves both names and refuses removal or lifecycle overwrite of unresolved prepare work', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        const foreign = { ino: 900n, content: 'foreign' };
        io.link.mockImplementationOnce(async (_source, target) => {
            files.set(target, foreign);
            throw new Error('Collision');
        });
        await expect(
            service.apply(editor(), 'godot-studio', [editor()]),
        ).rejects.toThrow('renameRecovery');
        expect(entries[0].operation).toMatchObject({
            kind: 'rename',
            phase: 'prepare',
            previous: { name: 'godot48' },
        });
        expect(
            (await service.check(editor('other'), 'godot48')).available,
        ).toBe(false);
        expect(
            (await service.check(editor('other'), 'godot-studio')).available,
        ).toBe(false);
        await expect(service.apply(editor(), null, [editor()])).rejects.toThrow(
            'renameRecovery',
        );
        const remove = vi.fn();
        const replace = vi.fn();
        await expect(service.withRemoval(editor(), remove)).rejects.toThrow(
            'recovery',
        );
        await expect(
            service.withReplacement(editor(), replace),
        ).rejects.toThrow('recovery');
        expect(remove).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
        expect(files.get(destination('godot-studio'))).toBe(foreign);
        expect(files.has(destination('godot48'))).toBe(true);
    });

    it('retains committed context after old-file replacement and completes forward after manual resolution', async () => {
        await service.createAutomatically(editor(), 'godot48');
        const foreign = { ino: 900n, content: 'foreign old command' };
        const write = coordinator.write.getMockImplementation();
        if (!write) throw new Error('Missing store fixture');
        coordinator.write.mockImplementation(async (definition, value) => {
            const result = await write(definition, value);
            if (value[0]?.operation?.phase === 'commit')
                files.set(destination('godot48'), foreign);
            return result;
        });
        const result = await service.apply(editor(), 'godot-studio', [
            editor(),
        ]);
        expect(result.aliases[0]).toMatchObject({
            name: 'godot-studio',
            management: 'manual',
            state: 'unresolved',
        });
        expect((await service.getState([editor()])).aliases[0]).toMatchObject({
            name: 'godot-studio',
            state: 'unresolved',
        });
        const problem = (await service.getState([editor()])).aliases[0].problem;
        expect(problem).toContain('godot48');
        expect(problem).toContain('godot-studio');
        expect(entries[0].operation?.phase).toBe('commit');
        expect(files.get(destination('godot48'))).toBe(foreign);
        expect(
            (await service.check(editor('other'), 'godot48')).available,
        ).toBe(false);
        files.delete(destination('godot48'));
        expect((await service.getState([editor()])).aliases[0]).toMatchObject({
            name: 'godot-studio',
            management: 'manual',
            state: 'active',
        });
        expect(entries[0].operation).toBeUndefined();
    });

    it('finishes a committed rename after final persistence fails without restoring the retired name', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        const write = coordinator.write.getMockImplementation();
        if (!write) throw new Error('Missing store fixture');
        let fail = true;
        coordinator.write.mockImplementation(async (definition, value) => {
            if (
                fail &&
                value[0]?.binding.name === 'godot-studio' &&
                !value[0].operation
            ) {
                fail = false;
                throw new Error('Final write failed');
            }
            return write(definition, value);
        });
        const result = await service.apply(editor(), 'godot-studio', [
            editor(),
        ]);
        expect(result.aliases[0]).toMatchObject({
            name: 'godot-studio',
            state: 'active',
        });
        expect(entries[0].operation).toBeUndefined();
        expect(files.has(destination('godot48'))).toBe(false);
        expect((await service.getState([editor()])).aliases[0]).toMatchObject({
            name: 'godot-studio',
            state: 'active',
        });
        expect(files.has(destination('godot48'))).toBe(false);
    });

    it('reports a committed rename explicitly when its registry can no longer be read', async () => {
        await service.createAutomatically(editor(), 'godot48');
        const write = coordinator.write.getMockImplementation();
        if (!write) throw new Error('Missing store fixture');
        coordinator.write.mockImplementation(async (definition, value) => {
            const result = await write(definition, value);
            if (value[0]?.operation?.phase === 'commit')
                coordinator.read.mockRejectedValue(
                    new Error('Registry unavailable'),
                );
            return result;
        });
        await expect(
            service.apply(editor(), 'godot-studio', [editor()]),
        ).rejects.toThrow(
            'Command godot-studio was renamed, but its recovery state could not be read.',
        );
        expect(entries[0].binding.management).toBe('manual');
        expect(entries[0].operation?.phase).toBe('commit');
        expect(files.has(destination('godot-studio'))).toBe(true);
    });

    it('reconciles every persisted or filesystem interruption boundary without adopting an ambiguous witness', async () => {
        await service.apply(editor(), 'godot48', [editor()]);
        const snapshots: { entries: AliasEntry[]; files: typeof files }[] = [];
        let recording = true;
        const capture = () => {
            if (recording && entries[0]?.operation?.kind === 'rename')
                snapshots.push({
                    entries: structuredClone(entries),
                    files: structuredClone(files),
                });
        };
        const write = coordinator.write.getMockImplementation();
        const link = io.link.getMockImplementation();
        const unlink = io.unlink.getMockImplementation();
        const open = io.open.getMockImplementation();
        if (!write || !link || !unlink || !open)
            throw new Error('Missing boundary fixture');
        coordinator.write.mockImplementation(async (...args) => {
            const result = await write(...args);
            capture();
            return result;
        });
        io.link.mockImplementation(async (...args) => {
            const result = await link(...args);
            capture();
            return result;
        });
        io.unlink.mockImplementation(async (...args) => {
            const result = await unlink(...args);
            capture();
            return result;
        });
        io.open.mockImplementation(async (...args) => {
            const handle = await open(...args);
            if (args[1] === 'wx') {
                const writeFile = handle.writeFile.getMockImplementation();
                handle.writeFile.mockImplementation(
                    async (...values: unknown[]) => {
                        await writeFile?.(...values);
                        capture();
                    },
                );
            }
            return handle;
        });
        await service.apply(editor(), 'godot-studio', [editor()]);
        recording = false;
        expect(snapshots.length).toBeGreaterThanOrEqual(7);
        for (const snapshot of snapshots) {
            entries = structuredClone(snapshot.entries);
            files = structuredClone(snapshot.files);
            const intent = entries[0];
            const ambiguous =
                intent.operation?.phase === 'prepare' &&
                !intent.binding.ino &&
                [...files.keys()].some((file) =>
                    file.endsWith(intent.binding.id),
                );
            const restarted = new CommandLineAliasService(
                coordinator as never,
                path.resolve('profile'),
                adapter as never,
                'linux',
            );
            const result = await restarted.getState([editor()]);
            if (ambiguous) {
                expect(result.aliases[0]).toMatchObject({
                    name: 'godot48',
                    state: 'unresolved',
                });
                expect(files.has(destination('godot48'))).toBe(true);
            } else {
                const name =
                    intent.operation?.phase === 'commit'
                        ? 'godot-studio'
                        : 'godot48';
                expect(result.aliases[0]).toMatchObject({
                    name,
                    management: 'manual',
                    state: 'active',
                });
                expect(files.has(destination(name))).toBe(true);
                expect(
                    files.has(
                        destination(
                            name === 'godot48' ? 'godot-studio' : 'godot48',
                        ),
                    ),
                ).toBe(false);
                expect(files.size).toBe(2);
            }
        }
    });
});
