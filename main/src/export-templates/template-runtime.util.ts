import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import logger from 'electron-log';
import { getCurrentAppConfig } from '../config/current-app-config.js';
import { readImportedTemplates } from './imported-templates.store.js';
import {
    connectEmptyTemplateFolder,
    reserveTemplateConnection,
    resolveTemplateRoot,
    templateConnectionStatus,
} from './template-files.util.js';
import { projectOfficialTemplateRoot } from './template-paths.util.js';
import {
    disconnectImportedTemplateView,
    projectTemplateBuilds,
} from './template-projection.util.js';
import { assertTemplateStorageAvailable } from './template-storage.service.js';

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
 * @param exportTemplateMode - Project template preference.
 * @param selections - Saved per-version build choices.
 * @param currentSetId - Current editor identity.
 */
export async function connectProjectTemplates(
    editorDirectory: string,
    release: Pick<InstalledRelease, 'source'>,
    exportTemplateMode?: ProjectDetails['exportTemplateMode'],
    selections?: ProjectDetails['exportTemplateBuilds'],
    currentSetId?: string,
): Promise<void> {
    await assertTemplateStorageAvailable(
        release.source === 'custom' ? 'journal' : 'official',
    );
    const selected = currentSetId ? selections?.[currentSetId] : undefined;
    const importedSelected = Boolean(
        release.source !== 'custom' && selected && selected !== 'official',
    );
    if (importedSelected) await assertTemplateStorageAvailable('imported');
    const releaseConnection = await reserveTemplateConnection();
    try {
        if (release.source === 'custom') {
            await disconnectImportedTemplateView(editorDirectory);
            if (exportTemplateMode === 'separate') return;
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

        try {
            await connectEmptyTemplateFolder(
                editorDirectory,
                release,
                getSharedTemplateRoot(),
            );
        } catch (error) {
            logger.warn('Could not connect shared export templates', error);
        }
        const backing = projectOfficialTemplateRoot(editorDirectory);
        if (
            (await templateConnectionStatus(
                backing,
                getSharedTemplateRoot(),
            )) === 'local' &&
            (await fs.promises.readdir(backing)).length
        )
            return;
        try {
            await projectTemplateBuilds(
                editorDirectory,
                getSharedTemplateRoot(),
                importedSelected
                    ? await readImportedTemplates()
                    : { schemaVersion: 1, builds: [] },
                selections,
                currentSetId,
            );
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (!importedSelected && (code === 'EACCES' || code === 'EPERM')) {
                const active = path.join(
                    editorDirectory,
                    'editor_data',
                    'export_templates',
                );
                const status = await templateConnectionStatus(
                    active,
                    getSharedTemplateRoot(),
                );
                if (
                    status === 'shared' ||
                    status === 'missing' ||
                    (status === 'local' &&
                        !(await fs.promises.readdir(active)).length)
                ) {
                    logger.warn(
                        'Could not connect shared export templates',
                        error,
                    );
                    return;
                }
            }
            throw error;
        }
    } finally {
        releaseConnection();
    }
}
