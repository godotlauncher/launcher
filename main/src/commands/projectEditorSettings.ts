import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProjectDetails } from '@shared';
import { dialog } from 'electron';
import { t } from '../i18n/index.js';
import { getMainWindow } from '../mainWindow.js';

export async function exportProjectEditorSettings(
    project: ProjectDetails,
): Promise<void> {
    const result = await dialog.showSaveDialog(getMainWindow(), {
        title: t('dialogs:exportSettings.title'),
        defaultPath: path.resolve(
            os.homedir(),
            path.basename(project.editor_settings_file),
        ),
        filters: [
            {
                name: t('dialogs:exportSettings.allFiles'),
                extensions: ['*'],
            },
        ],
    });

    if (result.canceled) {
        return;
    }

    await fs.promises.copyFile(project.editor_settings_file, result.filePath);
}

export async function importProjectEditorSettings(
    project: ProjectDetails,
): Promise<void> {
    const result = await dialog.showOpenDialog(getMainWindow(), {
        title: t('dialogs:importSettings.selectFile'),
        defaultPath: os.homedir(),
        properties: ['openFile'],
        filters: [
            {
                name: t('dialogs:importSettings.textResource'),
                extensions: ['tres'],
            },
        ],
    });

    if (result.canceled) {
        return;
    }

    const savePath =
        project.editor_settings_file.length > 0
            ? project.editor_settings_file
            : path.resolve(
                  path.dirname(project.launch_path),
                  'editor_data',
                  path.basename(result.filePaths[0]),
              );

    if (fs.existsSync(project.editor_settings_file)) {
        await fs.promises.copyFile(
            project.editor_settings_file,
            path.resolve(
                path.dirname(project.editor_settings_file),
                `${path.basename(project.editor_settings_file)}.${Date.now()}.bak`,
            ),
        );
    }

    await fs.promises.copyFile(result.filePaths[0], savePath);
}
