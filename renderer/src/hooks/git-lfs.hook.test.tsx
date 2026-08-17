import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGitLfs } from './git-lfs.hook.ts';

describe('useGitLfs', () => {
    const policy = {
        id: 'godot-documentation-defaults',
        groups: [],
    } as const;
    const getTrackingPolicy = vi.fn(async () => policy);

    beforeEach(() => {
        vi.clearAllMocks();
        (
            globalThis as unknown as {
                window: Window;
            }
        ).window = {
            electron: {
                'gitLfs.getTrackingPolicy': getTrackingPolicy,
            },
        } as unknown as Window;
    });

    function renderHook(): ReturnType<typeof useGitLfs> {
        let captured: ReturnType<typeof useGitLfs> | undefined;

        const Capture = () => {
            captured = useGitLfs();
            return null;
        };

        renderToStaticMarkup(<Capture />);

        if (!captured) {
            throw new Error('Hook was not rendered');
        }
        return captured;
    }

    it('delegates policy reads to the Git LFS bridge', async () => {
        const hook = renderHook();

        await expect(hook.getTrackingPolicy()).resolves.toEqual(policy);
        expect(getTrackingPolicy).toHaveBeenCalledOnce();
    });
});
