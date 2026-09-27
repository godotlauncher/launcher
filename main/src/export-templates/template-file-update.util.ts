import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { templateChild, templateLstat } from './template-files.util.js';

/** Resolves a file below a real collection without following redirected directories.
 * @param root - Trusted collection root.
 * @param relative - Validated relative export template path.
 * @param create - Whether missing parent directories should be created.
 */
async function fileTarget(
    root: string,
    relative: string,
    create: boolean,
): Promise<string> {
    const target = templateChild(root, relative);
    const parents = path
        .relative(root, path.dirname(target))
        .split(path.sep)
        .filter(Boolean);
    let current = root;
    for (const part of ['', ...parents]) {
        if (part) current = path.join(current, part);
        if (create) await fs.promises.mkdir(current, { recursive: true });
        const stat = await templateLstat(current);
        if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
            throw new Error('exportTemplates:errors.unsafe');
    }
    return target;
}

/** Changes only selected files; completed additions and removals remain applied on failure.
 * @param root - Installed version directory.
 * @param source - Completed, archive-verified downloads.
 * @param added - Missing files to publish without overwriting existing files.
 * @param removed - Explicitly deselected files to delete.
 * @param copySource - Keep project originals independent until switching succeeds.
 */
export async function updateTemplateFiles(
    root: string,
    source: string,
    added: string[],
    removed: string[],
    copySource = false,
): Promise<void> {
    for (const relative of added) {
        const target = await fileTarget(root, relative, true);
        if (await templateLstat(target)) continue;
        const incoming = await fileTarget(source, relative, false);
        const stat = await fs.promises.lstat(incoming);
        if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error('exportTemplates:errors.unsafe');
        try {
            // Publishing by link is atomic and cannot overwrite an existing file.
            if (copySource) {
                const temporary = `${target}.launcher-${randomUUID()}`;
                try {
                    await fs.promises.copyFile(
                        incoming,
                        temporary,
                        fs.constants.COPYFILE_EXCL,
                    );
                    await fs.promises.chmod(temporary, stat.mode & 0o777);
                    await fs.promises.link(temporary, target);
                } finally {
                    await fs.promises.rm(temporary, { force: true });
                }
            } else await fs.promises.link(incoming, target);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'EEXIST') continue;
            if (!['EXDEV', 'ENOTSUP', 'EPERM'].includes(code ?? ''))
                throw error;
            const temporary = `${target}.launcher-${randomUUID()}`;
            try {
                await fs.promises.copyFile(
                    incoming,
                    temporary,
                    fs.constants.COPYFILE_EXCL,
                );
                await fs.promises.chmod(temporary, stat.mode & 0o777);
                if (await templateLstat(target)) continue;
                await fs.promises.rename(temporary, target);
            } finally {
                await fs.promises.rm(temporary, { force: true });
            }
        }
    }
    for (const relative of removed) {
        const target = await fileTarget(root, relative, false);
        const stat = await templateLstat(target);
        if (!stat) continue;
        if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error('exportTemplates:errors.unsafe');
        await fs.promises.unlink(target);
    }
}

/** Removes empty directories only; a concurrently added file keeps its folder intact.
 * @param root - Version folder after explicit removals.
 */
export async function pruneEmptyTemplateDirectories(
    root: string,
): Promise<void> {
    const stat = await templateLstat(root);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) return;
    for (const entry of await fs.promises.readdir(root, {
        withFileTypes: true,
    })) {
        if (entry.isDirectory() && !entry.isSymbolicLink())
            await pruneEmptyTemplateDirectories(path.join(root, entry.name));
    }
    try {
        await fs.promises.rmdir(root);
    } catch (error) {
        if (
            !['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(
                (error as NodeJS.ErrnoException).code ?? '',
            )
        )
            throw error;
    }
}
