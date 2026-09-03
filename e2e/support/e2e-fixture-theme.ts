export type E2eFixtureTheme = {
    name: 'dark' | 'light';
    description: string;
    toggleTestId: 'themeDark' | 'themeLight' | 'themeAuto';
    colorScheme: 'dark' | 'light';
};

export const THEMES: E2eFixtureTheme[] = [
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
