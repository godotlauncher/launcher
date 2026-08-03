import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSplashscreenHandoff } from './useSplashscreenHandoff';

const mocks = vi.hoisted(() => ({
    loggerError: vi.fn(),
    rendererReady: vi.fn(async () => undefined),
}));

vi.mock('react', () => ({
    useEffect: (effect: () => void) => effect(),
}));

vi.mock('../bridge', () => ({
    appBridge: {
        rendererReady: mocks.rendererReady,
    },
}));

vi.mock('electron-log/renderer', () => ({
    default: {
        error: mocks.loggerError,
    },
}));

describe('useSplashscreenHandoff', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not notify the main process while the renderer is loading', () => {
        useSplashscreenHandoff(false);

        expect(mocks.rendererReady).not.toHaveBeenCalled();
    });

    it('notifies the main process immediately when the renderer is ready', () => {
        useSplashscreenHandoff(true);

        expect(mocks.rendererReady).toHaveBeenCalledOnce();
    });

    it('logs a failed readiness notification through the renderer logger', async () => {
        const error = new Error('IPC unavailable');
        mocks.rendererReady.mockRejectedValueOnce(error);

        useSplashscreenHandoff(true);

        await vi.waitFor(() => {
            expect(mocks.loggerError).toHaveBeenCalledWith(
                'Failed to close splash screen',
                error,
            );
        });
    });
});
