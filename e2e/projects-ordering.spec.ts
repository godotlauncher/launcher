import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Locator,
    type Page,
    test,
} from '@playwright/test';
import type { ProjectDetails } from '@shared/contracts';
import {
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
} from './support/e2e-fixture-runtime';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: ElectronApplication;
let mainPage: Page;
let fixtureHome: string;

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
    await setAppLanguage(mainPage, 'English');
});

test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

for (const mode of ['cards', 'list', 'dense'] as const) {
test(`reveals pinned handles on hover and reorders projects in ${mode} view`, async () => {
    const pinnedProjects: ProjectDetails[] = [
        { ...SAMPLE_PROJECTS[0], pinned: true, pinned_order: 0 },
        SAMPLE_PROJECTS[1],
        SAMPLE_PROJECTS[2],
    ];
    await prepareAppWithStubbedData(mainPage, electronApp, {
        projects: pinnedProjects,
    });
    await installStatefulPinnedOrderHandlers(electronApp, pinnedProjects);
    await mainPage.getByTestId('btnProjects').click();
    if (mode === 'list') await mainPage.getByTestId('tabProjectList').click();
    if (mode === 'dense') await mainPage.getByTestId('tabProjectDenseList').click();
    await mainPage.getByTestId('inputProjectSearch').fill('');

    const newProjectCard = mainPage
        .locator('[data-project-section="new"]')
        .filter({
            has: mainPage.getByText('My Prototype', { exact: true }),
        });
    await newProjectCard.getByTestId('btnToggleProjectPinned').click();

    const pinnedSection = mainPage.locator(
        'section[aria-labelledby="pinned-projects-heading"]',
    );
    const projectNames = pinnedSection.locator(mode === 'cards' ? '[data-project-path] h3' : mode === 'dense' ? '[data-testid=btnLaunchDenseProject] > span' : '[data-testid=btnLaunchCompactProject] > span');
    await expect(projectNames).toHaveText(['My Prototype', 'My Awesome Game']);

    const firstHandle = pinnedSection
        .getByTestId('btnReorderPinnedProject')
        .first();
    const firstRow = pinnedSection.locator('[data-project-path]').first();
    const rowBounds = (await firstRow.boundingBox())!;
    const blankRowPosition = { x: rowBounds.width / 2, y: 2 };
    const heading = mainPage.getByTestId('projectsTitle');
    await heading.hover();
    await expect.poll(() => readHandleOpacity(firstHandle)).toBe(0);
    await expect.poll(() => handleReceivesPointer(firstHandle)).toBe(false);
    await firstRow.hover({ position: blankRowPosition });
    await expect.poll(() => readHandleOpacity(firstHandle)).toBe(1);
    await firstRow.click({ position: blankRowPosition });
    await expect(firstRow).toBeFocused();
    await heading.hover();
    // Row focus remains, but must not keep the grip visible after pointer leave.
    await expect(firstRow).toBeFocused();
    await expect.poll(() => readHandleOpacity(firstHandle)).toBe(0);
    await expect.poll(() => handleReceivesPointer(firstHandle)).toBe(false);
    await firstRow.hover({ position: blankRowPosition });
    await expect.poll(() => readHandleOpacity(firstHandle)).toBe(1);
    await firstHandle.hover();
    await expect.poll(() => readHandleOpacity(firstHandle)).toBe(1);
    await expect.poll(() => handleReceivesPointer(firstHandle)).toBe(true);
    await firstHandle.click();
    await heading.hover();
    await firstHandle.focus();
    await expect(firstHandle).toBeFocused();
    await expect.poll(() => readHandleOpacity(firstHandle)).toBe(0);
    await firstHandle.press('Space');
    await expect.poll(() => readHandleOpacity(firstHandle)).toBe(1);
    await expect(firstHandle).toHaveCSS('border-top-width', '1px');
    await mainPage.keyboard.press('ArrowDown');
    await mainPage.keyboard.press('Escape');
    await expect(projectNames).toHaveText(['My Prototype', 'My Awesome Game']);
    await expect.poll(() => readHandleOpacity(firstHandle)).toBe(0);

    await firstHandle.focus();
    await firstHandle.press('Space');
    await mainPage.keyboard.press('ArrowDown');
    await mainPage.keyboard.press('Space');

    await expect(projectNames).toHaveText(['My Awesome Game', 'My Prototype']);
    await expect.poll(() => readHandleOpacity(firstHandle)).toBe(0);

    // Pointer sorting still works from the handle at the outside edge.
    const sourceRow = pinnedSection.locator('[data-project-path]').first();
    await sourceRow.hover({ position: blankRowPosition });
    const sourceHandle = sourceRow.getByTestId('btnReorderPinnedProject');
    await sourceHandle.hover();
    const sourceBounds = (await sourceHandle.boundingBox())!;
    const targetBounds = (await pinnedSection.locator('[data-project-path]').nth(1).boundingBox())!;
    await mainPage.mouse.down();
    await mainPage.mouse.move(sourceBounds.x + sourceBounds.width / 2, sourceBounds.y + sourceBounds.height / 2 + 12, { steps: 5 });
    await expect(sourceHandle).toHaveAttribute('aria-grabbed', 'true');
    await expect.poll(() => readHandleOpacity(sourceHandle)).toBe(1);
    await expect(sourceHandle).toHaveCSS('border-top-width', '1px');
    await mainPage.screenshot({ path: test.info().outputPath(`pinned-handle-drag-${mode}.png`) });
    await mainPage.mouse.move(targetBounds.x + targetBounds.width / 2, targetBounds.y + targetBounds.height * 0.75, { steps: 15 });
    await mainPage.mouse.up();
    await expect(projectNames).toHaveText(['My Prototype', 'My Awesome Game']);
    await heading.hover();
    await expect.poll(() => readHandleOpacity(firstHandle)).toBe(0);

    await mainPage.reload();
    await expect(mainPage.getByTestId('btnProjects')).toBeVisible({
        timeout: 15000,
    });
    await mainPage.getByTestId('btnProjects').click();
    await expect(
        mainPage
            .locator('section[aria-labelledby="pinned-projects-heading"]')
            .locator('[data-project-path] h3'),
    ).toHaveText(['My Prototype', 'My Awesome Game']);

    await mainPage.getByTestId('inputProjectSearch').fill('Awesome');
    await expect(
        mainPage.getByTestId('btnReorderPinnedProject'),
    ).toBeDisabled();
});

}

/** Reads the rendered opacity, including every parent that can fade the grip.
 * @param handle - The pinned project's drag button.
 */
async function readHandleOpacity(handle: Locator): Promise<number> {
    return handle.evaluate(element => {
        let opacity = 1;
        for (let current: Element | null = element; current; current = current.parentElement) {
            opacity *= Number(getComputedStyle(current).opacity);
        }
        return opacity;
    });
}

/** Checks whether the grip can receive a pointer at its centre.
 * @param handle - The pinned project's drag button.
 */
async function handleReceivesPointer(handle: Locator): Promise<boolean> {
    return handle.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    });
}

/**
 * Installs project handlers that preserve pin and ordering changes across reloads.
 *
 * @param app - The Electron app that owns the project IPC handlers.
 * @param projects - The initial project collection.
 * @returns A promise that ends when the stateful handlers are installed.
 */
async function installStatefulPinnedOrderHandlers(
    app: ElectronApplication,
    projects: ProjectDetails[],
): Promise<void> {
    await app.evaluate(
        ({ ipcMain, BrowserWindow }, injectedProjects: ProjectDetails[]) => {
            let currentProjects = injectedProjects.map((project) => ({
                ...project,
                last_opened: project.last_opened
                    ? new Date(project.last_opened as unknown as string)
                    : null,
            }));
            const success = (data: ProjectDetails[]) => ({
                success: true as const,
                data,
            });
            const syncProjects = (nextProjects: ProjectDetails[]) => {
                currentProjects = nextProjects;
                for (const window of BrowserWindow.getAllWindows()) {
                    const webContents = window.webContents as typeof window.webContents & {
                        __docsProjects?: ProjectDetails[];
                    };
                    webContents.__docsProjects = currentProjects;
                }
                return success(currentProjects);
            };

            syncProjects(currentProjects);

            ipcMain.removeHandler('projects.getProjectsDetails');
            ipcMain.handle('projects.getProjectsDetails', async () =>
                success(currentProjects),
            );
            ipcMain.removeHandler('projects.checkAllProjectsValid');
            ipcMain.handle('projects.checkAllProjectsValid', async () =>
                success(currentProjects),
            );
            ipcMain.removeHandler('projects.reorderPinnedProjects');
            ipcMain.handle(
                'projects.reorderPinnedProjects',
                async (_event, orderedProjectPaths: string[]) => {
                    const orderByPath = new Map(
                        orderedProjectPaths.map((projectPath, index) => [
                            projectPath,
                            index,
                        ]),
                    );
                    return syncProjects(
                        currentProjects.map((project) => ({
                            ...project,
                            pinned_order: project.pinned
                                ? orderByPath.get(project.path)
                                : undefined,
                        })),
                    );
                },
            );
            ipcMain.removeHandler('projects.setProjectPinned');
            ipcMain.handle(
                'projects.setProjectPinned',
                async (_event, project: ProjectDetails, pinned: boolean) => {
                    const existingPinnedPaths = currentProjects
                        .filter(
                            (candidate) =>
                                candidate.pinned &&
                                candidate.path !== project.path,
                        )
                        .sort(
                            (left, right) =>
                                (left.pinned_order ?? 0) -
                                (right.pinned_order ?? 0),
                        )
                        .map((candidate) => candidate.path);
                    const orderedPinnedPaths = pinned
                        ? [project.path, ...existingPinnedPaths]
                        : existingPinnedPaths;
                    const orderByPath = new Map(
                        orderedPinnedPaths.map((projectPath, index) => [
                            projectPath,
                            index,
                        ]),
                    );
                    return syncProjects(
                        currentProjects.map((candidate) => {
                            const isTarget = candidate.path === project.path;
                            const isPinned = isTarget
                                ? pinned
                                : candidate.pinned;
                            return {
                                ...candidate,
                                pinned: isPinned,
                                pinned_order: isPinned
                                    ? orderByPath.get(candidate.path)
                                    : undefined,
                            };
                        }),
                    );
                },
            );
        },
        projects,
    );
}

function createIsolatedLaunchEnvironment(homeDir: string) {
    const launchEnv: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        HOME: homeDir,
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        USERPROFILE: homeDir,
        XDG_CACHE_HOME: path.join(homeDir, '.cache'),
        XDG_CONFIG_HOME: path.join(homeDir, '.config'),
        XDG_DATA_HOME: path.join(homeDir, '.local', 'share'),
        XDG_STATE_HOME: path.join(homeDir, '.local', 'state'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: homeDir,
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    return launchEnv;
}
