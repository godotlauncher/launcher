import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

import { GitController } from './git.controller.js';
import type { GitService } from './git.service.js';

describe('GitController', () => {
    it('delegates global identity reads to the Git service', async () => {
        const identity = {
            name: 'Mario',
            email: 'mario@example.com',
        };
        const service = {
            getGlobalIdentity: vi.fn(async () => identity),
        } as unknown as GitService;
        const controller = new GitController(service);

        await expect(controller.getGlobalIdentity()).resolves.toEqual(identity);
        expect(service.getGlobalIdentity).toHaveBeenCalledOnce();
    });
});
