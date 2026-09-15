import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
    checkTemplateCapacity,
    isSharedTemplateLink,
    isTemplateIdentity,
    readTemplateTree,
    setTemplatesMutating,
    type TemplateFile,
    templateChild,
    templateConnectionStatus,
    templateFingerprint,
    templateLstat,
} from './template-files.util.js';

export type PreparedTemplateSet = {
    id: string;
    source: string;
    incoming: TemplateFile[];
    before: TemplateFile[];
    existed: boolean;
    removed?: string[];
};
const journalSchema = z.object({
    version: z.literal(2).optional(),
    phase: z.enum(['committing', 'complete']),
    projectPath: z.string().optional(),
    localPath: z.string().refine(isLocalTemplatePath).optional(),
    sourceHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    sets: z.array(
        z.object({
            id: z.string().refine(isTemplateIdentity),
            existed: z.boolean(),
            before: z.string().regex(/^[a-f0-9]{64}$/),
            after: z
                .string()
                .regex(/^[a-f0-9]{64}$/)
                .nullable(),
        }),
    ),
});
export type TemplateJournal = z.infer<typeof journalSchema>;
/** Checks that a saved recovery location names only the project template child.
 * @param value - Absolute project-local template path from a journal.
 */
function isLocalTemplatePath(value: string): boolean {
    return (
        path.isAbsolute(value) &&
        path.resolve(value) === value &&
        path.basename(value) === 'export_templates' &&
        path.basename(path.dirname(value)) === 'editor_data'
    );
}

/** Refuses redirected recovery parents and overlap with the shared collection.
 * @param local - Canonical project-local template child.
 * @param root - Canonical shared collection.
 */
async function validateLocalRecoveryPath(
    local: string,
    root: string,
): Promise<void> {
    const parent = path.dirname(local);
    const relative = path.relative(root, local);
    const reverse = path.relative(local, root);
    /** Checks whether one path is outside the other.
     * @param value - Relative path between the two locations.
     */
    const outside = (value: string) =>
        value === '..' ||
        value.startsWith(`..${path.sep}`) ||
        path.isAbsolute(value);
    if (
        !isLocalTemplatePath(local) ||
        !outside(relative) ||
        !outside(reverse) ||
        (await fs.promises.realpath(parent)) !== parent
    )
        throw new Error('exportTemplates:errors.recovery');
}
/** Reads and validates recovery metadata.
 * @param work - Trusted operation directory.
 */
export async function readTemplateJournal(
    work: string,
): Promise<TemplateJournal> {
    const filename = path.join(work, 'journal.json');
    const stat = await fs.promises.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
        throw new Error('exportTemplates:errors.recovery');
    return journalSchema.parse(
        JSON.parse(await fs.promises.readFile(filename, 'utf8')),
    );
}
/** Persists transaction state before destructive steps.
 * @param work - Operation directory.
 * @param journal - Complete recovery record.
 */
async function writeJournal(
    work: string,
    journal: TemplateJournal,
): Promise<void> {
    const next = path.join(work, 'journal.next');
    const handle = await fs.promises.open(next, 'w');
    try {
        await handle.writeFile(JSON.stringify(journal));
        await handle.sync();
    } finally {
        await handle.close();
    }
    await fs.promises.rename(next, path.join(work, 'journal.json'));
}
/** Builds a combined set without changing either input.
 * @param root - Shared template directory.
 * @param work - Operation directory on the shared volume.
 * @param sets - Reviewed source and destination manifests.
 * @param decisions - Explicit decisions for each differing relative path.
 * @param signal - Optional cancellation before installed files are changed.
 */
export async function stageTemplateSets(
    root: string,
    work: string,
    sets: PreparedTemplateSet[],
    decisions: Record<string, 'shared' | 'incoming'>,
    signal?: AbortSignal,
): Promise<TemplateJournal['sets']> {
    const result: TemplateJournal['sets'] = [];
    for (const set of sets) {
        signal?.throwIfAborted();
        const destination = templateChild(root, set.id);
        if (
            Boolean(await templateLstat(destination)) !== set.existed ||
            templateFingerprint(
                await readTemplateTree(destination, true, signal),
            ) !== templateFingerprint(set.before) ||
            templateFingerprint(
                await readTemplateTree(set.source, true, signal),
            ) !== templateFingerprint(set.incoming)
        )
            throw new Error('exportTemplates:errors.changed');
        const combined = new Map(
            set.before
                .filter((file) => !set.removed?.includes(file.relative))
                .map((file) => [file.relative, { file, base: destination }]),
        );
        for (const file of set.incoming) {
            const existing = combined.get(file.relative);
            if (existing?.file.hash === file.hash) continue;
            if (existing && existing.file.hash !== file.hash) {
                const decision = decisions[`${set.id}/${file.relative}`];
                if (decision !== 'shared' && decision !== 'incoming')
                    throw new Error('exportTemplates:errors.decision');
                if (decision === 'shared') continue;
            }
            combined.set(file.relative, { file, base: set.source });
        }
        const expected = [...combined.values()]
            .map(({ file }) => file)
            .sort((a, b) =>
                a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0,
            );
        const before = templateFingerprint(set.before);
        const after = templateFingerprint(expected);
        if (
            set.removed &&
            !expected.some((file) => file.relative !== 'version.txt')
        ) {
            result.push({
                id: set.id,
                existed: set.existed,
                before,
                after: null,
            });
            continue;
        }
        // Keep unchanged sets in the journal for the final pre-commit check.
        if (set.existed && before === after) {
            result.push({ id: set.id, existed: true, before, after });
            continue;
        }
        await checkTemplateCapacity(
            work,
            expected.reduce((sum, file) => sum + file.size, 0),
        );
        const staged = templateChild(path.join(work, 'new'), set.id);
        await fs.promises.mkdir(staged, { recursive: true });
        for (const { file, base } of combined.values()) {
            signal?.throwIfAborted();
            const target = templateChild(staged, file.relative);
            await fs.promises.mkdir(path.dirname(target), { recursive: true });
            await fs.promises.copyFile(
                templateChild(base, file.relative),
                target,
                fs.constants.COPYFILE_EXCL,
            );
            await fs.promises.chmod(target, file.mode);
        }
        const actual = await readTemplateTree(staged, true, signal);
        if (templateFingerprint(actual) !== templateFingerprint(expected))
            throw new Error('exportTemplates:errors.changed');
        result.push({
            id: set.id,
            existed: set.existed,
            before,
            after,
        });
    }
    return result;
}
/** Applies prepared directory swaps and optionally replaces a local folder with a link.
 * @param root - Shared template directory.
 * @param work - Operation directory on the shared volume.
 * @param journal - Reviewed transaction contents.
 * @param local - Optional project-local template directory.
 * @param linkRoot - Godot's conventional root used as the link destination.
 */
export async function commitTemplateTransaction(
    root: string,
    work: string,
    journal: TemplateJournal,
    local?: string,
    linkRoot = root,
): Promise<void> {
    setTemplatesMutating(true);
    try {
        if (local) {
            local = path.join(
                await fs.promises.realpath(path.dirname(local)),
                path.basename(local),
            );
            await validateLocalRecoveryPath(local, root);
            journal = { ...journal, localPath: local };
        }
        for (const set of journal.sets) {
            const target = templateChild(root, set.id);
            if (
                Boolean(await templateLstat(target)) !== set.existed ||
                templateFingerprint(
                    await readTemplateTree(target, true),
                    journal.version ?? 1,
                ) !== set.before
            )
                throw new Error('exportTemplates:errors.changed');
        }
        if (
            local &&
            ((await templateConnectionStatus(local, linkRoot)) !== 'local' ||
                templateFingerprint(
                    await readTemplateTree(local, true),
                    journal.version ?? 1,
                ) !== journal.sourceHash)
        )
            throw new Error('exportTemplates:errors.changed');
        if (
            local &&
            (await templateLstat(`${local}.launcher-${path.basename(work)}`))
        )
            throw new Error('exportTemplates:errors.changed');
        await fs.promises.mkdir(path.join(work, 'old'), { recursive: true });
        await writeJournal(work, journal);
        for (const set of journal.sets) {
            if (set.existed && set.before === set.after) continue;
            const target = templateChild(root, set.id);
            if (set.existed)
                await fs.promises.rename(
                    target,
                    templateChild(path.join(work, 'old'), set.id),
                );
            if (set.after !== null)
                await fs.promises.rename(
                    templateChild(path.join(work, 'new'), set.id),
                    target,
                );
        }
        if (local) {
            const backup = `${local}.launcher-${path.basename(work)}`;
            if (await templateLstat(backup))
                throw new Error('exportTemplates:errors.changed');
            await fs.promises.rename(local, backup);
            await fs.promises.symlink(
                path.resolve(linkRoot),
                local,
                process.platform === 'win32' ? 'junction' : 'dir',
            );
            if (!(await isSharedTemplateLink(local, linkRoot)))
                throw new Error('exportTemplates:errors.connection');
        }
        await writeJournal(work, { ...journal, phase: 'complete' });
        await recoverTemplateTransaction(root, work, local, linkRoot);
    } catch (error) {
        if (await templateLstat(path.join(work, 'journal.json'))) {
            try {
                await recoverTemplateTransaction(root, work, local, linkRoot);
            } catch {
                throw new Error('exportTemplates:errors.recovery');
            }
        }
        throw error;
    } finally {
        setTemplatesMutating(false);
    }
}
/** Rolls back an interrupted commit, or completes cleanup after a successful commit.
 * @param root - Shared template directory.
 * @param work - Discovered operation directory.
 * @param local - Fallback from the project store for older journals without a saved path.
 * @param linkRoot - Conventional root used by project links.
 */
export async function recoverTemplateTransaction(
    root: string,
    work: string,
    local?: string,
    linkRoot = root,
): Promise<void> {
    const journal = await readTemplateJournal(work);
    if (journal.localPath) {
        await validateLocalRecoveryPath(journal.localPath, root);
        local = journal.localPath;
    }
    if (Boolean(journal.projectPath) !== Boolean(local))
        throw new Error('exportTemplates:errors.recovery');
    const localBackup = local
        ? `${local}.launcher-${path.basename(work)}`
        : undefined;
    if (local && localBackup && (await templateLstat(localBackup))) {
        if (
            templateFingerprint(
                await readTemplateTree(localBackup, true),
                journal.version ?? 1,
            ) !== journal.sourceHash
        )
            throw new Error('exportTemplates:errors.changed');
        const connected = await isSharedTemplateLink(local, linkRoot);
        const detachedEmpty =
            !connected &&
            (await templateConnectionStatus(local, linkRoot)) === 'local' &&
            (await fs.promises.readdir(local)).length === 0;
        if (journal.phase === 'complete') {
            if (!connected) {
                if (!detachedEmpty)
                    throw new Error('exportTemplates:errors.changed');
                // A custom editor detaches the link. Keep its empty folder, but
                // verify the merged files still exist before deleting the backup.
                for (const set of journal.sets) {
                    if (
                        templateFingerprint(
                            await readTemplateTree(
                                templateChild(root, set.id),
                                true,
                            ),
                            journal.version ?? 1,
                        ) !== set.after
                    )
                        throw new Error('exportTemplates:errors.changed');
                }
            }
            await fs.promises.rm(localBackup, { recursive: true });
        } else {
            if (await templateLstat(local)) {
                if (connected) await fs.promises.unlink(local);
                else if (detachedEmpty) await fs.promises.rmdir(local);
                else throw new Error('exportTemplates:errors.changed');
            }
            await fs.promises.rename(localBackup, local);
        }
    }
    for (const set of [...journal.sets].reverse()) {
        const target = templateChild(root, set.id);
        const backup = templateChild(path.join(work, 'old'), set.id);
        if (await templateLstat(backup)) {
            if (
                templateFingerprint(
                    await readTemplateTree(backup, true),
                    journal.version ?? 1,
                ) !== set.before
            )
                throw new Error('exportTemplates:errors.changed');
            if (journal.phase === 'committing') {
                if (await templateLstat(target)) {
                    if (
                        templateFingerprint(
                            await readTemplateTree(target, true),
                            journal.version ?? 1,
                        ) !== set.after
                    )
                        throw new Error('exportTemplates:errors.changed');
                    await fs.promises.rm(target, { recursive: true });
                }
                await fs.promises.rename(backup, target);
            }
        } else if (
            journal.phase === 'committing' &&
            !set.existed &&
            (await templateLstat(target))
        ) {
            if (
                templateFingerprint(
                    await readTemplateTree(target, true),
                    journal.version ?? 1,
                ) !== set.after
            )
                throw new Error('exportTemplates:errors.changed');
            await fs.promises.rm(target, { recursive: true });
        }
    }
    await fs.promises.rm(work, { recursive: true });
}
