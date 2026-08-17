import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

import { GitController } from './git.controller.js';
import type { GitIdentitySettingsService } from './git-identity-settings.service.js';

describe('GitController', () => {
    it('delegates identity settings operations to the focused service', async () => {
        const identity = {
            name: 'Mario',
            email: 'mario@example.com',
        };
        const preset = {
            ...identity,
            useForNewRepositories: false,
        };
        const service = {
            getGlobalIdentity: vi.fn(async () => identity),
            getIdentitySettings: vi.fn(async () => ({
                globalIdentity: identity,
                projectPreset: preset,
            })),
            saveGlobalIdentity: vi.fn(async () => ({
                success: true,
                identity,
            })),
            saveProjectIdentityPreset: vi.fn(async () => ({
                success: true,
                preset,
            })),
        } as unknown as GitIdentitySettingsService;
        const controller = new GitController(service);

        await expect(controller.getGlobalIdentity()).resolves.toEqual(identity);
        await expect(controller.getIdentitySettings()).resolves.toEqual({
            globalIdentity: identity,
            projectPreset: preset,
        });
        await expect(controller.saveGlobalIdentity(identity)).resolves.toEqual({
            success: true,
            identity,
        });
        await expect(
            controller.saveProjectIdentityPreset(preset),
        ).resolves.toEqual({ success: true, preset });
        expect(service.getGlobalIdentity).toHaveBeenCalledOnce();
        expect(service.getIdentitySettings).toHaveBeenCalledOnce();
        expect(service.saveGlobalIdentity).toHaveBeenCalledWith(identity);
        expect(service.saveProjectIdentityPreset).toHaveBeenCalledWith(preset);
    });
});
