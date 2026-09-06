import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, expect, test } from '@playwright/test';
import { createFixtureHome } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

test('upgrades a legacy VS Code selection without retaining its flag', async () => {
    const fixtureHome = await createFixtureHome();
    const projectsPath = path.join(
        fixtureHome,
        '.gd-launcher',
        'projects.json',
    );
    const [sample] = JSON.parse(await fs.readFile(projectsPath, 'utf-8'));
    const { codeEditorId: _codeEditorId, ...legacyProject } = sample;
    await fs.writeFile(
        projectsPath,
        JSON.stringify([{ ...legacyProject, withVSCode: true }]),
    );
    const bootstrapPath = path.join(fixtureHome, 'bootstrap.cjs');
    await fs.writeFile(
        bootstrapPath,
        `
        require(${JSON.stringify(path.resolve('e2e/support/overrideHome.cjs'))});
        const os = require('node:os');
        if (os.homedir() !== ${JSON.stringify(fixtureHome)}) {
            throw new Error('Fixture home isolation failed');
        }
        const { app } = require('electron');
        app.setAppPath(${JSON.stringify(process.cwd())});
        app.setPath('userData', ${JSON.stringify(path.join(fixtureHome, 'electron-user-data'))});
        import(${JSON.stringify(path.resolve('dist-electron/main.js'))});
    `,
    );
    const env = {
        ...process.env,
        APPDATA: path.join(fixtureHome, 'AppData', 'Roaming'),
        HOME: fixtureHome,
        LOCALAPPDATA: path.join(fixtureHome, 'AppData', 'Local'),
        USERPROFILE: fixtureHome,
        XDG_CACHE_HOME: path.join(fixtureHome, '.cache'),
        XDG_CONFIG_HOME: path.join(fixtureHome, '.config'),
        XDG_DATA_HOME: path.join(fixtureHome, '.local', 'share'),
        XDG_STATE_HOME: path.join(fixtureHome, '.local', 'state'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({ args: [bootstrapPath], env });
    try {
        const page = await getMainWindow(app);
        await page.getByTestId('btnProjects').click();
        await page.getByTestId('btnProjectSettings').first().click();
        await page
            .getByRole('tab', { name: 'Code Editor', exact: true })
            .click();
        await expect(page.getByTestId('selectProjectCodeEditor')).toContainText(
            'Visual Studio Code',
        );
        const [stored] = JSON.parse(await fs.readFile(projectsPath, 'utf-8'));
        expect(stored.codeEditorId).toBe('vscode');
        expect(stored).not.toHaveProperty('withVSCode');
        expect(stored.path).toBe(legacyProject.path);
    } finally {
        await app.close();
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
});
