import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import logger from 'electron-log';
import { getCurrentAppConfig } from '../config/current-app-config.js';
import {
    connectEmptyTemplateFolder,
    resolveTemplateRoot,
    templateConnectionStatus,
} from './template-files.util.js';

// Protects late automatic work holding project snapshots from before a saved opt-out.
const separateDirectories = new Set<string>();

/** Remembers a successfully persisted opt-out for in-flight project snapshots.
 * @param editorDirectory - Editor environment whose preference was saved.
 */
export function rememberSeparateTemplateDirectory(
    editorDirectory: string,
): void {
    separateDirectories.add(templateDirectoryKey(editorDirectory));
}

/** Clears an opt-out after an explicit successful shared connection.
 * @param editorDirectory - Reconnected editor environment.
 */
export function forgetSeparateTemplateDirectory(editorDirectory: string): void {
    separateDirectories.delete(templateDirectoryKey(editorDirectory));
}

/** Normalises an editor environment key for the host filesystem.
 * @param editorDirectory - Editor directory to identify.
 */
function templateDirectoryKey(editorDirectory: string): string {
    const resolved = path.resolve(editorDirectory);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

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
 */
export async function connectProjectTemplates(
    editorDirectory: string,
    release: Pick<InstalledRelease, 'source'>,
    exportTemplateMode?: ProjectDetails['exportTemplateMode'],
): Promise<void> {
    if (
        exportTemplateMode === 'separate' ||
        separateDirectories.has(templateDirectoryKey(editorDirectory))
    )
        return;

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
