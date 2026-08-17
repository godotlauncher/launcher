import { describe, expect, it, vi } from 'vitest';
import { GitLfsController } from './git-lfs.controller.js';
import type { GitLfsService } from './git-lfs.service.js';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

describe('GitLfsController', () => {
    it('returns the tracking descriptor owned by the service', async () => {
        const descriptor = {
            id: 'godot-documentation-defaults' as const,
            groups: [{ id: 'audio' as const, patterns: ['*.ogg'] }],
        };
        const service = {
            getTrackingPolicy: vi.fn(() => descriptor),
        } as unknown as GitLfsService;

        const controller = new GitLfsController(service);

        await expect(controller.getTrackingPolicy()).resolves.toEqual(
            descriptor,
        );
        expect(service.getTrackingPolicy).toHaveBeenCalledOnce();
    });
});
