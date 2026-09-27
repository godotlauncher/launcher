import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    ProjectDetails,
    TemplateMigrationFile,
    TemplateProjectAssessment,
} from '@shared/contracts';
import { compareTemplateTrees } from './template-comparison.util.js';
import {
    isTemplateIdentity,
    templateChild,
    templateConnectionStatus,
    templateLstat,
} from './template-files.util.js';
import { projectOfficialTemplateRoot } from './template-paths.util.js';

/** Recognises housekeeping entries without treating arbitrary hidden files as disposable.
 * @param name - One directory entry.
 */
export function isTemplateHousekeeping(name: string): boolean {
    return (
        name.startsWith('._') ||
        [
            '.ds_store',
            'thumbs.db',
            'ehthumbs.db',
            'ehthumbs_vista.db',
            'desktop.ini',
            '__macosx',
            '.trash',
            '.trashes',
            '.spotlight-v100',
            '.fseventsd',
            '$recycle.bin',
            'system volume information',
        ].includes(name.toLowerCase()) ||
        /^\.Trash-\d+$/.test(name)
    );
}

/** Assesses a registered environment without creating folders, links or downloading files.
 * @param project - Canonical stored project.
 * @param root - Shared template root.
 * @param compare - Metadata listing or advisory content comparison for the selected project.
 * @param signal - Cancels an obsolete comparison.
 */
export async function assessProjectTemplates(
    project: ProjectDetails,
    root: string,
    compare: boolean | 'metadata' = false,
    signal?: AbortSignal,
): Promise<TemplateProjectAssessment> {
    const result: TemplateProjectAssessment = {
        projectPath: project.path,
        name: project.name,
        version: project.release.version,
        edition:
            project.release.source === 'custom'
                ? 'custom'
                : project.release.mono
                  ? 'dotnet'
                  : 'standard',
        mode: project.exportTemplateMode,
        state: 'unavailable',
        reason: 'unreadable',
        pending: project.release.source !== 'custom',
        compared: false,
        provenance: 'unverified',
        setIds: [],
        metadata: [],
        unexpected: [],
    };
    try {
        const local = project.launch_path
            ? projectOfficialTemplateRoot(path.dirname(project.launch_path))
            : undefined;
        const connection = local
            ? await templateConnectionStatus(local, root)
            : undefined;
        result.connection = connection;
        if (project.release.source === 'custom') {
            result.state = 'separate';
            result.reason = 'custom-editor';
            return result;
        }
        const projectFile = await templateLstat(
            path.join(project.path, 'project.godot'),
        );
        if (!projectFile?.isFile()) {
            result.reason = 'missing-project';
            return result;
        }
        if (
            !local ||
            !(
                await templateLstat(path.dirname(project.launch_path))
            )?.isDirectory()
        ) {
            result.reason = 'missing-editor';
            return result;
        }
        if (connection === 'shared') {
            result.state = 'shared';
            result.reason = 'connected';
            result.pending = false;
            return result;
        }
        if (connection === 'foreign') {
            result.state = 'blocked';
            result.reason = 'foreign-link';
            result.pending = false;
            return result;
        }
        if (connection === 'error') return result;
        if (connection === 'missing') {
            result.state = 'ready';
            result.reason = 'empty';
            return result;
        }
        const entries = (await fs.promises.readdir(local)).sort();
        for (const name of entries) {
            if (isTemplateHousekeeping(name)) {
                result.metadata.push(name);
                continue;
            }
            if (!isTemplateIdentity(name)) {
                result.unexpected.push(name);
                continue;
            }
            const stat = await templateLstat(templateChild(local, name));
            if (!stat?.isDirectory() || stat.isSymbolicLink()) {
                result.unexpected.push(name);
                continue;
            }
            result.setIds.push(name);
        }
        if (result.unexpected.length) {
            result.state = 'blocked';
            result.reason = 'unexpected-content';
            return result;
        }
        if (!entries.length) {
            result.state = 'ready';
            result.reason = 'empty';
            return result;
        }
        result.state = 'needs-review';
        result.reason = result.metadata.length
            ? 'metadata-present'
            : 'unverified-files';
        if (!compare || !result.setIds.length) return result;
        // A configured root may itself be a link; child links remain prohibited.
        const sharedRoot = (await templateLstat(root))
            ? await fs.promises.realpath(root)
            : root;
        const files: TemplateMigrationFile[] = [];
        for (const id of result.setIds) {
            const comparison = await compareTemplateTrees(
                templateChild(local, id),
                templateChild(sharedRoot, id),
                compare === true,
                signal,
            );
            files.push(
                ...comparison.map((file) => ({
                    ...file,
                    path: `${id}/${file.path}`,
                })),
            );
        }
        result.compared = compare === true;
        result.files = files;
        if (
            !result.metadata.length &&
            files.length &&
            files.every((file) =>
                ['identical', 'shared-only'].includes(file.state),
            )
        ) {
            result.state = 'ready';
            result.reason = 'identical';
        }
    } catch {
        signal?.throwIfAborted();
        result.state = 'unavailable';
        result.reason = 'unreadable';
        result.compared = false;
        delete result.files;
    }
    return result;
}
