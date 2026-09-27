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
import {
    isSharedTemplateLink,
    isTemplateIdentity,
    templateLstat,
} from './template-files.util.js';
import {
    projectOfficialTemplateRoot,
    projectTemplateStorage,
} from './template-paths.util.js';

/** Connects Official through its parent folder, or one import through a local version link.
 * @param editorDirectory - Project-owned editor environment.
 * @param sharedRoot - Godot's existing template download folder.
 * @param library - Current imported registry.
 * @param selections - Saved choices for each editor version and flavour.
 * @param currentSetId - Current editor's template identity.
 */
export async function projectTemplateBuilds(
    editorDirectory: string,
    sharedRoot: string,
    library: ImportedTemplateLibrary,
    selections: ProjectDetails['exportTemplateBuilds'] = {},
    currentSetId?: string,
): Promise<void> {
    if (currentSetId && !isTemplateIdentity(currentSetId))
        throw new Error('exportTemplates:errors.identity');
    // Choices for other editors are remembered, but only the current editor is connected.
    const build = currentSetId
        ? resolveImportedTemplate(
              library,
              currentSetId,
              selections[currentSetId],
          )
        : undefined;
    const canonicalTarget = build ? importedTemplateFiles(build) : sharedRoot;
    if (build && !(await templateLstat(canonicalTarget))?.isDirectory())
        throw new Error('exportTemplates:library.missing');
    const target = build
        ? await fs.promises.realpath(canonicalTarget)
        : sharedRoot;
    const importedRoots = await managedImportedRoots();
    const active = path.join(
        editorDirectory,
        'editor_data',
        'export_templates',
    );
    const data = await templateLstat(path.dirname(active));
    if (data && (!data.isDirectory() || data.isSymbolicLink()))
        throw new Error('exportTemplates:errors.unsafe');
    const storage = projectTemplateStorage(editorDirectory);
    const owner = await templateLstat(storage);
    if (owner && (!owner.isDirectory() || owner.isSymbolicLink()))
        throw new Error('exportTemplates:errors.unsafe');
    const official = projectOfficialTemplateRoot(editorDirectory);
    // Old local collections must go through the existing migration, never an implicit deletion.
    if (
        official !== active &&
        !(await isSharedTemplateLink(official, sharedRoot))
    )
        throw new Error('exportTemplates:library.unmanaged');
    const previous = path.join(
        path.dirname(active),
        '.export_templates.launcher-previous',
    );
    const next = path.join(
        path.dirname(active),
        '.export_templates.launcher-next',
    );
    if (!(await templateLstat(active)) && (await templateLstat(previous))) {
        await assertManagedView(previous, sharedRoot, importedRoots);
        await fs.promises.rename(previous, active);
    }
    await assertManagedView(active, sharedRoot, importedRoots);
    await assertManagedView(previous, sharedRoot, importedRoots);
    await assertManagedView(next, sharedRoot, importedRoots);
    const existing = await templateLstat(active);
    if (
        !build &&
        existing &&
        (await isSharedTemplateLink(active, sharedRoot))
    ) {
        await fs.promises.mkdir(sharedRoot, { recursive: true });
        await removeManagedView(previous);
        await removeManagedView(next);
        return;
    }
    if (build && existing?.isDirectory() && !existing.isSymbolicLink()) {
        const names = await fs.promises.readdir(active);
        if (
            names.length === 1 &&
            names[0] === currentSetId &&
            (await linkTarget(path.join(active, names[0]))) ===
                path.resolve(target)
        ) {
            await removeManagedView(previous);
            await removeManagedView(next);
            return;
        }
    }
    await fs.promises.mkdir(path.dirname(active), { recursive: true });
    await fs.promises.mkdir(sharedRoot, { recursive: true });
    // Retain the existing backing-root marker for migration/recovery and official inventory.
    await fs.promises.mkdir(storage, { recursive: true });
    const backing = path.join(storage, 'official');
    if (!(await templateLstat(backing))) await createLink(sharedRoot, backing);
    await removeManagedView(next);
    if (build) {
        await fs.promises.mkdir(next);
        await createLink(target, path.join(next, build.setId));
    } else await createLink(sharedRoot, next);
    await removeManagedView(previous);
    if (existing) await fs.promises.rename(active, previous);
    try {
        await fs.promises.rename(next, active);
    } catch (error) {
        if (existing) await fs.promises.rename(previous, active);
        throw error;
    }
    await removeManagedView(previous);
}

/** Reads a link target without following its contents.
 * @param filename - Link to inspect.
 */
async function linkTarget(filename: string): Promise<string | undefined> {
    if (!(await templateLstat(filename))?.isSymbolicLink()) return undefined;
    return path.resolve(
        path.dirname(filename),
        await fs.promises.readlink(filename),
    );
}

/** Refuses ordinary files and foreign links before replacing a managed view.
 * @param directory - Active or temporary template view.
 * @param sharedRoot - Expected Official root.
 * @param importedRoots - Known locations of imported builds.
 */
async function assertManagedView(
    directory: string,
    sharedRoot: string,
    importedRoots: string[],
): Promise<void> {
    const stat = await templateLstat(directory);
    if (!stat) return;
    if (stat.isSymbolicLink()) {
        if (await isSharedTemplateLink(directory, sharedRoot)) return;
        throw new Error('exportTemplates:errors.connection');
    }
    if (!stat.isDirectory())
        throw new Error('exportTemplates:library.unmanaged');
    for (const name of await fs.promises.readdir(directory)) {
        const target = await linkTarget(path.join(directory, name));
        if (
            !isTemplateIdentity(name) ||
            !target ||
            !isManagedImportedTarget(target, importedRoots)
        )
            throw new Error('exportTemplates:library.unmanaged');
    }
}

/** Checks whether a link points inside one of Launcher's imported-template roots.
 * @param target - Resolved link destination.
 * @param roots - Canonical and physical imported-template roots.
 */
function isManagedImportedTarget(target: string, roots: string[]): boolean {
    return roots.some((root) => {
        const relative = path.relative(path.join(root, 'imported'), target);
        return (
            !!relative &&
            !path.isAbsolute(relative) &&
            relative !== '..' &&
            !relative.startsWith(`..${path.sep}`)
        );
    });
}

/** Recognises both older canonical links and the current physical imported root. */
async function managedImportedRoots(): Promise<string[]> {
    const canonical = path.resolve(importedTemplateRoot());
    const stat = await templateLstat(canonical);
    if (!stat) return [canonical];
    const roots = [canonical];
    if (stat.isSymbolicLink())
        roots.push(
            path.resolve(
                path.dirname(canonical),
                await fs.promises.readlink(canonical),
            ),
        );
    try {
        roots.push(await fs.promises.realpath(canonical));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return [...new Set(roots)];
}

/** Removes a prevalidated view without ever traversing template contents.
 * @param directory - Managed link or folder containing only managed links.
 */
async function removeManagedView(directory: string): Promise<void> {
    const stat = await templateLstat(directory);
    if (!stat) return;
    if (stat.isSymbolicLink()) await fs.promises.unlink(directory);
    else {
        for (const name of await fs.promises.readdir(directory)) {
            const filename = path.join(directory, name);
            if (!(await templateLstat(filename))?.isSymbolicLink())
                throw new Error('exportTemplates:library.unmanaged');
            await fs.promises.unlink(filename);
        }
        await fs.promises.rmdir(directory);
    }
}

/** Creates an absolute directory link or Windows junction.
 * @param target - Existing template contents.
 * @param link - Project-owned link path.
 */
async function createLink(target: string, link: string): Promise<void> {
    await fs.promises.symlink(
        path.resolve(target),
        link,
        process.platform === 'win32' ? 'junction' : 'dir',
    );
}

/** Disconnects managed imports when switching to a custom editor, preserving foreign links and real files.
 * @param editorDirectory - Project editor environment.
 */
export async function disconnectImportedTemplateView(
    editorDirectory: string,
): Promise<void> {
    const active = path.join(
        editorDirectory,
        'editor_data',
        'export_templates',
    );
    if (projectOfficialTemplateRoot(editorDirectory) === active) return;
    const stat = await templateLstat(active);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return;
    const importedRoots = await managedImportedRoots();
    for (const id of (await fs.promises.readdir(active)).filter(
        isTemplateIdentity,
    )) {
        const filename = path.join(active, id);
        const target = await linkTarget(filename);
        if (target && isManagedImportedTarget(target, importedRoots))
            await fs.promises.unlink(filename);
    }
}
