import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

/** Loads a test-only renderer fixture inside the real Electron window and preload environment.
 * @param page - Existing application renderer.
 * @param kind - Reusable wizard or export-template migration scenario.
 */
export async function mountWizardFixture(
    page: Page,
    kind: 'generic' | 'migration',
): Promise<void> {
    await expect(page.getByTestId('btnHelp')).toBeVisible();
    const filename = fileURLToPath(
        new URL('./wizard/mount.fixture.tsx', import.meta.url),
    );
    await page.evaluate(
        async ({ url, kind }) => {
            const fixture = await import(url);
            fixture.mountWizardFixture(kind);
        },
        { url: `/@fs/${filename.replaceAll('\\', '/')}`, kind },
    );
    await expect(
        page.getByRole('button', {
            name:
                kind === 'generic'
                    ? 'Open sample wizard'
                    : 'Open migration fixture',
            exact: true,
        }),
    ).toBeVisible();
}
