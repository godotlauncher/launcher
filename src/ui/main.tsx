import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from './App.tsx';
import './index.css';
import { AlertsProvider } from './hooks/useAlerts.tsx';
import { AppProvider } from './hooks/useApp.tsx';
import { AppNavigationProvider } from './hooks/useAppNavigation.tsx';
import { PreferencesProvider } from './hooks/usePreferences.tsx';
import { ProjectsProvider } from './hooks/useProjects.tsx';
import { ReleaseProvider } from './hooks/useRelease.tsx';
import { ThemeProvider } from './hooks/useTheme.tsx';
import i18n from './i18n';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <I18nextProvider i18n={i18n}>
            <AppProvider>
                <PreferencesProvider>
                    <ThemeProvider>
                        <AppNavigationProvider>
                            <ReleaseProvider>
                                <ProjectsProvider>
                                    <AlertsProvider>
                                        <App />
                                    </AlertsProvider>
                                </ProjectsProvider>
                            </ReleaseProvider>
                        </AppNavigationProvider>
                    </ThemeProvider>
                </PreferencesProvider>
            </AppProvider>
        </I18nextProvider>
    </React.StrictMode>,
);
