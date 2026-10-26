import { describe, expect, it, vi } from 'vitest';
import type { AtomicJsonFileAdapter } from './atomic-json-file.adapter.js';
import {
    JsonStoreConflictError,
    type JsonStoreDefinition,
} from './json-store.types.js';
import { JsonStoreCoordinatorService } from './json-store-coordinator.service.js';

interface TestState {
    values: string[];
}

const storePath = '/virtual/catalog.json';

function createDefinition(): JsonStoreDefinition<TestState> {
    return {
        pathProvider: () => storePath,
        defaultValue: () => ({ values: [] }),
        normalize: (value) => ({
            values: [...new Set(value.values)].sort(),
        }),
    };
}

function createFileAdapter(initial?: string): AtomicJsonFileAdapter & {
    contents: string | undefined;
} {
    const adapter = {
        contents: initial,
        read: vi.fn(async () => adapter.contents),
        write: vi.fn(async (_path: string, contents: string) => {
            adapter.contents = contents;
        }),
    };

    return adapter as unknown as AtomicJsonFileAdapter & {
        contents: string | undefined;
    };
}

describe('JsonStoreCoordinatorService', () => {
    it('loads defaults without creating a file and returns defensive copies', async () => {
        const adapter = createFileAdapter();
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const definition = createDefinition();

        const first = await coordinator.read(definition);
        first.value.values.push('changed-outside-store');
        const second = await coordinator.read(definition);

        expect(second.value).toEqual({ values: [] });
        expect(adapter.write).not.toHaveBeenCalled();
    });

    it('persists a default value when it is explicitly written', async () => {
        const adapter = createFileAdapter();
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const definition = createDefinition();
        const current = await coordinator.read(definition);

        await coordinator.write(definition, current.value);

        expect(adapter.write).toHaveBeenCalledOnce();
        expect(JSON.parse(adapter.contents ?? '')).toEqual({ values: [] });
    });

    it.each(['', '  \n\t'])(
        'loads defaults from an empty file and repairs it on the next write',
        async (contents) => {
            const adapter = createFileAdapter(contents);
            const coordinator = new JsonStoreCoordinatorService(adapter);
            const definition = createDefinition();

            const current = await coordinator.read(definition);

            expect(current.value).toEqual({ values: [] });
            expect(adapter.write).not.toHaveBeenCalled();

            await coordinator.write(definition, current.value);

            expect(adapter.write).toHaveBeenCalledOnce();
            expect(JSON.parse(adapter.contents ?? '')).toEqual({ values: [] });
        },
    );

    it('serializes concurrent updates for the same path', async () => {
        const adapter = createFileAdapter();
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const definition = createDefinition();

        await Promise.all([
            coordinator.update(definition, async (current) => {
                await Promise.resolve();
                current.values.push('first');
                return current;
            }),
            coordinator.update(definition, (current) => {
                current.values.push('second');
                return current;
            }),
        ]);

        await expect(coordinator.read(definition)).resolves.toMatchObject({
            value: { values: ['first', 'second'] },
        });
        expect(adapter.write).toHaveBeenCalledTimes(2);
    });

    it('rejects stale writes without touching the file', async () => {
        const adapter = createFileAdapter('{"values":[]}');
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const definition = createDefinition();

        await coordinator.read(definition);

        await expect(
            coordinator.write(
                definition,
                { values: ['new'] },
                { expectedVersion: 'stale-version' },
            ),
        ).rejects.toBeInstanceOf(JsonStoreConflictError);
        expect(adapter.write).not.toHaveBeenCalled();
    });

    it('surfaces invalid JSON instead of silently replacing it', async () => {
        const adapter = createFileAdapter('{not-json');
        const coordinator = new JsonStoreCoordinatorService(adapter);

        await expect(coordinator.read(createDefinition())).rejects.toThrow();
        expect(adapter.write).not.toHaveBeenCalled();
    });

    it('recovers invalid JSON only when the store opts in and repairs it on write', async () => {
        const adapter = createFileAdapter('{invalid');
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const onLoadError = vi.fn(() => ({ values: [] }));
        const definition = { ...createDefinition(), onLoadError };

        const current = await coordinator.read(definition);

        expect(onLoadError).toHaveBeenCalledWith(expect.any(Error), '{invalid');
        expect(current.value).toEqual({ values: [] });
        expect(adapter.write).not.toHaveBeenCalled();
        await coordinator.write(definition, current.value);
        expect(adapter.write).toHaveBeenCalledOnce();
        expect(JSON.parse(adapter.contents ?? '')).toEqual({ values: [] });
    });

    it('allows an opted-in store to recover a read failure', async () => {
        const adapter = createFileAdapter();
        const error = new Error('permission denied');
        vi.spyOn(adapter, 'read').mockRejectedValueOnce(error);
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const onLoadError = vi.fn(() => ({ values: ['recovered'] }));

        expect(
            (await coordinator.read({ ...createDefinition(), onLoadError }))
                .value,
        ).toEqual({ values: ['recovered'] });
        expect(onLoadError).toHaveBeenCalledWith(error, undefined);
        expect(adapter.write).not.toHaveBeenCalled();
    });

    it('does not treat a normalisation failure as a recoverable load error', async () => {
        const adapter = createFileAdapter('{"values":[]}');
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const onLoadError = vi.fn();
        const definition = {
            ...createDefinition(),
            onLoadError,
            normalize: () => {
                throw new Error('invalid state');
            },
        };

        await expect(coordinator.read(definition)).rejects.toThrow(
            'invalid state',
        );
        expect(onLoadError).not.toHaveBeenCalled();
    });

    it('writes unchanged values only once and persists normalised content', async () => {
        const adapter = createFileAdapter('{"values":["b","a","a"]}');
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const definition = createDefinition();
        const current = await coordinator.read(definition);

        await coordinator.write(definition, current.value);
        await coordinator.write(definition, current.value);

        expect(adapter.write).toHaveBeenCalledOnce();
        expect(JSON.parse(adapter.contents ?? '')).toEqual({
            values: ['a', 'b'],
        });
    });

    it('rejects an update based on a stale version', async () => {
        const adapter = createFileAdapter();
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const definition = createDefinition();
        const previous = await coordinator.write(definition, {
            values: ['old'],
        });
        await coordinator.write(definition, { values: ['saved'] });

        await expect(
            coordinator.update(definition, () => ({ values: ['stale'] }), {
                expectedVersion: previous.version,
            }),
        ).rejects.toBeInstanceOf(JsonStoreConflictError);
        expect((await coordinator.read(definition)).value).toEqual({
            values: ['saved'],
        });
    });

    it('keeps the last persisted value cached when a write fails', async () => {
        const adapter = createFileAdapter('{"values":["persisted"]}');
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const definition = createDefinition();
        await coordinator.read(definition);
        vi.spyOn(adapter, 'write').mockRejectedValueOnce(
            new Error('disk unavailable'),
        );

        await expect(
            coordinator.write(definition, { values: ['not-persisted'] }),
        ).rejects.toThrow('disk unavailable');

        await expect(coordinator.read(definition)).resolves.toMatchObject({
            value: { values: ['persisted'] },
        });
    });

    it('refreshes the cache from disk', async () => {
        const adapter = createFileAdapter('{"values":["first"]}');
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const definition = createDefinition();

        await coordinator.read(definition);
        adapter.contents = '{"values":["second"]}';

        await expect(coordinator.refresh(definition)).resolves.toMatchObject({
            value: { values: ['second'] },
        });
    });
});
