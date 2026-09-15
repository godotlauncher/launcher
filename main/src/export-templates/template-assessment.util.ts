import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    ProjectDetails,
    TemplateMigrationFile,
    TemplateProjectAssessment,
} from '@shared/contracts';
import {
    isTemplateIdentity,
    readTemplateTree,
    templateChild,
    templateConnectionStatus,
    templateLstat,
} from './template-files.util.js';

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
 * @param compare - Whether to hash the selected project's files for an advisory comparison.
 */
export async function assessProjectTemplates(
    project: ProjectDetails,
    root: string,
    compare = false,
): Promise<TemplateProjectAssessment> {
    const result: TemplateProjectAssessment = {
        projectPath: project.path,
        name: project.name,
        mode: project.exportTemplateMode,
        state: 'unavailable',
        reason: 'unreadable',
        pending:
            project.exportTemplateMode !== 'separate' &&
            project.release.source !== 'custom',
        compared: false,
        provenance: 'unverified',
        setIds: [],
        metadata: [],
        unexpected: [],
    };
    try {
        const local = project.launch_path
            ? path.join(
                  path.dirname(project.launch_path),
                  'editor_data',
                  'export_templates',
              )
            : undefined;
        const connection = local
            ? await templateConnectionStatus(local, root)
            : undefined;
        result.connection = connection;
        if (project.exportTemplateMode === 'separate') {
            if (connection === 'error') return result;
            result.state = connection === 'shared' ? 'blocked' : 'separate';
            result.reason =
                connection === 'shared'
                    ? 'preference-mismatch'
                    : 'kept-separate';
            return result;
        }
        if (project.release.source === 'custom') {
            result.state = 'blocked';
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
            const incoming = await readTemplateTree(
                templateChild(local, id),
                true,
            );
            const shared = await readTemplateTree(
                templateChild(sharedRoot, id),
                true,
            );
            const localByName = new Map(
                incoming.map((file) => [file.relative, file]),
            );
            const sharedByName = new Map(
                shared.map((file) => [file.relative, file]),
            );
            for (const name of [
                ...new Set([...localByName.keys(), ...sharedByName.keys()]),
            ].sort()) {
                const left = localByName.get(name);
                const right = sharedByName.get(name);
                files.push({
                    path: `${id}/${name}`,
                    state: !left
                        ? 'shared-only'
                        : !right
                          ? 'local-only'
                          : left.size === right.size &&
                              left.hash === right.hash &&
                              left.mode === right.mode
                            ? 'identical'
                            : 'different',
                    localBytes: left?.size,
                    sharedBytes: right?.size,
                });
            }
        }
        result.compared = true;
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
        result.state = 'unavailable';
        result.reason = 'unreadable';
        result.compared = false;
        delete result.files;
    }
    return result;
}
