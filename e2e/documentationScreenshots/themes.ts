import type { ThemeConfig } from './types';

export const THEMES: ThemeConfig[] = [
    {
        name: 'dark',
        description: 'dark mode',
        toggleTestId: 'themeDark',
        colorScheme: 'dark',
    },
    {
        name: 'light',
        description: 'light mode',
        toggleTestId: 'themeLight',
        colorScheme: 'light',
    },
];
