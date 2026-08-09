import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import type { ProjectDetails } from '@shared/contracts';
import {
    createFixtureHome,
    prepareAppWithStubbedData,
} from './documentationScreenshots/runtime';
import { SAMPLE_PROJECTS } from './documentationScreenshots/sampleData';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: ElectronApplication;
let mainPage: Page;
let fixtureHome: string;

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: ['.'],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
});

test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('reorders pinned projects with the keyboard and keeps the order after reload', async () => {
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

    const newProjectCard = mainPage
        .locator('[data-project-section="new"]')
        .filter({
            has: mainPage.getByText('My Prototype', { exact: true }),
        });
    await newProjectCard.getByTestId('btnToggleProjectPinned').click();

    const pinnedSection = mainPage.locator(
        'section[aria-labelledby="pinned-projects-heading"]',
    );
    const projectNames = pinnedSection.locator('[data-project-path] h3');
    await expect(projectNames).toHaveText(['My Prototype', 'My Awesome Game']);

    const firstHandle = pinnedSection
        .getByTestId('btnReorderPinnedProject')
        .first();
    await firstHandle.focus();
    await firstHandle.press('Space');
    await mainPage.keyboard.press('ArrowDown');
    await mainPage.keyboard.press('Escape');
    await expect(projectNames).toHaveText(['My Prototype', 'My Awesome Game']);

    await firstHandle.focus();
    await firstHandle.press('Space');
    await mainPage.keyboard.press('ArrowDown');
    await mainPage.keyboard.press('Space');

    await expect(projectNames).toHaveText(['My Awesome Game', 'My Prototype']);

    await mainPage.reload();
    await expect(mainPage.getByTestId('btnProjects')).toBeVisible({
        timeout: 15000,
    });
    await mainPage.getByTestId('btnProjects').click();
    await expect(
        mainPage
            .locator('section[aria-labelledby="pinned-projects-heading"]')
            .locator('[data-project-path] h3'),
    ).toHaveText(['My Awesome Game', 'My Prototype']);

    await mainPage.getByPlaceholder('Search').fill('Awesome');
    await expect(
        mainPage.getByTestId('btnReorderPinnedProject'),
    ).toBeDisabled();
});

async function installStatefulPinnedOrderHandlers(
    app: ElectronApplication,
    projects: ProjectDetails[],
) {
    await app.evaluate(
        ({ ipcMain }, injectedProjects: ProjectDetails[]) => {
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

            ipcMain.removeHandler('app.getProjectsDetails');
            ipcMain.handle('app.getProjectsDetails', async () =>
                success(currentProjects),
            );
            ipcMain.removeHandler('app.checkAllProjectsValid');
            ipcMain.handle('app.checkAllProjectsValid', async () =>
                success(currentProjects),
            );
            ipcMain.removeHandler('app.reorderPinnedProjects');
            ipcMain.handle(
                'app.reorderPinnedProjects',
                async (_event, orderedProjectPaths: string[]) => {
                    const orderByPath = new Map(
                        orderedProjectPaths.map((projectPath, index) => [
                            projectPath,
                            index,
                        ]),
                    );
                    currentProjects = currentProjects.map((project) => ({
                        ...project,
                        pinned_order: project.pinned
                            ? orderByPath.get(project.path)
                            : undefined,
                    }));
                    return success(currentProjects);
                },
            );
            ipcMain.removeHandler('app.setProjectPinned');
            ipcMain.handle(
                'app.setProjectPinned',
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
                    currentProjects = currentProjects.map((candidate) => {
                        const isTarget = candidate.path === project.path;
                        const isPinned = isTarget ? pinned : candidate.pinned;
                        return {
                            ...candidate,
                            pinned: isPinned,
                            pinned_order: isPinned
                                ? orderByPath.get(candidate.path)
                                : undefined,
                        };
                    });
                    return success(currentProjects);
                },
            );
        },
        projects,
    );
}

function createIsolatedLaunchEnvironment(homeDir: string) {
    const overrideHomeScript = path.resolve(
        process.cwd(),
        'e2e',
        'support',
        'overrideHome.cjs',
    );
    const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
    const requireOverrideOption = `--require "${overrideHomeScript}"`;
    const launchEnv: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        GODOT_LAUNCHER_DOCS_SCREENSHOTS: '1',
        GODOT_LAUNCHER_DOCS_HOME_DIR: homeDir,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    return launchEnv;
}
