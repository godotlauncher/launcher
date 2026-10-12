import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import {
    isTemplateIdentity,
    readTemplateTree,
    templateConnectionStatus,
    templateLstat,
} from './template-files.util.js';
import type {
    TemplateMigrationSource,
    TemplateMigrationSourceProgress,
} from './template-migration.types.js';
import { projectOfficialTemplateRoot } from './template-paths.util.js';
import {
    managedTemplateVersionTarget,
    templateVersionCollection,
} from './template-version-layout.util.js';
import { readTemplateVersionLayout } from './template-version-migration.store.js';

/** Reads local file metadata without opening template contents or changing settings.
 * @param project - Registered official project and its recorded editor environment.
 * @param sharedRoot - Current configured shared location.
 * @param report - Optional progress for the current read-only preparation.
 */
export async function readTemplateMigrationSource(
    project: ProjectDetails,
    sharedRoot: string,
    report?: (progress: TemplateMigrationSourceProgress) => void,
): Promise<TemplateMigrationSource> {
    report?.({
        phase: 'listing',
        projectName: project.name,
        completedBytes: 0,
        totalBytes: 0,
    });
    if (
        project.release.source === 'custom' ||
        !project.launch_path ||
        !(
            await templateLstat(path.join(project.path, 'project.godot'))
        )?.isFile() ||
        !(await templateLstat(path.dirname(project.launch_path)))?.isDirectory()
    )
        throw new Error('exportTemplates:errors.connection');
    const localRoot = projectOfficialTemplateRoot(
        path.dirname(project.launch_path),
    );
    if ((await templateConnectionStatus(localRoot, sharedRoot)) !== 'local')
        throw new Error('exportTemplates:errors.connection');
    const localRealPath = await fs.promises.realpath(localRoot);
    const layout = await readTemplateVersionLayout(
        path.dirname(project.launch_path),
    );
    if (
        layout &&
        templateVersionCollection(
            path.dirname(project.launch_path),
            layout.root,
        ) !== localRoot
    )
        throw new Error('exportTemplates:errors.connection');
    /** Lists version folders and owned links without inspecting unrelated root contents. */
    async function discoverVersions() {
        const entries: string[] = [];
        const managedLinks: Record<string, string> = {};
        for (const id of (await fs.promises.readdir(localRoot)).sort()) {
            if (!isTemplateIdentity(id)) continue;
            const stat = await templateLstat(path.join(localRoot, id));
            if (stat?.isSymbolicLink() && layout?.managed[id]) {
                const target = await managedTemplateVersionTarget(
                    path.join(localRoot, id),
                    sharedRoot,
                );
                if (!target)
                    throw new Error('exportTemplates:errors.connection');
                managedLinks[id] = target;
            } else if (stat?.isFile()) {
                continue;
            } else if (!stat?.isDirectory() || stat.isSymbolicLink()) {
                throw new Error('exportTemplates:errors.unsafe');
            }
            entries.push(id);
        }
        return { entries, managedLinks };
    }
    const { entries, managedLinks } = await discoverVersions();
    const excluded = new Set(Object.keys(managedLinks));
    const includedRoots = new Set(entries.filter((id) => !excluded.has(id)));
    const files = await readTemplateTree(
        localRoot,
        false,
        undefined,
        true,
        excluded,
        { includedRoots },
    );
    report?.({
        phase: 'checking',
        projectName: project.name,
        completedBytes: 0,
        totalBytes: 0,
    });
    const current = await discoverVersions();
    if (
        JSON.stringify({ entries, managedLinks }) !== JSON.stringify(current) ||
        (await fs.promises.realpath(localRoot)) !== localRealPath ||
        (await templateConnectionStatus(localRoot, sharedRoot)) !== 'local'
    )
        throw new Error('exportTemplates:errors.changed');
    return {
        projectPath: project.path,
        name: project.name,
        launchPath: project.launch_path,
        setId: `${project.release.version.replace('-', '.')}${project.release.mono ? '.mono' : ''}`,
        mode: project.exportTemplateMode,
        buildSelections: { ...project.exportTemplateBuilds },
        localRoot,
        localRealPath,
        sharedRoot: (await templateLstat(sharedRoot))
            ? await fs.promises.realpath(sharedRoot)
            : path.resolve(sharedRoot),
        entries,
        ...(Object.keys(managedLinks).length ? { managedLinks } : {}),
        files,
    };
}
