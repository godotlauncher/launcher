import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGit } from './git.hook.ts';

describe('useGit', () => {
    const identity = {
        name: 'Mario',
        email: 'mario@example.com',
    };
    const getGlobalIdentity = vi.fn(async () => identity);

    beforeEach(() => {
        vi.clearAllMocks();
        (
            globalThis as unknown as {
                window: Window;
            }
        ).window = {
            electron: {
                'git.getGlobalIdentity': getGlobalIdentity,
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
    });
});
