import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from '../../../renderer/src/hooks/theme.hook';
import i18n from '../../../renderer/src/i18n';
import { MigrationWizardFixture } from './migration-wizard.fixture';
import { WizardFixture } from './wizard.fixture';

/** Mounts a controlled fixture only when an Electron E2E test imports this module.
 * @param kind - Component scenario exercised by the test.
 */
export function mountWizardFixture(kind: 'generic' | 'migration'): void {
    const application = document.getElementById('root');
    if (!application) throw new Error('Application root not found');
    application.hidden = true;
    application.inert = true;
    const fixture = document.createElement('div');
    fixture.id = 'wizard-e2e-fixture';
    document.body.append(fixture);
    createRoot(fixture).render(
        <I18nextProvider i18n={i18n}>
            <ThemeProvider>
                {kind === 'generic' ? (
                    <WizardFixture />
                ) : (
                    <MigrationWizardFixture />
                )}
            </ThemeProvider>
        </I18nextProvider>,
    );
}
