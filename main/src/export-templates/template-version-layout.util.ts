import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import type {
    ImportedTemplateLibrary,
    ProjectDetails,
} from '@shared/contracts';
import {
    importedTemplateFiles,
    importedTemplateRoot,
    resolveImportedTemplate,
} from './imported-templates.store.js';
import { isTemplateIdentity, templateLstat } from './template-files.util.js';
import { projectTemplateStorage } from './template-paths.util.js';
import type { TemplateVersionLayout } from './template-version-migration.schema.js';
import { writeTemplateVersionLayout } from './template-version-migration.store.js';

/** Resolves the real collection recorded by a per-version migration.
 * @param editor - Project-owned editor directory.
 * @param root - Existing active collection or older official backing collection.
 */
export function templateVersionCollection(
    editor: string,
    root: TemplateVersionLayout['root'],
): string {
    return root === 'active'
        ? path.join(editor, 'editor_data', 'export_templates')
        : path.join(projectTemplateStorage(editor), 'official');
}
/** Checks every project-owned parent before a version mutation or reconnection.
 * @param editor - Project-owned editor directory.
 * @param root - Real collection to preserve.
 */
export async function assertTemplateVersionParents(
    editor: string,
    root: string,
): Promise<void> {
    for (const filename of [
        editor,
        path.join(editor, 'editor_data'),
        projectTemplateStorage(editor),
        root,
    ]) {
        const stat = await templateLstat(filename);
        if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
            throw new Error('exportTemplates:errors.unsafe');
    }
}
/** Reads an owned version link without traversing the destination's files.
 * @param filename - Version link explicitly recorded in the project ownership record.
 * @param sharedRoot - Current conventional shared template root.
 */
export async function managedTemplateVersionTarget(
    filename: string,
    sharedRoot: string,
): Promise<string | undefined> {
    const stat = await templateLstat(filename);
    if (!stat?.isSymbolicLink()) return undefined;
    const setId = path.basename(filename);
    if (!isTemplateIdentity(setId)) return undefined;
    const target = path.resolve(
        path.dirname(filename),
        await fs.promises.readlink(filename),
    );
    const sharedRoots = [path.resolve(sharedRoot)];
    if (await templateLstat(sharedRoot))
        sharedRoots.push(await fs.promises.realpath(sharedRoot));
    if (sharedRoots.some((root) => target === path.join(root, setId)))
        return target;
    const importedRoots = [path.resolve(importedTemplateRoot())];
    if (await templateLstat(importedTemplateRoot()))
        importedRoots.push(await fs.promises.realpath(importedTemplateRoot()));
    for (const root of importedRoots) {
        const relative = path.relative(
            path.join(root, 'imported', setId),
            target,
        );
        if (
            relative &&
            !path.isAbsolute(relative) &&
            relative !== '..' &&
            !relative.startsWith(`..${path.sep}`)
        )
            return target;
    }
    return undefined;
}
/** Restores version links while preserving all local folders left for a later decision.
 * @param editor - Project-owned editor directory.
 * @param sharedRoot - Current shared collection.
 * @param library - Current imported builds.
 * @param selections - Saved per-version project choices.
 * @param layout - Explicit ownership of migrated version links.
 * @param currentSetId - Current editor version, including a version first used after migration.
 */
export async function synchroniseTemplateVersionLayout(
    editor: string,
    sharedRoot: string,
    library: ImportedTemplateLibrary,
    selections: ProjectDetails['exportTemplateBuilds'],
    layout: TemplateVersionLayout,
    currentSetId?: string,
): Promise<void> {
    const root = templateVersionCollection(editor, layout.root);
    await assertTemplateVersionParents(editor, root);
    const existing = await templateLstat(root);
    if (!existing) throw new Error('exportTemplates:errors.connection');
    for (const name of await fs.promises.readdir(root)) {
        if (!isTemplateIdentity(name)) continue;
        const filename = path.join(root, name);
        if (
            (await templateLstat(filename))?.isSymbolicLink() &&
            (!Object.hasOwn(layout.managed, name) ||
                !(await managedTemplateVersionTarget(filename, sharedRoot)))
        )
            throw new Error('exportTemplates:errors.connection');
    }
    const connections: {
        filename: string;
        target: string;
        current?: fs.Stats;
        build: boolean;
    }[] = [];
    const managed = { ...layout.managed };
    const requested = new Set([
        ...Object.keys(managed),
        ...Object.keys(selections ?? {}),
        ...(currentSetId ? [currentSetId] : []),
    ]);
    for (const setId of requested) {
        if (!isTemplateIdentity(setId))
            throw new Error('exportTemplates:errors.identity');
        const filename = path.join(root, setId);
        const current = await templateLstat(filename);
        // A real local folder still needs an explicit migration decision.
        if (!Object.hasOwn(managed, setId) && current) continue;
        if (current && !current.isSymbolicLink())
            throw new Error('exportTemplates:library.unmanaged');
        const build = resolveImportedTemplate(
            library,
            setId,
            selections?.[setId],
        );
        const target = build
            ? importedTemplateFiles(build)
            : path.join(sharedRoot, setId);
        const destination = await templateLstat(target);
        if (build && !destination?.isDirectory())
            throw new Error('exportTemplates:library.missing');
        if (
            destination &&
            (!destination.isDirectory() || destination.isSymbolicLink())
        )
            throw new Error('exportTemplates:errors.unsafe');
        connections.push({ filename, target, current, build: !!build });
        if (!Object.hasOwn(managed, setId)) managed[setId] = randomUUID();
    }
    // Persist ownership first so startup can safely finish a failed link creation.
    if (JSON.stringify(managed) !== JSON.stringify(layout.managed))
        await writeTemplateVersionLayout(editor, { ...layout, managed });
    for (const { filename, target, current, build } of connections) {
        if (!build) await fs.promises.mkdir(target, { recursive: true });
        const wanted = path.resolve(target);
        if (
            current &&
            (await managedTemplateVersionTarget(filename, sharedRoot)) ===
                wanted
        )
            continue;
        if (current) await fs.promises.unlink(filename);
        await fs.promises.symlink(
            wanted,
            filename,
            process.platform === 'win32' ? 'junction' : 'dir',
        );
    }
}
