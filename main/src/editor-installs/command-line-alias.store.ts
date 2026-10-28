import * as path from 'node:path';
import { z } from 'zod';
import { JsonFileStore } from '../json-store/json-file.store.js';
import type { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { getAliasNameError } from './command-line-alias.util.js';

const bindingSchema = z
    .object({
        id: z.uuid(),
        name: z.string().refine((name) => getAliasNameError(name) === null),
        version: z.string(),
        mono: z.boolean(),
        editorPath: z.string(),
        executable: z.string(),
        content: z.string(),
        dev: z.string().optional(),
        ino: z.string().optional(),
    })
    .strict();
const entrySchema = z
    .object({
        binding: bindingSchema,
        operation: z
            .object({
                kind: z.enum([
                    'create',
                    'remove',
                    'uninstall',
                    'rebind',
                    'rename',
                ]),
                previous: bindingSchema.optional(),
                phase: z.enum(['prepare', 'commit']).optional(),
            })
            .strict()
            .optional(),
    })
    .strict()
    .superRefine(({ binding, operation }, context) => {
        if (operation?.kind === 'rename') {
            const previous = operation.previous;
            if (
                !previous ||
                !operation.phase ||
                !previous.dev ||
                !previous.ino ||
                previous.id === binding.id ||
                previous.name === binding.name ||
                previous.version !== binding.version ||
                previous.mono !== binding.mono ||
                previous.editorPath !== binding.editorPath ||
                previous.executable !== binding.executable ||
                (operation.phase === 'commit' && (!binding.dev || !binding.ino))
            ) {
                context.addIssue({
                    code: 'custom',
                    message: 'Invalid alias rename intent.',
                });
            }
        } else if (operation?.phase !== undefined) {
            context.addIssue({
                code: 'custom',
                message: 'Unexpected rename phase.',
            });
        }
    });
const schema = z.array(entrySchema).superRefine((entries, context) => {
    const names = new Set<string>();
    const editors = new Set<string>();
    for (const { binding, operation } of entries) {
        const editor = JSON.stringify([binding.version, binding.mono]);
        const reserved = new Set([
            binding.name,
            ...(operation?.kind === 'rename' && operation.previous
                ? [operation.previous.name]
                : []),
        ]);
        if (
            [...reserved].some((name) => names.has(name)) ||
            editors.has(editor)
        )
            context.addIssue({
                code: 'custom',
                message: 'Duplicate command registration.',
            });
        for (const name of reserved) names.add(name);
        editors.add(editor);
    }
});
export type AliasBinding = z.infer<typeof bindingSchema>;
export type AliasEntry = z.infer<typeof entrySchema>;

/** Persists registrations and unfinished operations without changing the default store. */
export class CommandLineAliasStore extends JsonFileStore<AliasEntry[]> {
    /**
     * Registers the versioned alias registry with strict fail-closed parsing.
     * @param coordinator - Atomic JSON coordinator.
     * @param directory - Trusted application configuration directory.
     */
    constructor(coordinator: JsonStoreCoordinatorService, directory: string) {
        super(coordinator, {
            pathProvider: () =>
                path.join(directory, 'command-line-aliases.json'),
            defaultValue: () => [],
            parse: (raw) => schema.parse(JSON.parse(raw)),
            normalize: (value) => schema.parse(value),
        });
    }
    /** Reads pending and active registrations. */
    async read(): Promise<AliasEntry[]> {
        return (await this.readValue()).value;
    }
    /**
     * Persists one registry transition atomically.
     * @param entries - Validated next registrations.
     */
    async save(entries: AliasEntry[]): Promise<void> {
        await this.replaceValue(entries);
    }
}
