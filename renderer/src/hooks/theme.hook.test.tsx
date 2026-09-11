import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTheme, subscribeToSystemThemeChanges } from './theme.hook';

describe('theme handling', () => {
    const mediaQuery = {
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mediaQuery.matches = false;
        (
            globalThis as unknown as {
                window: Window;
            }
        ).window = {
            matchMedia: vi.fn(() => mediaQuery),
        } as unknown as Window;
    });

    it.each([
        ['Automatic follows system dark mode', 'auto', 'dark', 'dark'],
        ['Automatic follows system light mode', 'auto', 'light', 'light'],
        ['Dark overrides system light mode', 'dark', 'light', 'dark'],
        ['Light overrides system dark mode', 'light', 'dark', 'light'],
    ] as const)('%s', (_description, theme, systemTheme, expectedTheme) => {
        expect(resolveTheme(theme, systemTheme)).toBe(expectedTheme);
    });

    it('reports system changes and removes its listener during cleanup', () => {
        const onSystemThemeChange = vi.fn();
        const cleanup = subscribeToSystemThemeChanges(onSystemThemeChange);
        const listener = mediaQuery.addEventListener.mock.calls[0]?.[1] as
            | (() => void)
            | undefined;

        mediaQuery.matches = true;
        listener?.();

        expect(onSystemThemeChange).toHaveBeenCalledWith('dark');
        cleanup();
        expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
            'change',
            listener,
        );
    });

    it('refreshes the system theme when Automatic is selected again', () => {
        const onSystemThemeChange = vi.fn();
        const cleanup = subscribeToSystemThemeChanges(onSystemThemeChange);
        expect(onSystemThemeChange).toHaveBeenLastCalledWith('light');
        cleanup();

        mediaQuery.matches = true;
        const unsubscribe = subscribeToSystemThemeChanges(onSystemThemeChange);
        expect(onSystemThemeChange).toHaveBeenLastCalledWith('dark');
        unsubscribe();
    });
});
