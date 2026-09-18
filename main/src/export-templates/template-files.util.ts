import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { InstalledRelease, TemplateConnection } from '@shared/contracts';
import { isPortablePathSegment as safeTemplateSegment } from '../utils/portable-path.util.js';

export { isPortablePathSegment as safeTemplateSegment } from '../utils/portable-path.util.js';

export type TemplateFile = {
    relative: string;
    size: number;
    hash: string;
    mode: number;
    metadata?: { mtimeMs: number; ctimeMs: number; ino: number; dev: number };
};
let mutationActive = false;
let templateConnectionsActive = 0;

/** Reports whether a shared-template commit is in progress. */
export function areTemplatesMutating(): boolean {
    return mutationActive;
}
/** Reserves shared-template writes.
 * @param active - Whether a transaction is running.
 */
export function setTemplatesMutating(active: boolean): void {
    mutationActive = active;
}

/** Reports whether an automatic project template connection is in progress. */
export function areTemplateConnectionsActive(): boolean {
    return templateConnectionsActive > 0;
}

/** Resolves Godot's per-user template root.
 * @param platform - Host operating system.
 * @param home - User home directory.
 * @param env - Host environment variables.
 */
export function resolveTemplateRoot(
    platform = process.platform,
    home = os.homedir(),
    env = process.env,
): string {
    if (platform === 'win32') {
        if (!env.APPDATA || !path.win32.isAbsolute(env.APPDATA))
            throw new Error('exportTemplates:errors.location');
        return path.win32.join(env.APPDATA, 'Godot', 'export_templates');
    }
    if (platform === 'darwin')
        return path.posix.join(
            home,
            'Library',
            'Application Support',
            'Godot',
            'export_templates',
        );
    if (platform === 'linux')
        return path.posix.join(
            env.XDG_DATA_HOME && path.posix.isAbsolute(env.XDG_DATA_HOME)
                ? env.XDG_DATA_HOME
                : path.posix.join(home, '.local', 'share'),
            'godot',
            'export_templates',
        );
    throw new Error('exportTemplates:errors.location');
}
/** Checks the version identity Godot writes into its template packages.
 * @param value - Package identity.
 */
export function isTemplateIdentity(value: string): boolean {
    return (
        safeTemplateSegment(value) &&
        /^\d+\.\d+(?:\.\d+)?\.[a-zA-Z][\w.-]*$/.test(value)
    );
}
/** Resolves one child path without permitting traversal.
 * @param root - Trusted root.
 * @param relative - Portable relative path.
 */
export function templateChild(root: string, relative: string): string {
    if (!relative.split('/').every(safeTemplateSegment))
        throw new Error('exportTemplates:errors.unsafe');
    return path.join(root, ...relative.split('/'));
}
/** Gets metadata without following a final link.
 * @param filename - File to inspect.
 */
export async function templateLstat(
    filename: string,
): Promise<fs.Stats | undefined> {
    try {
        return await fs.promises.lstat(filename);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return undefined;
        throw error;
    }
}
/** Reads a tree, refusing links and special files.
 * @param root - Directory to read.
 * @param hashFiles - Whether file contents are needed for a mutation review.
 * @param captureMetadata - Include cheap change-detection metadata for file selection.
 * @param signal - Optional cancellation signal.
 */
export async function readTemplateTree(
    root: string,
    hashFiles = false,
    signal?: AbortSignal,
    captureMetadata = false,
): Promise<TemplateFile[]> {
    const files: TemplateFile[] = [];
    const rootStat = await templateLstat(root);
    if (!rootStat) return files;
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
        throw new Error('exportTemplates:errors.unsafe');
    /** Adds regular files below one contained directory.
     * @param relative - Directory relative to the inspected root.
     */
    async function walk(relative: string): Promise<void> {
        const directory = relative ? templateChild(root, relative) : root;
        for (const name of (await fs.promises.readdir(directory)).sort()) {
            signal?.throwIfAborted();
            const child = relative ? `${relative}/${name}` : name;
            const filename = templateChild(root, child);
            const stat = await fs.promises.lstat(filename);
            if (stat.isSymbolicLink())
                throw new Error('exportTemplates:errors.unsafe');
            if (stat.isDirectory()) {
                await walk(child);
                continue;
            }
            if (!stat.isFile())
                throw new Error('exportTemplates:errors.unsafe');
            const hash = hashFiles ? createHash('sha256') : undefined;
            if (hash) {
                const stream = fs.createReadStream(filename, { signal });
                for await (const chunk of stream) hash.update(chunk);
                const after = await fs.promises.lstat(filename);
                if (
                    after.size !== stat.size ||
                    after.mtimeMs !== stat.mtimeMs ||
                    after.ino !== stat.ino ||
                    after.mode !== stat.mode
                )
                    throw new Error('exportTemplates:errors.changed');
            }
            files.push({
                relative: child,
                size: stat.size,
                hash: hash?.digest('hex') ?? '',
                mode: stat.mode & 0o777,
                ...(captureMetadata
                    ? {
                          metadata: {
                              mtimeMs: stat.mtimeMs,
                              ctimeMs: stat.ctimeMs,
                              ino: stat.ino,
                              dev: stat.dev,
                          },
                      }
                    : {}),
            });
        }
    }
    await walk('');
    return files;
}
/** Fingerprints a sorted file manifest.
 * @param files - Hashed files to identify.
 * @param version - Journal format; version 1 excludes permissions for older recovery records.
 */
export function templateFingerprint(
    files: TemplateFile[],
    version: 1 | 2 = 2,
): string {
    return createHash('sha256')
        .update(
            JSON.stringify(
                [...files]
                    .sort((a, b) =>
                        a.relative < b.relative
                            ? -1
                            : a.relative > b.relative
                              ? 1
                              : 0,
                    )
                    .map(({ relative, size, hash, mode }) =>
                        version === 1
                            ? [relative, size, hash]
                            : [relative, size, hash, mode],
                    ),
            ),
        )
        .digest('hex');
}
/** Verifies enough free bytes for a staged operation.
 * @param directory - Existing staging parent.
 * @param bytes - Required bytes, excluding a small safety margin.
 */
export async function checkTemplateCapacity(
    directory: string,
    bytes: number,
): Promise<void> {
    const stat = await fs.promises.statfs(directory);
    if (stat.bavail * stat.bsize < bytes + 16 * 1024 * 1024)
        throw new Error('exportTemplates:errors.space');
}
/** Determines whether a link resolves to the shared root.
 * @param local - Project template link.
 * @param root - Expected shared root.
 */
export async function isSharedTemplateLink(
    local: string,
    root: string,
): Promise<boolean> {
    const stat = await templateLstat(local);
    if (!stat?.isSymbolicLink()) return false;
    const target = path.resolve(
        path.dirname(local),
        await fs.promises.readlink(local),
    );
    return process.platform === 'win32'
        ? target.toLowerCase() === path.resolve(root).toLowerCase()
        : target === path.resolve(root);
}
/** Reads the connection without changing user files.
 * @param local - Project template path.
 * @param root - Shared template root.
 */
export async function templateConnectionStatus(
    local: string,
    root: string,
): Promise<TemplateConnection['status']> {
    try {
        const parent = await templateLstat(path.dirname(local));
        if (parent && (!parent.isDirectory() || parent.isSymbolicLink()))
            return 'foreign';
        const stat = await templateLstat(local);
        if (!stat) return 'missing';
        if (stat.isSymbolicLink())
            return (await isSharedTemplateLink(local, root))
                ? 'shared'
                : 'foreign';
        return stat.isDirectory() ? 'local' : 'foreign';
    } catch {
        return 'error';
    }
}
/** Creates a link only when no local templates can be overwritten.
 * @param editorDirectory - Directory containing the per-project editor.
 * @param release - Selected editor; custom builds retain their existing setup.
 * @param root - Shared root, injectable for isolated tests.
 */
export async function connectEmptyTemplateFolder(
    editorDirectory: string,
    release: Pick<InstalledRelease, 'source'>,
    root = resolveTemplateRoot(),
): Promise<void> {
    if (release.source === 'custom' || mutationActive) return;
    templateConnectionsActive += 1;
    try {
        const data = path.join(editorDirectory, 'editor_data');
        const local = path.join(data, 'export_templates');
        const parent = await templateLstat(data);
        if (parent && (!parent.isDirectory() || parent.isSymbolicLink()))
            return;
        if (await isSharedTemplateLink(local, root)) {
            await fs.promises.mkdir(root, { recursive: true });
            return;
        }
        const stat = await templateLstat(local);
        if (
            stat &&
            (!stat.isDirectory() ||
                stat.isSymbolicLink() ||
                (await fs.promises.readdir(local)).length)
        )
            return;
        await fs.promises.mkdir(root, { recursive: true });
        await fs.promises.mkdir(data, { recursive: true });
        if (stat) await fs.promises.rmdir(local);
        try {
            await fs.promises.symlink(
                path.resolve(root),
                local,
                process.platform === 'win32' ? 'junction' : 'dir',
            );
        } catch (error) {
            if (stat && !(await templateLstat(local)))
                await fs.promises.mkdir(local);
            throw error;
        }
    } finally {
        templateConnectionsActive -= 1;
    }
}

/** Sums regular files without following links outside the collection.
 * @param root - Collection folder, resolved by the caller when it exists.
 */
export async function sumTemplateFiles(
    root: string,
): Promise<{ bytes: number; incomplete: boolean }> {
    let bytes = 0;
    let incomplete = false;
    /** Visits one filesystem entry without treating metadata as a template.
     * @param filename - Entry contained in the collection.
     */
    const visit = async (filename: string): Promise<void> => {
        try {
            const stat = await fs.promises.lstat(filename);
            if (stat.isSymbolicLink()) return;
            if (stat.isFile()) bytes += stat.size;
            else if (stat.isDirectory())
                for (const name of await fs.promises.readdir(filename))
                    await visit(path.join(filename, name));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                incomplete = true;
        }
    };
    await visit(root);
    return { bytes, incomplete };
}
