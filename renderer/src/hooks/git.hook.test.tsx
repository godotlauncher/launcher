import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGit } from './git.hook.ts';

describe('useGit', () => {
    const identity = {
        name: 'Mario',
        email: 'mario@example.com',
    };
    const getGlobalIdentity = vi.fn(async () => identity);
    const preset = { ...identity, useForNewRepositories: false };
    const getIdentitySettings = vi.fn(async () => ({
        globalIdentity: identity,
        projectPreset: preset,
    }));
    const saveGlobalIdentity = vi.fn(async () => ({
        success: true,
        identity,
    }));
    const saveProjectIdentityPreset = vi.fn(async () => ({
        success: true,
        preset,
    }));

    beforeEach(() => {
        vi.clearAllMocks();
        (
            globalThis as unknown as {
                window: Window;
            }
        ).window = {
            electron: {
                'git.getGlobalIdentity': getGlobalIdentity,
                'git.getIdentitySettings': getIdentitySettings,
                'git.saveGlobalIdentity': saveGlobalIdentity,
                'git.saveProjectIdentityPreset': saveProjectIdentityPreset,
            },
        } as unknown as Window;
    });

    function renderHook(): ReturnType<typeof useGit> {
        let captured: ReturnType<typeof useGit> | undefined;

        const Capture = () => {
            captured = useGit();
            return null;
        };

        renderToStaticMarkup(<Capture />);

        if (!captured) {
            throw new Error('Hook was not rendered');
        }
        return captured;
    }

    it('delegates global identity reads to the Git bridge', async () => {
        const hook = renderHook();

        await expect(hook.getGlobalIdentity()).resolves.toEqual(identity);
        expect(getGlobalIdentity).toHaveBeenCalledOnce();

        await expect(hook.getIdentitySettings()).resolves.toEqual({
            globalIdentity: identity,
            projectPreset: preset,
        });
        await expect(hook.saveGlobalIdentity(identity)).resolves.toEqual({
            success: true,
            identity,
        });
        await expect(hook.saveProjectIdentityPreset(preset)).resolves.toEqual({
            success: true,
            preset,
        });
        expect(getIdentitySettings).toHaveBeenCalledOnce();
        expect(saveGlobalIdentity).toHaveBeenCalledWith(identity);
        expect(saveProjectIdentityPreset).toHaveBeenCalledWith(preset);
    });
});
