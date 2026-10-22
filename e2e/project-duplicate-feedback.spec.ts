import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PREFS, SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import {
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
    stubCreateProjectPublicationTargets,
    stubCreateProjectRepositoryNameAvailability,
    stubGlobalGitIdentity,
} from './support/e2e-fixture-runtime';

let app: ElectronApplication;
let page: Page;
let home: string;
const source = {
    ...SAMPLE_PROJECTS[1],
    name: 'Source project',
    codeEditorId: null,
};
const copyPath = '/fixture/independent-copy';

test.beforeAll(async () => {
    home = await createFixtureHome();
    const env = Object.fromEntries(
        Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`],
        env: {
            ...env,
            GODOT_LAUNCHER_E2E_FIXTURES: '1',
            GODOT_LAUNCHER_E2E_HOME_DIR: home,
        },
    });
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
});

test.afterAll(async () => {
    await app?.close();
    if (home) await fs.rm(home, { recursive: true, force: true });
});

/** Installs deterministic project results through the Electron preload bridge.
 * @param fail - Whether creation fails before a copy is registered.
 * @param publish - Whether to return successful GitHub publication.
 */
async function prepare(fail = false, publish = false) {
    const projects = [
        source,
        ...Array.from({ length: 20 }, (_, index) => ({
            ...source,
            name: `Existing ${index}`,
            path: `/fixture/existing-${index}`,
        })),
    ];
    await prepareAppWithStubbedData(page, app, {
        projects,
        preferences: {
            ...SAMPLE_PREFS,
            language: 'en',
            projects_group_order: ['recents', 'pinned', 'new'],
        },
    });
    if (publish) {
        await stubGlobalGitIdentity(app, {
            name: 'Fixture User',
            email: 'fixture@example.com',
        });
        await stubCreateProjectPublicationTargets(app, {
            success: true,
            targets: [
                {
                    providerId: 'github',
                    connectionId: '4d542f86-89c7-4a7c-89cf-835ce17022af',
                    accessTargetId: 'de178a20-320a-471f-8c8c-94061ac13de1',
                    ownerLogin: 'fixture-owner',
                    ownerType: 'user',
                    accountLogin: 'fixture-owner',
                },
            ],
        });
        await stubCreateProjectRepositoryNameAvailability(app, {
            status: 'available',
        });
    }
    await app.evaluate(
        ({ ipcMain }, injected) => {
            let registered = false;
            const copy = {
                ...injected.source,
                name: 'Independent copy',
                path: injected.copyPath,
                last_opened: null,
                is_new: true,
                pinned: false,
                added_at: new Date(),
            };
            const projects = injected.projects.map((project) => ({
                ...project,
                last_opened: project.last_opened
                    ? new Date(project.last_opened)
                    : null,
            }));
            for (const channel of [
                'projects.getProjectsDetails',
                'projects.inspectCreateProjectDestination',
                'projects.inspectCreateProjectRepository',
                'projects.createProject',
            ])
                ipcMain.removeHandler(channel);
            ipcMain.handle('projects.getProjectsDetails', () => ({
                success: true,
                data: registered ? [...projects, copy] : projects,
            }));
            ipcMain.handle('projects.inspectCreateProjectDestination', () => ({
                success: true,
                data: { status: 'available' },
            }));
            ipcMain.handle('projects.inspectCreateProjectRepository', () => ({
                success: true,
                data: { status: 'not-a-repository' },
            }));
            ipcMain.handle('projects.createProject', () => {
                registered = !injected.fail;
                return {
                    success: true,
                    data: injected.fail
                        ? {
                              success: false,
                              error: 'Copy failed before registration.',
                          }
                        : {
                              success: true,
                              projectDetails: copy,
                              ...(injected.publish
                                  ? {
                                        publication: {
                                            status: 'published',
                                            repository: {
                                                owner: 'fixture-owner',
                                                name: 'independent-copy',
                                                webUrl: 'https://github.com/fixture-owner/independent-copy',
                                            },
                                        },
                                    }
                                  : {}),
                          },
                };
            });
        },
        { projects, source, copyPath, fail, publish },
    );
    await page.getByTestId('btnProjects').click();
    await page.setViewportSize({ width: 1024, height: 700 });
}

/** Opens the duplicate drawer and supplies a destination independent of search.
 * @param publish - Whether the copy will be published to GitHub.
 */
async function openDuplicate(publish = false) {
    await page
        .locator('li[data-project-path]')
        .filter({ hasText: source.name })
        .getByTestId('btnProjectMoreOptions')
        .click();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.getByTestId('inputProjectName').fill('Independent copy');
    await page.getByTestId('btnContinueDuplicate').click();
    await page
        .getByRole('checkbox', {
            name: 'Create a new Git repository',
            exact: true,
        })
        .setChecked(publish);
    if (publish)
        await page
            .getByRole('checkbox', {
                name: 'Publish to a private GitHub repository',
                exact: true,
            })
            .check();
    await page
        .getByRole('checkbox', { name: 'Open in Godot', exact: true })
        .uncheck();
}

for (const [mode, theme, reducedMotion] of [
    ['tabProjectCards', 'dark', 'no-preference'],
    ['tabProjectList', 'light', 'no-preference'],
    ['tabProjectDenseList', 'dark', 'reduce'],
] as const) {
    test(`reveals the offscreen copy and preserves filters in ${mode}`, async () => {
        await prepare();
        await page.emulateMedia({ reducedMotion });
        await page.evaluate(
            (theme) =>
                document.documentElement.setAttribute('data-theme', theme),
            theme,
        );
        await page.getByTestId(mode).click();
        await openDuplicate();
        await page.getByTestId('btnCreateProject').click();
        const copy = page.locator(`li[data-project-path="${copyPath}"]`);
        await expect(copy).toBeFocused();
        await expect(copy).toBeInViewport({ ratio: 1 });
        await expect(copy).toHaveAttribute('data-project-section', 'new');
        await page.screenshot({
            path: test.info().outputPath(`duplicate-revealed-${mode}.png`),
        });
        await expect
            .poll(() =>
                copy.evaluate((element) => element.getAnimations().length),
            )
            .toBe(0);
        await expect(copy).toBeVisible();

        await prepare();
        await page.getByTestId(mode).click();
        await page.getByTestId('inputProjectSearch').fill('Source');
        await openDuplicate();
        await page.getByTestId('btnCreateProject').click();
        await expect(copy).toBeFocused();
        await expect(page.getByTestId('inputProjectSearch')).toHaveValue(
            'Source',
        );
        await expect(page.locator('li[data-project-path]')).toHaveCount(2);
        await page.getByTestId('inputProjectSearch').fill('Source project');
        await expect(copy).toHaveCount(0);
        await page.getByTestId('inputProjectSearch').fill('Source');
        await expect(copy).toHaveCount(0);
    });
}

test('failed and cancelled copies leave focus and the project list unchanged', async () => {
    await prepare(true);
    await openDuplicate();
    await page.getByTestId('btnCreateProject').click();
    await expect(
        page.getByRole('dialog', { name: 'Error', exact: true }),
    ).toContainText('Copy failed before registration.');
    await page.getByRole('button', { name: 'Ok', exact: true }).click();
    await page.getByTestId('btnCloseCreateProject').click();
    await expect(
        page.locator(`li[data-project-path="${copyPath}"]`),
    ).toHaveCount(0);
    await expect(page.locator('li[data-project-path]')).toHaveCount(21);
});

test('reveals the duplicate after dismissing GitHub publication success', async () => {
    await prepare(false, true);
    await openDuplicate(true);
    await page.getByTestId('btnCreateProject').click();
    const alert = page.getByRole('dialog', {
        name: 'Published to GitHub',
        exact: true,
    });
    await expect(alert).toBeVisible();
    const copy = page.locator(`li[data-project-path="${copyPath}"]`);
    await expect(copy).not.toBeFocused();
    await expect
        .poll(() => copy.evaluate((element) => element.getAnimations().length))
        .toBe(0);
    await page.getByTestId('btnAlertOk').click();
    await expect(copy).toBeFocused();
    await expect(copy).toBeInViewport({ ratio: 1 });
    await expect
        .poll(() => copy.evaluate((element) => element.getAnimations().length))
        .toBeGreaterThan(0);
});
