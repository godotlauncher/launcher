import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGitLfs } from './git-lfs.hook.ts';

/** Captures a hook value through a stable server-rendered test component.
 * @param props - Callback receiving the current hook value.
 */
function Capture({
    capture,
}: {
    capture: (value: ReturnType<typeof useGitLfs>) => void;
}) {
    capture(useGitLfs());
    return null;
}

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

        renderToStaticMarkup(
            <Capture
                capture={(value) => {
                    captured = value;
                }}
            />,
        );

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
