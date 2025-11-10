import React, { type PropsWithChildren } from 'react';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type ThemeProviderContext = {
    systemTheme: ThemeMode;
    theme: ThemeMode | null;
    setTheme: (theme: ThemeMode) => void;
};

const getStoredTheme = () => {
    const storedTheme = localStorage.getItem('theme') as ThemeMode | null;
    if (storedTheme === 'dark' || storedTheme === 'light') {
        return storedTheme;
    }
    return 'auto';
};

const setStoredTheme = (theme: ThemeMode) => {
    localStorage.setItem('theme', theme);
};

const themeContext = React.createContext<ThemeProviderContext>(
    {} as ThemeProviderContext,
);


export const useTheme = () => React.useContext(themeContext);

type ThemeProviderProps = PropsWithChildren;

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const [theme, setTheme] = React.useState<ThemeMode>(getStoredTheme());

    const updateDocumentTheme = (theme: ThemeMode) => {
        const systemPrefersDark = window.matchMedia(
            '(prefers-color-scheme: dark)',
        ).matches;

        const isDark =
            theme === 'dark' ||
            (!('theme' in localStorage) && systemPrefersDark);

        if (theme !== 'auto') {
            document.documentElement.setAttribute(
                'data-theme',
                isDark ? 'dark' : 'light',
            );
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        setStoredTheme(theme);
    };

    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';

    React.useEffect(() => {
        const storedTheme = localStorage.getItem('theme') as ThemeMode | null;

        if (storedTheme === 'dark' || storedTheme === 'light') {
            setTheme(storedTheme);
        } else {
            setTheme('auto');
        }

        updateDocumentTheme(storedTheme || 'auto');
    }, []);

    React.useEffect(() => {
        updateDocumentTheme(theme);
        localStorage.setItem('theme', theme);

        updateDocumentTheme(theme);
    }, [theme]);

    return (
        <themeContext.Provider value={{ theme, setTheme, systemTheme }}>
            {children}
        </themeContext.Provider>
    );
};
