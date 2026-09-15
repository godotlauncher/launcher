import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InstalledRelease } from '@shared/contracts';
import logger from 'electron-log';
import { getCurrentAppConfig } from '../config/current-app-config.js';
import {
    connectEmptyTemplateFolder,
    resolveTemplateRoot,
    templateConnectionStatus,
} from './template-files.util.js';

/** Resolves production storage or the isolated development fixture root. */
export function getSharedTemplateRoot(): string {
    const config = getCurrentAppConfig();
    return config.e2eFixtures
        ? path.join(config.paths.configDir, 'godot', 'export_templates')
        : resolveTemplateRoot();
}
/** Connects an empty official editor environment without making launch depend on links.
 * @param editorDirectory - Project editor directory.
 * @param release - Selected editor.
 */
export async function connectProjectTemplates(
    editorDirectory: string,
    release: Pick<InstalledRelease, 'source'>,
): Promise<void> {
    try {
        if (release.source === 'custom') {
            const local = path.join(
                editorDirectory,
                'editor_data',
                'export_templates',
            );
            if (
                (await templateConnectionStatus(
                    local,
                    getSharedTemplateRoot(),
                )) === 'shared'
            ) {
                await fs.promises.unlink(local);
                await fs.promises.mkdir(local);
            }
            return;
        }
        await connectEmptyTemplateFolder(
            editorDirectory,
            release,
            getSharedTemplateRoot(),
        );
    } catch (error) {
        if (release.source === 'custom') throw error;
        logger.warn('Could not connect shared export templates', error);
    }
}
