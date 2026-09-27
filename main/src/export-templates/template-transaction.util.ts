import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    checkTemplateCapacity,
    isSharedTemplateLink,
    readTemplateTree,
    setTemplatesMutating,
    templateChild,
    templateConnectionStatus,
    templateFingerprint,
    templateLstat,
} from './template-files.util.js';
import { isLocalTemplatePath } from './template-local-path.util.js';
import {
    type TemplateJournal,
    templateJournalSchema,
} from './template-transaction.schema.js';

export type { TemplateJournal } from './template-transaction.schema.js';

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
    return templateJournalSchema.parse(
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
                    journal.version,
                ) !== set.before
            )
                throw new Error('exportTemplates:errors.changed');
        }
        if (
            local &&
            ((await templateConnectionStatus(local, linkRoot)) !== 'local' ||
                templateFingerprint(
                    await readTemplateTree(local, !journal.metadataOnly),
                    journal.version,
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
            if (set.before === set.after) continue;
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
        await recoverTemplateTransaction(root, work, linkRoot);
    } catch (error) {
        if (await templateLstat(path.join(work, 'journal.json'))) {
            try {
                await recoverTemplateTransaction(root, work, linkRoot);
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
 * @param linkRoot - Conventional root used by project links.
 */
export async function recoverTemplateTransaction(
    root: string,
    work: string,
    linkRoot = root,
): Promise<void> {
    const journal = await readTemplateJournal(work);
    const local = journal.localPath;
    if (local) await validateLocalRecoveryPath(local, root);
    if (journal.operation) {
        await recoverProjectTemplateTransaction(linkRoot, work, journal);
        return;
    }
    if (Boolean(journal.projectPath) !== Boolean(local))
        throw new Error('exportTemplates:errors.recovery');
    // Completed migrations keep originals until the user restores or removes them.
    if (journal.phase === 'complete' && journal.retainBackup) return;
    const localBackup = local
        ? `${local}.launcher-${path.basename(work)}`
        : undefined;
    if (local && localBackup && (await templateLstat(localBackup))) {
        if (
            templateFingerprint(
                await readTemplateTree(localBackup, !journal.metadataOnly),
                journal.version,
            ) !== journal.sourceHash
        )
            throw new Error('exportTemplates:errors.changed');
        const connected = await isSharedTemplateLink(local, linkRoot);
        const detachedEmpty =
            !connected &&
            (await templateConnectionStatus(local, linkRoot)) === 'local' &&
            (await fs.promises.readdir(local)).length === 0;
        if (journal.phase === 'complete') {
            if (!connected && !journal.discardBackup) {
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
                            journal.version,
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
                    journal.version,
                ) !== set.before
            )
                throw new Error('exportTemplates:errors.changed');
            if (journal.phase === 'committing') {
                if (await templateLstat(target)) {
                    if (
                        templateFingerprint(
                            await readTemplateTree(target, true),
                            journal.version,
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
                    journal.version,
                ) !== set.after
            )
                throw new Error('exportTemplates:errors.changed');
            await fs.promises.rm(target, { recursive: true });
        }
    }
    await fs.promises.rm(work, { recursive: true });
}

/** Restores retained originals only while both the backups and installed result are unchanged.
 * @param root - Canonical shared collection.
 * @param work - Retained migration directory.
 * @param linkRoot - Conventional shared link destination.
 * @param beforeRestore - Persists separate mode after checks and before restoring files.
 */
export async function restoreTemplateMigration(
    root: string,
    work: string,
    linkRoot: string,
    beforeRestore: () => Promise<void>,
): Promise<void> {
    const journal = await readTemplateJournal(work);
    if (
        !journal.retainBackup ||
        journal.phase !== 'complete' ||
        !journal.localPath
    )
        throw new Error('exportTemplates:errors.recovery');
    await validateLocalRecoveryPath(journal.localPath, root);
    const backup = `${journal.localPath}.launcher-${path.basename(work)}`;
    if (
        !(await isSharedTemplateLink(journal.localPath, linkRoot)) ||
        templateFingerprint(await readTemplateTree(backup, true)) !==
            journal.sourceHash
    )
        throw new Error('exportTemplates:errors.changed');
    // Check every destination before the first destructive operation.
    for (const set of journal.sets) {
        if (set.before === set.after) continue;
        const target = templateChild(root, set.id);
        if (
            templateFingerprint(await readTemplateTree(target, true)) !==
            set.after
        )
            throw new Error('exportTemplates:errors.changed');
        if (
            set.existed &&
            templateFingerprint(
                await readTemplateTree(
                    templateChild(path.join(work, 'old'), set.id),
                    true,
                ),
            ) !== set.before
        )
            throw new Error('exportTemplates:errors.changed');
    }
    await beforeRestore();
    await writeJournal(work, {
        ...journal,
        retainBackup: false,
        phase: 'committing',
        sets: journal.sets.filter((set) => set.before !== set.after),
    });
    await recoverTemplateTransaction(root, work, linkRoot);
}

/** Explicitly removes retained originals without changing the current shared templates.
 * @param root - Canonical shared collection.
 * @param work - Retained migration directory.
 * @param linkRoot - Conventional shared link destination.
 */
export async function discardTemplateMigration(
    root: string,
    work: string,
    linkRoot: string,
): Promise<void> {
    const journal = await readTemplateJournal(work);
    if (
        !journal.retainBackup ||
        journal.phase !== 'complete' ||
        !journal.localPath
    )
        throw new Error('exportTemplates:errors.recovery');
    await validateLocalRecoveryPath(journal.localPath, root);
    const backup = `${journal.localPath}.launcher-${path.basename(work)}`;
    if (
        templateFingerprint(await readTemplateTree(backup, true)) !==
        journal.sourceHash
    )
        throw new Error('exportTemplates:errors.changed');
    for (const set of journal.sets) {
        if (set.before === set.after || !set.existed) continue;
        if (
            templateFingerprint(
                await readTemplateTree(
                    templateChild(path.join(work, 'old'), set.id),
                    true,
                ),
            ) !== set.before
        )
            throw new Error('exportTemplates:errors.changed');
    }
    await writeJournal(work, {
        ...journal,
        retainBackup: false,
        discardBackup: true,
    });
    await recoverTemplateTransaction(root, work, linkRoot);
}

/** Copies checked regular files without following links.
 * @param source - Source collection.
 * @param destination - Empty destination collection.
 * @param files - Freshly captured source files.
 */
export async function copyTemplateFiles(
    source: string,
    destination: string,
    files: Awaited<ReturnType<typeof readTemplateTree>>,
): Promise<void> {
    await fs.promises.mkdir(destination, { recursive: true });
    await checkTemplateCapacity(
        destination,
        files.reduce((total, file) => total + file.size, 0),
    );
    for (const file of files) {
        const target = templateChild(destination, file.relative);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.copyFile(
            templateChild(source, file.relative),
            target,
            fs.constants.COPYFILE_EXCL,
        );
        await fs.promises.chmod(target, file.mode);
    }
    if (
        templateFingerprint(
            await readTemplateTree(
                destination,
                files.some((file) => Boolean(file.hash)),
            ),
        ) !== templateFingerprint(files)
    )
        throw new Error('exportTemplates:errors.changed');
}

/** Swaps a project collection on its own volume with durable rollback metadata.
 * @param root - Canonical shared root, used only for validating connections.
 * @param work - Central operation directory.
 * @param local - Canonical project export templates folder.
 * @param source - Prepared complete replacement collection.
 * @param before - Fresh original collection fingerprint, or empty for a shared link.
 * @param detach - Whether the original is a shared connection.
 * @param validate - Rechecks project identity before mutation.
 * @param linkRoot - Conventional shared path used by project links.
 * @param setId - Optional version folder to copy directly into the detached collection.
 */
export async function commitProjectTemplateTransaction(
    root: string,
    work: string,
    local: string,
    source: string,
    before: string,
    detach: boolean,
    validate: () => Promise<void>,
    linkRoot = root,
    setId?: string,
): Promise<void> {
    await validateLocalRecoveryPath(local, root);
    const next = `${local}.launcher-new-${path.basename(work)}`;
    const backup = `${local}.launcher-${path.basename(work)}`;
    if ((await templateLstat(next)) || (await templateLstat(backup)))
        throw new Error('exportTemplates:errors.changed');
    const files = await readTemplateTree(source, false);
    const journal: TemplateJournal = {
        version: 2,
        phase: 'committing',
        sets: [],
        localPath: local,
        operation: detach ? 'detach' : 'local',
        metadataOnly: true,
        sourceHash: before,
        afterHash: templateFingerprint(
            setId
                ? files.map((file) => ({
                      ...file,
                      relative: `${setId}/${file.relative}`,
                  }))
                : files,
        ),
        localExisted: Boolean(await templateLstat(local)),
    };
    await writeJournal(work, journal);
    setTemplatesMutating(true);
    try {
        await fs.promises.mkdir(next);
        if (files.length)
            await copyTemplateFiles(
                source,
                setId ? templateChild(next, setId) : next,
                files,
            );
        await validate();
        const status = await templateConnectionStatus(local, linkRoot);
        if (
            detach
                ? status !== 'shared'
                : !['local', 'missing'].includes(status) ||
                  templateFingerprint(await readTemplateTree(local, false)) !==
                      before
        )
            throw new Error('exportTemplates:errors.changed');
        if (journal.localExisted) await fs.promises.rename(local, backup);
        await fs.promises.rename(next, local);
        await writeJournal(work, { ...journal, phase: 'complete' });
        await recoverTemplateTransaction(root, work, linkRoot);
    } catch (error) {
        await recoverTemplateTransaction(root, work, linkRoot).catch(() => {
            throw new Error('exportTemplates:errors.recovery');
        });
        throw error;
    } finally {
        setTemplatesMutating(false);
    }
}

/** Rolls back an interrupted project swap, or removes its completed temporary files.
 * @param root - Canonical shared collection.
 * @param work - Operation directory.
 * @param journal - Validated saved operation.
 */
async function recoverProjectTemplateTransaction(
    root: string,
    work: string,
    journal: TemplateJournal,
): Promise<void> {
    const local = journal.localPath;
    if (!local || !journal.afterHash || !journal.sourceHash)
        throw new Error('exportTemplates:errors.recovery');
    const backup = `${local}.launcher-${path.basename(work)}`;
    const next = `${local}.launcher-new-${path.basename(work)}`;
    const saved = await templateLstat(backup);
    if (saved) {
        if (journal.operation === 'detach') {
            if (!(await isSharedTemplateLink(backup, root)))
                throw new Error('exportTemplates:errors.changed');
        } else if (
            templateFingerprint(
                await readTemplateTree(backup, !journal.metadataOnly),
            ) !== journal.sourceHash
        )
            throw new Error('exportTemplates:errors.changed');
    }
    if (journal.phase === 'committing' && (saved || !journal.localExisted)) {
        if (await templateLstat(local)) {
            if (
                templateFingerprint(
                    await readTemplateTree(local, !journal.metadataOnly),
                ) !== journal.afterHash
            )
                throw new Error('exportTemplates:errors.changed');
            await fs.promises.rm(local, { recursive: true });
        }
        if (saved) await fs.promises.rename(backup, local);
    } else if (journal.phase === 'complete' && saved) {
        if (
            templateFingerprint(
                await readTemplateTree(local, !journal.metadataOnly),
            ) !== journal.afterHash
        )
            throw new Error('exportTemplates:errors.changed');
        if (journal.operation === 'detach') await fs.promises.unlink(backup);
        else await fs.promises.rm(backup, { recursive: true });
    }
    const nextStat = await templateLstat(next);
    if (nextStat) {
        if (!nextStat.isDirectory() || nextStat.isSymbolicLink())
            throw new Error('exportTemplates:errors.unsafe');
        await fs.promises.rm(next, { recursive: true });
    }
    await fs.promises.rm(work, { recursive: true });
}
