import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitService } from './git.service.js';
import { GitIdentitySettingsService } from './git-identity-settings.service.js';
import type { GitToolConfigurationService } from './git-tool-configuration.service.js';

const globalIdentity = {
    name: 'Current User',
    email: 'current@example.com',
};
const projectPreset = {
    name: 'Project User',
    email: 'project@example.com',
    useForNewRepositories: false,
};

const getGlobalIdentity = vi.fn();
const setIdentity = vi.fn();
const getProjectIdentityPreset = vi.fn();
const saveProjectIdentityPreset = vi.fn();

const gitService = {
    getGlobalIdentity,
    setIdentity,
} as unknown as GitService;

const configurationService = {
    getProjectIdentityPreset,
    saveProjectIdentityPreset,
} as unknown as GitToolConfigurationService;

describe('GitIdentitySettingsService', () => {
    let service: GitIdentitySettingsService;

    beforeEach(() => {
        vi.clearAllMocks();
        getGlobalIdentity.mockResolvedValue(globalIdentity);
        setIdentity.mockResolvedValue(true);
        getProjectIdentityPreset.mockResolvedValue(projectPreset);
        saveProjectIdentityPreset.mockImplementation(async (preset) => preset);
        service = new GitIdentitySettingsService(
            gitService,
            configurationService,
        );
    });

    it('reads global Git identity and the Launcher preset together', async () => {
        await expect(service.getIdentitySettings()).resolves.toEqual({
            globalIdentity,
            projectPreset,
        });
        expect(getGlobalIdentity).toHaveBeenCalledOnce();
        expect(getProjectIdentityPreset).toHaveBeenCalledOnce();
    });

    it('preserves the focused global identity read', async () => {
        await expect(service.getGlobalIdentity()).resolves.toEqual(
            globalIdentity,
        );
        expect(getGlobalIdentity).toHaveBeenCalledOnce();
    });

    it('trims global identity writes and returns a fresh Git read', async () => {
        const refreshedIdentity = {
            name: 'Saved User',
            email: 'saved@example.com',
        };
        getGlobalIdentity.mockResolvedValueOnce(refreshedIdentity);

        await expect(
            service.saveGlobalIdentity({
                name: '  Saved User  ',
                email: '  saved@example.com  ',
            }),
        ).resolves.toEqual({
            success: true,
            identity: refreshedIdentity,
        });
        expect(setIdentity).toHaveBeenCalledWith(
            'Saved User',
            'saved@example.com',
            'global',
        );
        expect(getGlobalIdentity).toHaveBeenCalledAfter(setIdentity);
    });

    it('returns fresh partial state after a failed global write', async () => {
        setIdentity.mockResolvedValueOnce(false);
        getGlobalIdentity.mockResolvedValueOnce({
            name: 'Saved User',
            email: '',
        });

        await expect(
            service.saveGlobalIdentity({
                name: 'Saved User',
                email: 'saved@example.com',
            }),
        ).resolves.toEqual({
            success: false,
            identity: { name: 'Saved User', email: '' },
        });
    });

    it('rejects incomplete global identity before calling Git', async () => {
        await expect(
            service.saveGlobalIdentity({
                name: ' ',
                email: 'secret@example.com',
            }),
        ).resolves.toEqual({
            success: false,
            identity: globalIdentity,
        });
        expect(setIdentity).not.toHaveBeenCalled();
        expect(
            JSON.stringify(
                await service.saveGlobalIdentity({
                    name: '',
                    email: 'secret@example.com',
                }),
            ),
        ).not.toContain('secret@example.com');
    });

    it('returns fresh Git state when a global write throws', async () => {
        setIdentity.mockRejectedValueOnce(new Error('unexpected'));

        await expect(
            service.saveGlobalIdentity({
                name: 'Saved User',
                email: 'saved@example.com',
            }),
        ).resolves.toEqual({
            success: false,
            identity: globalIdentity,
        });
    });

    it('normalizes and saves the project preset', async () => {
        const normalized = {
            name: 'Project User',
            email: 'project@example.com',
            useForNewRepositories: true,
        };
        saveProjectIdentityPreset.mockResolvedValueOnce(normalized);

        await expect(
            service.saveProjectIdentityPreset({
                name: '  Project User  ',
                email: '  project@example.com  ',
                useForNewRepositories: true,
            }),
        ).resolves.toEqual({ success: true, preset: normalized });
        expect(saveProjectIdentityPreset).toHaveBeenCalledWith(normalized);
    });

    it('clears the project preset explicitly', async () => {
        saveProjectIdentityPreset.mockResolvedValueOnce(null);

        await expect(service.saveProjectIdentityPreset(null)).resolves.toEqual({
            success: true,
            preset: null,
        });
        expect(saveProjectIdentityPreset).toHaveBeenCalledWith(null);
    });

    it('rejects incomplete presets without replacing stored state', async () => {
        await expect(
            service.saveProjectIdentityPreset({
                name: 'Project User',
                email: ' ',
                useForNewRepositories: true,
            }),
        ).resolves.toEqual({ success: false, preset: projectPreset });
        expect(saveProjectIdentityPreset).not.toHaveBeenCalled();
    });

    it('does not treat malformed falsey preset input as a clear request', async () => {
        await expect(
            service.saveProjectIdentityPreset(
                false as unknown as Parameters<
                    GitIdentitySettingsService['saveProjectIdentityPreset']
                >[0],
            ),
        ).resolves.toEqual({ success: false, preset: projectPreset });
        expect(saveProjectIdentityPreset).not.toHaveBeenCalled();
    });

    it('returns stored state when a preset write fails', async () => {
        saveProjectIdentityPreset.mockRejectedValueOnce(
            new Error('unexpected'),
        );

        await expect(
            service.saveProjectIdentityPreset(projectPreset),
        ).resolves.toEqual({ success: false, preset: projectPreset });
    });
});
