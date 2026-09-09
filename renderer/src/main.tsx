import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { HashRouter } from 'react-router';
import App from './app.component.tsx';
import './index.css';
import { AlertsProvider } from './hooks/alerts.hook.tsx';
import { AppProvider } from './hooks/app.hook.tsx';
import { AppNavigationProvider } from './hooks/app-navigation.hook.tsx';
import { PreferencesProvider } from './hooks/preferences.hook.tsx';
import { ProjectsProvider } from './hooks/projects.hook.tsx';
import { ReleaseProvider } from './hooks/release.hook.tsx';
import { ThemeProvider } from './hooks/theme.hook.tsx';
import i18n from './i18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <I18nextProvider i18n={i18n}>
            <AppProvider>
                <PreferencesProvider>
                    <ThemeProvider>
                        <HashRouter>
                            <AppNavigationProvider>
                                <ReleaseProvider>
                                    <AlertsProvider>
                                        <ProjectsProvider>
                                            <App />
                                        </ProjectsProvider>
                                    </AlertsProvider>
                                </ReleaseProvider>
                            </AppNavigationProvider>
                        </HashRouter>
                    </ThemeProvider>
                </PreferencesProvider>
            </AppProvider>
        </I18nextProvider>
    </React.StrictMode>,
);
