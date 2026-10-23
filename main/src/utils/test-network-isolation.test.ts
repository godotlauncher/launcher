import { describe, expect, it, vi } from 'vitest';

describe('unit test network isolation', () => {
    it('rejects unmocked GitHub requests', async () => {
        await expect(fetch('https://api.github.com/user')).rejects.toThrow(
            'Unexpected network request: mock fetch in this unit test.',
        );
    });

    it('restores the rejecting default after a scenario mock', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Response.json({ login: 'fixture' })),
        );
        expect(
            await (await fetch('https://api.github.com/user')).json(),
        ).toEqual({ login: 'fixture' });
        vi.unstubAllGlobals();
        await expect(fetch('https://api.github.com/user')).rejects.toThrow(
            'Unexpected network request: mock fetch in this unit test.',
        );
    });
});
