import React, { type PropsWithChildren } from 'react';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type ResolvedTheme = Exclude<ThemeMode, 'auto'>;
export type ThemeProviderContext = {
    systemTheme: ResolvedTheme;
    theme: ThemeMode | null;
    setTheme: (theme: ThemeMode) => void;
};

/**
 * Reads the valid saved theme preference, falling back to Automatic.
 *
 * @returns The saved theme preference.
 */
const getStoredTheme = (): ThemeMode => {
    const storedTheme = localStorage.getItem('theme') as ThemeMode | null;
    if (storedTheme === 'dark' || storedTheme === 'light') {
        return storedTheme;
    }
    return 'auto';
};

/**
 * Stores the user's theme preference.
 *
 * @param theme - The theme preference to save.
 */
const setStoredTheme = (theme: ThemeMode): void => {
    localStorage.setItem('theme', theme);
};

/**
 * Gets the currently preferred operating-system theme.
 *
 * @returns The resolved system theme.
 */
export const getSystemTheme = (): ResolvedTheme =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';

/**
 * Resolves Automatic against the current system theme.
 *
 * @param theme - The saved theme preference.
 * @param systemTheme - The current operating-system theme.
 * @returns The theme that must be applied to the document.
 */
export const resolveTheme = (
    theme: ThemeMode,
    systemTheme: ResolvedTheme,
): ResolvedTheme => (theme === 'auto' ? systemTheme : theme);

/**
 * Subscribes to operating-system theme changes and reports the current value.
 *
 * @param onSystemThemeChange - Receives the newly resolved system theme.
 * @returns A function that removes the subscription.
 */
export const subscribeToSystemThemeChanges = (
    onSystemThemeChange: (theme: ResolvedTheme) => void,
): (() => void) => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (): void => {
        onSystemThemeChange(mediaQuery.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    handleChange();
    return () => mediaQuery.removeEventListener('change', handleChange);
};

const themeContext = React.createContext<ThemeProviderContext>(
    {} as ThemeProviderContext,
);

export const useTheme = () => React.useContext(themeContext);

type ThemeProviderProps = PropsWithChildren;

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const [theme, setTheme] = React.useState<ThemeMode>(getStoredTheme());
    const [systemTheme, setSystemTheme] =
        React.useState<ResolvedTheme>(getSystemTheme);

    React.useEffect(() => {
        if (theme !== 'auto') {
            return;
        }

        return subscribeToSystemThemeChanges(setSystemTheme);
    }, [theme]);

    React.useEffect(() => {
        document.documentElement.setAttribute(
            'data-theme',
            resolveTheme(theme, systemTheme),
        );
        setStoredTheme(theme);
    }, [theme, systemTheme]);

    return (
        <themeContext.Provider value={{ theme, setTheme, systemTheme }}>
            {children}
        </themeContext.Provider>
    );
};
