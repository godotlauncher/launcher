import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import type { TemplateMigrationFile } from '@shared/contracts';
import { readTemplateTree, templateChild } from './template-files.util.js';

const hashes = new Map<string, { stamp: string; hash: string }>();

/** Reads a hash for advisory display only; mutation checks always read fresh contents.
 * @param filename - File beneath a validated template tree.
 * @param signal - Cancels an obsolete inspection.
 */
async function advisoryHash(
    filename: string,
    signal?: AbortSignal,
): Promise<string> {
    signal?.throwIfAborted();
    const before = await fs.promises.lstat(filename);
    if (!before.isFile() || before.isSymbolicLink())
        throw new Error('exportTemplates:errors.unsafe');
    const stamp = [
        before.dev,
        before.ino,
        before.size,
        before.mtimeMs,
        before.ctimeMs,
        before.mode,
    ].join(':');
    const cached = hashes.get(filename);
    if (cached?.stamp === stamp) return cached.hash;
    const digest = createHash('sha256');
    for await (const chunk of fs.createReadStream(filename, { signal }))
        digest.update(chunk);
    const after = await fs.promises.lstat(filename);
    if (
        stamp !==
        [
            after.dev,
            after.ino,
            after.size,
            after.mtimeMs,
            after.ctimeMs,
            after.mode,
        ].join(':')
    )
        throw new Error('exportTemplates:errors.changed');
    const hash = digest.digest('hex');
    if (hashes.size >= 2048) hashes.clear();
    hashes.set(filename, { stamp, hash });
    return hash;
}

/** Lists files promptly and hashes only pairs whose metadata could match.
 * @param local - Project template set.
 * @param shared - Shared template set.
 * @param contents - Whether to resolve matching candidates by content.
 * @param signal - Cancels an obsolete inspection.
 */
export async function compareTemplateTrees(
    local: string,
    shared: string,
    contents: boolean,
    signal?: AbortSignal,
): Promise<TemplateMigrationFile[]> {
    const left = new Map(
        (await readTemplateTree(local, false, signal)).map((file) => [
            file.relative,
            file,
        ]),
    );
    const right = new Map(
        (await readTemplateTree(shared, false, signal)).map((file) => [
            file.relative,
            file,
        ]),
    );
    const result: TemplateMigrationFile[] = [];
    for (const name of [...new Set([...left.keys(), ...right.keys()])].sort()) {
        signal?.throwIfAborted();
        const a = left.get(name);
        const b = right.get(name);
        let state: TemplateMigrationFile['state'] = !a
            ? 'shared-only'
            : !b
              ? 'local-only'
              : a.size !== b.size || a.mode !== b.mode
                ? 'different'
                : 'checking';
        if (state === 'checking' && contents) {
            state =
                (await advisoryHash(templateChild(local, name), signal)) ===
                (await advisoryHash(templateChild(shared, name), signal))
                    ? 'identical'
                    : 'different';
        }
        result.push({
            path: name,
            state,
            localBytes: a?.size,
            sharedBytes: b?.size,
        });
    }
    return result;
}
