import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { ThemeProvider } from './hooks/useTheme.tsx';
import { PreferencesProvider } from './hooks/usePreferences.tsx';
import { ReleaseProvider } from './hooks/useRelease.tsx';
import { AlertsProvider } from './hooks/useAlerts.tsx';
import { ProjectsProvider } from './hooks/useProjects.tsx';
import { AppNavigationProvider } from './hooks/useAppNavigation.tsx';
import { AppProvider } from './hooks/useApp.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AppProvider>
            <PreferencesProvider>
                <ThemeProvider >
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
    </React.StrictMode >,
);
