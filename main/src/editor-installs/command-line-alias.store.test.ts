import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CommandLineAliasStore } from './command-line-alias.store.js';

const binding = {
    id: 'c6415d5f-9214-4bc2-b6c2-3855f7f6bbc5',
    name: 'godot48',
    version: '4.8-stable',
    mono: false,
    editorPath: path.resolve('editor'),
    executable: path.resolve('editor'),
    content: 'wrapper',
    dev: '1',
    ino: '2',
};
/**
 * Exercises the store-owned parser through its coordinator boundary.
 * @param value - Raw persisted JSON value.
 */
async function read(value: unknown) {
    const coordinator = {
        read: vi.fn(async (definition) => ({
            value: definition.parse(JSON.stringify(value)),
            version: '1',
        })),
    };
    return new CommandLineAliasStore(
        coordinator as never,
        path.resolve('profile'),
    ).read();
}

describe('alias registry parsing', () => {
    it('reads active and pending registrations without requiring a default', async () => {
        expect(
            await read([{ binding, operation: { kind: 'create' } }]),
        ).toHaveLength(1);
        expect(await read([])).toEqual([]);
    });
    it('rejects duplicate aliases, duplicate installation identities and reserved names', async () => {
        await expect(
            read([{ binding }, { binding: { ...binding, version: 'other' } }]),
        ).rejects.toThrow();
        await expect(
            read([{ binding }, { binding: { ...binding, name: 'other' } }]),
        ).rejects.toThrow();
        await expect(
            read([{ binding: { ...binding, name: 'godot' } }]),
        ).rejects.toThrow();
    });
    it('refuses malformed or unknown recovery records rather than returning no aliases', async () => {
        await expect(
            read([{ binding, operation: { kind: 'force' } }]),
        ).rejects.toThrow();
        await expect(read({ aliases: [] })).rejects.toThrow();
        await expect(
            read([{ binding: { ...binding, id: '../escape' } }]),
        ).rejects.toThrow();
    });
    it('requires a complete coherent rename decision and reserves the previous name', async () => {
        const replacement = {
            ...binding,
            id: 'ad971b70-dc26-4d36-87b0-f7fe8a34fef1',
            name: 'godot-studio',
            ino: '3',
        };
        const entry = {
            binding: replacement,
            operation: { kind: 'rename', phase: 'commit', previous: binding },
        };
        expect(await read([entry])).toHaveLength(1);
        for (const operation of [
            { ...entry.operation, phase: undefined },
            { ...entry.operation, phase: 'unknown' },
            { ...entry.operation, previous: undefined },
            { ...entry.operation, previous: replacement },
            { ...entry.operation, previous: { ...binding, mono: true } },
            {
                ...entry.operation,
                previous: { ...binding, executable: 'other' },
            },
        ])
            await expect(read([{ ...entry, operation }])).rejects.toThrow();
        await expect(
            read([{ ...entry, binding: { ...replacement, ino: undefined } }]),
        ).rejects.toThrow();
        await expect(
            read([entry, { binding: { ...binding, version: 'other' } }]),
        ).rejects.toThrow();
        await expect(
            read([
                { binding, operation: { kind: 'create', phase: 'prepare' } },
            ]),
        ).rejects.toThrow();
    });
});
