import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import type {
    ImportedTemplateBuild,
    ProjectDetails,
    TemplateMigrationFileProgress,
    TemplateMigrationVersionPlan,
    TemplateMigrationVersionResult,
    TemplateMigrationVersionStatus,
} from '@shared/contracts';
import type { ProjectsStore } from '../projects/projects.store.js';
import {
    importedTemplateFiles,
    importedTemplateRoot,
    readImportedTemplates,
    writeImportedTemplates,
} from './imported-templates.store.js';
import { updateTemplateFiles } from './template-file-update.util.js';
import {
    checkTemplateCapacity,
    readTemplateTree,
    type TemplateFile,
    templateFingerprint,
    templateLstat,
    templateMetadataSnapshot,
} from './template-files.util.js';
import type { TemplateMigrationSource } from './template-migration.types.js';
import { projectTemplateStorage } from './template-paths.util.js';
import { projectTemplateBuilds } from './template-projection.util.js';
import { getSharedTemplateRoot } from './template-runtime.util.js';
import {
    assertTemplateVersionParents,
    templateVersionCollection,
} from './template-version-layout.util.js';
import type {
    FastTemplateVersionMigration,
    TemplateVersionLayout,
    TemplateVersionMigration,
} from './template-version-migration.schema.js';
import {
    clearTemplateVersionMigration,
    readTemplateVersionLayout,
    readTemplateVersionMigration,
    writeTemplateVersionLayout,
    writeTemplateVersionMigration,
} from './template-version-migration.store.js';

type MigrationProgressReporter = (
    status: TemplateMigrationVersionStatus,
    progress?: TemplateMigrationFileProgress,
) => void;

/** Applies one reviewed version at a time, retaining originals until its connection is committed. */
export class TemplateVersionMigrationService {
    private activeJournalId?: string;
    /** Identifies only the recovery record owned by this running operation.
     * @param id - Recovery record reported by discovery.
     */
    ownsActiveRecovery(id: string): boolean {
        return this.activeJournalId === id;
    }

    /** Receives existing project persistence and imported build naming.
     * @param projects - Authoritative project store.
     * @param createBuild - Allocates a unique imported destination without copying files.
     */
    constructor(
        private readonly projects: ProjectsStore,
        private readonly createBuild: (
            project: ProjectDetails,
            setId: string,
            files: TemplateFile[],
        ) => Promise<ImportedTemplateBuild>,
    ) {}

    /** Moves only this version and returns the updated saved project for the next decision.
     * @param source - Trusted reviewed collection and file metadata.
     * @param version - Exact reviewed effects for one populated version.
     * @param expected - Project settings after earlier successful versions in this batch.
     * @param report - Main-owned progress phase callback.
     */
    async execute(
        source: TemplateMigrationSource,
        version: TemplateMigrationVersionPlan,
        expected: ProjectDetails,
        report: MigrationProgressReporter,
    ): Promise<ProjectDetails> {
        if (version.choice === 'later') return expected;
        if (await readTemplateVersionMigration())
            throw new Error('exportTemplates:errors.recovery');
        report('checking');
        const project = await this.current(source, expected);
        const editor = path.dirname(source.launchPath);
        const root =
            source.localRoot === templateVersionCollection(editor, 'active')
                ? 'active'
                : 'official';
        const local = templateVersionCollection(editor, root);
        if (
            local !== source.localRoot ||
            (await fs.promises.realpath(local)) !== source.localRealPath
        )
            throw new Error('exportTemplates:errors.changed');
        await assertTemplateVersionParents(editor, local);
        const reviewedFiles = source.files
            .filter((file) => file.relative.startsWith(`${version.setId}/`))
            .map((file) => ({
                ...file,
                relative: file.relative.slice(version.setId.length + 1),
            }));
        const original = path.join(local, version.setId);
        const checkedFiles = await readTemplateTree(
            original,
            false,
            undefined,
            reviewedFiles.some((file) => !!file.metadata),
        );
        if (
            templateMetadataSnapshot(reviewedFiles) !==
            templateMetadataSnapshot(checkedFiles)
        )
            throw new Error('exportTemplates:errors.changed');
        const files = checkedFiles.map((file) => ({
            ...file,
            hash: '' as const,
        }));
        const sourceIdentity = await this.directoryIdentity(original);
        const beforeLayout = await readTemplateVersionLayout(editor);
        if (beforeLayout && beforeLayout.root !== root)
            throw new Error('exportTemplates:errors.connection');
        const build =
            version.choice === 'save-imported'
                ? await this.createBuild(project, version.setId, files)
                : undefined;
        const journal: FastTemplateVersionMigration = {
            version: 2,
            transfer: version.choice === 'use-shared' ? 'shared' : 'move',
            sourceIdentity,
            id: randomUUID(),
            projectPath: project.path,
            launchPath: project.launch_path,
            setId: version.setId,
            editorSetId: source.setId,
            root,
            localRealPath: source.localRealPath,
            sharedRoot: await this.sharedIdentity(source.sharedRoot),
            choice: version.choice,
            beforeMode: project.exportTemplateMode,
            beforeSelections: { ...project.exportTemplateBuilds },
            beforeLayout,
            build,
            files,
        };
        const target = this.target(journal);
        const existingTarget = await templateLstat(target);
        if (build && existingTarget)
            throw new Error('exportTemplates:errors.changed');
        if (existingTarget) {
            journal.targetIdentity = await this.directoryIdentity(target);
            if (version.choice === 'share-project') journal.transfer = 'merge';
        }
        let capacityRoot = build ? importedTemplateRoot() : source.sharedRoot;
        while (!(await templateLstat(capacityRoot))) {
            const parent = path.dirname(capacityRoot);
            if (parent === capacityRoot)
                throw new Error('exportTemplates:errors.space');
            capacityRoot = parent;
        }
        await checkTemplateCapacity(
            capacityRoot,
            journal.transfer === 'shared' ||
                (journal.transfer === 'move' &&
                    (await fs.promises.stat(capacityRoot)).dev ===
                        sourceIdentity.dev)
                ? 0
                : version.sizeBytes,
        );
        this.activeJournalId = journal.id;
        try {
            await writeTemplateVersionMigration(journal);
        } catch (error) {
            this.activeJournalId = undefined;
            throw error;
        }
        try {
            await this.transferVersion(journal, report);
            const backup = this.backup(journal);
            if (await templateLstat(backup))
                await this.assertFastFiles(backup, journal.files);
            await this.current(source, expected);
            if (build) {
                const library = await readImportedTemplates();
                await writeImportedTemplates({
                    ...library,
                    builds: [...library.builds, build],
                });
            }
            report('connecting');
            await fs.promises.symlink(
                path.resolve(target),
                original,
                process.platform === 'win32' ? 'junction' : 'dir',
            );
            await this.assertLink(original, target);
            const selections = {
                ...project.exportTemplateBuilds,
                [version.setId]: build?.id ?? 'official',
            };
            const saved = await this.projects.update((projects) =>
                projects.map((item) => {
                    if (item.path !== project.path) return item;
                    this.assertProject(item, project);
                    return {
                        ...item,
                        exportTemplateMode: 'shared',
                        exportTemplateBuilds: selections,
                    };
                }),
            );
            await writeTemplateVersionLayout(editor, {
                version: 1,
                root,
                managed: {
                    ...(await this.retainedManagedLinks(
                        local,
                        beforeLayout?.managed ?? {},
                    )),
                    [version.setId]: journal.id,
                },
            });
            report('cleaning');
            await projectTemplateBuilds(
                editor,
                getSharedTemplateRoot(),
                await readImportedTemplates(),
                selections,
                journal.editorSetId,
            );
            await this.cleanFastBackup(journal);
            await this.removeBackupParent(journal);
            await clearTemplateVersionMigration();
            return saved.find(
                (item) => item.path === project.path,
            ) as ProjectDetails;
        } catch (error) {
            // Recovery rolls back before the ownership commit, or finishes verified cleanup afterwards.
            await this.recover(report);
            if (
                (await readTemplateVersionLayout(editor))?.managed[
                    version.setId
                ] === journal.id
            ) {
                return (await this.projects.list()).find(
                    (item) => item.path === project.path,
                ) as ProjectDetails;
            }
            throw error;
        } finally {
            this.activeJournalId = undefined;
        }
    }

    /** Finishes committed cleanup or restores the original version after an interrupted move.
     * @param report - Optional progress for cleanup within the active move.
     */
    async recover(
        report?: MigrationProgressReporter,
    ): Promise<TemplateMigrationVersionResult | undefined> {
        const journal = await readTemplateVersionMigration();
        if (!journal) return;
        const editor = path.dirname(journal.launchPath);
        const local = templateVersionCollection(editor, journal.root);
        const project = (await this.projects.list()).find(
            (item) => item.path === journal.projectPath,
        );
        if (
            !path.isAbsolute(journal.projectPath) ||
            !path.isAbsolute(journal.launchPath) ||
            !project ||
            project.launch_path !== journal.launchPath ||
            project.release.source === 'custom' ||
            `${project.release.version.replace('-', '.')}${project.release.mono ? '.mono' : ''}` !==
                journal.editorSetId ||
            (await fs.promises.realpath(local)) !== journal.localRealPath
        )
            throw new Error('exportTemplates:errors.recovery');
        await assertTemplateVersionParents(editor, local);
        const shared = await this.sharedIdentity(getSharedTemplateRoot());
        if (shared !== journal.sharedRoot)
            throw new Error('exportTemplates:errors.recovery');
        const layout = await readTemplateVersionLayout(editor);
        const committed = layout?.managed[journal.setId] === journal.id;
        const original = path.join(local, journal.setId);
        const backup = this.backup(journal);
        const target = this.target(journal);
        const expectedSelection = journal.build?.id ?? 'official';
        const afterSelections = {
            ...journal.beforeSelections,
            [journal.setId]: expectedSelection,
        };
        const before =
            JSON.stringify(
                Object.entries(project.exportTemplateBuilds ?? {}).sort(),
            ) ===
                JSON.stringify(
                    Object.entries(journal.beforeSelections).sort(),
                ) && project.exportTemplateMode === journal.beforeMode;
        const after =
            JSON.stringify(
                Object.entries(project.exportTemplateBuilds ?? {}).sort(),
            ) === JSON.stringify(Object.entries(afterSelections).sort()) &&
            project.exportTemplateMode === 'shared';
        if ((!before && !after) || (committed && !after))
            throw new Error('exportTemplates:errors.recovery');
        if (journal.version === 2)
            return this.recoverFast(
                journal,
                project,
                layout,
                committed,
                before,
                after,
            );
        const backupStat = await templateLstat(backup);
        if (backupStat) {
            await this.assertBackupParents(journal);
            await this.assertSurvivors(backup, journal.files, report);
        }
        if (committed) {
            await this.assertLink(original, target);
            if (journal.build) {
                const library = await readImportedTemplates();
                if (
                    !library.builds.some(
                        (build) =>
                            build.id === journal.build?.id &&
                            build.revision === journal.build.revision,
                    )
                )
                    throw new Error('exportTemplates:errors.recovery');
                await this.assertFiles(
                    target,
                    journal.files,
                    report,
                    'cleaning',
                );
            }
            if (layout) {
                const managed = await this.retainedManagedLinks(
                    local,
                    layout.managed,
                );
                if (JSON.stringify(managed) !== JSON.stringify(layout.managed))
                    await writeTemplateVersionLayout(editor, {
                        ...layout,
                        managed,
                    });
            }
            await projectTemplateBuilds(
                editor,
                getSharedTemplateRoot(),
                await readImportedTemplates(),
                project.exportTemplateBuilds,
                journal.editorSetId,
            );
            if (backupStat) await fs.promises.rm(backup, { recursive: true });
        } else {
            if (backupStat) {
                await this.assertFiles(
                    backup,
                    journal.files,
                    report,
                    'cleaning',
                );
                if (await templateLstat(original)) {
                    await this.assertLink(original, target);
                    await fs.promises.unlink(original);
                }
                await fs.promises.rename(backup, original);
            }
            await this.assertFiles(original, journal.files, report, 'cleaning');
            if (after && !before)
                await this.projects.update((projects) =>
                    projects.map((item) => {
                        if (item.path !== project.path) return item;
                        this.assertProject(item, project);
                        return {
                            ...item,
                            exportTemplateMode: journal.beforeMode,
                            exportTemplateBuilds: journal.beforeSelections,
                        };
                    }),
                );
            if (journal.build) {
                const library = await readImportedTemplates();
                const build = library.builds.find(
                    (item) => item.id === journal.build?.id,
                );
                if (build && build.revision !== journal.build.revision)
                    throw new Error('exportTemplates:errors.recovery');
                if (build)
                    await writeImportedTemplates({
                        ...library,
                        builds: library.builds.filter(
                            (item) => item.id !== build.id,
                        ),
                    });
                const copied = await templateLstat(target);
                if (copied) {
                    await this.assertSurvivors(target, journal.files);
                    await fs.promises.rm(target, { recursive: true });
                }
            }
        }
        await this.removeBackupParent(journal);
        await clearTemplateVersionMigration();
        return {
            projectPath: journal.projectPath,
            setId: journal.setId,
            status: committed ? 'complete' : 'error',
        };
    }

    /** Transfers a whole folder by rename, copying once only across filesystems.
     * @param journal - Durable ownership and original metadata for this version.
     * @param report - Active move phase reporter.
     */
    private async transferVersion(
        journal: FastTemplateVersionMigration,
        report: MigrationProgressReporter,
    ): Promise<void> {
        const original = path.join(
            templateVersionCollection(
                path.dirname(journal.launchPath),
                journal.root,
            ),
            journal.setId,
        );
        const backup = this.backup(journal);
        const target = this.target(journal);
        await this.prepareBackupParent(journal);
        await this.assertDirectoryIdentity(original, journal.sourceIdentity);
        report('connecting');
        await fs.promises.rename(original, backup);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        if (journal.transfer === 'move') {
            // Never replace a destination that appeared after review.
            if (await templateLstat(target))
                throw new Error('exportTemplates:errors.changed');
            try {
                await fs.promises.rename(backup, target);
                journal.targetIdentity = journal.sourceIdentity;
                journal.targetFiles = journal.files;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EXDEV')
                    throw error;
                await checkTemplateCapacity(
                    path.dirname(target),
                    journal.files.reduce((total, file) => total + file.size, 0),
                );
                journal.transfer = 'copy';
                await writeTemplateVersionMigration(journal);
            }
        }
        if (
            journal.transfer === 'copy' ||
            (journal.transfer === 'shared' && !journal.targetIdentity)
        ) {
            const prepared = this.preparedTarget(journal);
            await fs.promises.mkdir(
                prepared,
                journal.transfer === 'copy' ? { mode: 0o700 } : undefined,
            );
            journal.targetIdentity = await this.directoryIdentity(prepared);
            // Record ownership before publishing the destination or copying any files.
            await writeTemplateVersionMigration(journal);
            if (await templateLstat(target))
                throw new Error('exportTemplates:errors.changed');
            await fs.promises.rename(prepared, target);
        }
        if (journal.transfer === 'copy') {
            report('copying');
            // The owned destination already exists; copy each child once without replacing entries.
            for (const name of await fs.promises.readdir(backup))
                await fs.promises.cp(
                    path.join(backup, name),
                    path.join(target, name),
                    {
                        recursive: true,
                        force: false,
                        errorOnExist: true,
                    },
                );
            await fs.promises.chmod(
                target,
                (await fs.promises.stat(backup)).mode & 0o777,
            );
            report('verifying');
            journal.targetFiles = await this.assertFastFiles(
                target,
                journal.files,
                false,
                false,
            );
        } else if (journal.transfer === 'merge') {
            await this.assertDirectoryIdentity(target, journal.targetIdentity);
            const before = await readTemplateTree(
                target,
                false,
                undefined,
                true,
            );
            const retained = new Set(before.map((file) => file.relative));
            const additions = journal.files.filter(
                (file) => !retained.has(file.relative),
            );
            const directories = await this.mergeDirectories(backup, target);
            if (additions.length) {
                report('copying');
                await updateTemplateFiles(
                    target,
                    backup,
                    additions.map((file) => file.relative),
                    [],
                    true,
                );
            }
            for (const directory of directories)
                await fs.promises.chmod(directory.filename, directory.mode);
            report('verifying');
            const after = await readTemplateTree(
                target,
                false,
                undefined,
                true,
            );
            if (
                templateMetadataSnapshot(before) !==
                templateMetadataSnapshot(
                    after.filter((file) => retained.has(file.relative)),
                )
            )
                throw new Error('exportTemplates:errors.changed');
            for (const file of additions) {
                const copied = after.find(
                    (item) => item.relative === file.relative,
                );
                if (
                    !copied ||
                    copied.size !== file.size ||
                    copied.mode !== file.mode
                )
                    throw new Error('exportTemplates:errors.changed');
            }
            journal.targetFiles = after.map((file) => ({ ...file, hash: '' }));
        }
        await this.assertDirectoryIdentity(target, journal.targetIdentity);
        await writeTemplateVersionMigration(journal);
    }

    /** Preserves local directories, including empty ones, without replacing shared entries.
     * @param source - Retained original version folder.
     * @param target - Existing shared version folder.
     */
    private async mergeDirectories(
        source: string,
        target: string,
    ): Promise<{ filename: string; mode: number }[]> {
        await this.directoryIdentity(source);
        await this.directoryIdentity(target);
        const created: { filename: string; mode: number }[] = [];
        for (const entry of await fs.promises.readdir(source, {
            withFileTypes: true,
        })) {
            if (entry.isSymbolicLink())
                throw new Error('exportTemplates:errors.unsafe');
            if (!entry.isDirectory()) continue;
            const incoming = path.join(source, entry.name);
            const destination = path.join(target, entry.name);
            const current = await templateLstat(destination);
            const mode = (await fs.promises.stat(incoming)).mode & 0o777;
            if (!current)
                await fs.promises.mkdir(destination, {
                    mode: mode | 0o700,
                });
            created.push(
                ...(await this.mergeDirectories(incoming, destination)),
            );
            if (!current) created.push({ filename: destination, mode });
        }
        return created;
    }

    /** Locates an unpublished destination on its own filesystem.
     * @param journal - Operation identity used to isolate the preparation folder.
     */
    private preparedTarget(journal: FastTemplateVersionMigration): string {
        return path.join(
            path.dirname(this.target(journal)),
            `.migration-${journal.id}`,
        );
    }

    /** Restores an uncommitted folder or completes cleanup using recorded ownership.
     * @param journal - Version-two recovery record, retaining the old format separately.
     * @param project - Validated registered project.
     * @param layout - Current ownership commit record.
     * @param committed - Whether the connection and project choices were committed.
     * @param before - Whether project choices still match their original state.
     * @param after - Whether project choices match the requested state.
     */
    private async recoverFast(
        journal: FastTemplateVersionMigration,
        project: ProjectDetails,
        layout: TemplateVersionLayout | undefined,
        committed: boolean,
        before: boolean,
        after: boolean,
    ): Promise<TemplateMigrationVersionResult> {
        const editor = path.dirname(journal.launchPath);
        const local = templateVersionCollection(editor, journal.root);
        const original = path.join(local, journal.setId);
        const backup = this.backup(journal);
        const target = this.target(journal);
        const prepared = this.preparedTarget(journal);
        const preparedStat = await templateLstat(prepared);
        const backupStat = await templateLstat(backup);
        const targetStat = await templateLstat(target);
        const library = await readImportedTemplates();
        const build = library.builds.find(
            (item) => item.id === journal.build?.id,
        );
        if (
            (build && build.revision !== journal.build?.revision) ||
            (committed && journal.build && !build)
        )
            throw new Error('exportTemplates:errors.recovery');
        if (backupStat) {
            await this.assertBackupParents(journal);
            await this.assertDirectoryIdentity(backup, journal.sourceIdentity);
            await this.assertFastFiles(backup, journal.files, committed);
        }
        if (preparedStat && journal.targetIdentity) {
            await this.assertDirectoryIdentity(
                prepared,
                journal.targetIdentity,
            );
            // Files are only copied after publication, so preparation must remain empty.
            await fs.promises.rmdir(prepared);
        }
        if (committed) {
            await this.assertLink(original, target);
            await this.assertDirectoryIdentity(target, journal.targetIdentity);
            if (journal.targetFiles)
                await this.assertFastFiles(target, journal.targetFiles);
            if (layout) {
                const managed = await this.retainedManagedLinks(
                    local,
                    layout.managed,
                );
                if (JSON.stringify(managed) !== JSON.stringify(layout.managed))
                    await writeTemplateVersionLayout(editor, {
                        ...layout,
                        managed,
                    });
            }
            await projectTemplateBuilds(
                editor,
                getSharedTemplateRoot(),
                library,
                project.exportTemplateBuilds,
                journal.editorSetId,
            );
            await this.cleanFastBackup(journal);
        } else {
            // Check all locations before unlinking, restoring or removing anything.
            const moved =
                journal.transfer === 'move' && !backupStat && targetStat;
            if (moved) {
                await this.assertDirectoryIdentity(
                    target,
                    journal.sourceIdentity,
                );
                await this.assertFastFiles(target, journal.files);
            }
            if (journal.transfer === 'copy' && targetStat) {
                await this.assertDirectoryIdentity(
                    target,
                    journal.targetIdentity,
                );
                const known = new Set(
                    journal.files.map((file) => file.relative),
                );
                if (
                    (await readTemplateTree(target, false)).some(
                        (file) => !known.has(file.relative),
                    )
                )
                    throw new Error('exportTemplates:errors.recovery');
                if (journal.targetFiles)
                    await this.assertFastFiles(
                        target,
                        journal.targetFiles,
                        true,
                    );
            }
            const originalStat = await templateLstat(original);
            if (backupStat || moved) {
                if (originalStat) {
                    await this.assertLink(original, target);
                    await fs.promises.unlink(original);
                }
                await fs.promises.rename(moved ? target : backup, original);
            } else {
                await this.assertDirectoryIdentity(
                    original,
                    journal.sourceIdentity,
                );
                await this.assertFastFiles(original, journal.files);
            }
            if (after && !before)
                await this.projects.update((projects) =>
                    projects.map((item) => {
                        if (item.path !== project.path) return item;
                        this.assertProject(item, project);
                        return {
                            ...item,
                            exportTemplateMode: journal.beforeMode,
                            exportTemplateBuilds: journal.beforeSelections,
                        };
                    }),
                );
            if (build)
                await writeImportedTemplates({
                    ...library,
                    builds: library.builds.filter(
                        (item) => item.id !== build.id,
                    ),
                });
            if (journal.transfer === 'copy' && targetStat) {
                await this.makeOwnedDirectoriesWritable(target);
                await fs.promises.rm(target, { recursive: true });
            }
        }
        await this.removeBackupParent(journal);
        await clearTemplateVersionMigration();
        return {
            projectPath: journal.projectPath,
            setId: journal.setId,
            status: committed ? 'complete' : 'error',
        };
    }

    /** Reads the physical identity of an ordinary folder without following a link.
     * @param directory - Original, backup or destination directory.
     */
    private async directoryIdentity(
        directory: string,
    ): Promise<{ dev: number; ino: number }> {
        const stat = await templateLstat(directory);
        if (!stat?.isDirectory() || stat.isSymbolicLink())
            throw new Error('exportTemplates:errors.unsafe');
        return { dev: stat.dev, ino: stat.ino };
    }

    /** Refuses cleanup or restoration of a folder replaced outside this operation.
     * @param directory - Path recorded by this move.
     * @param expected - Identity captured before this operation touched its files.
     */
    private async assertDirectoryIdentity(
        directory: string,
        expected: { dev: number; ino: number } | undefined,
    ): Promise<void> {
        const actual = await this.directoryIdentity(directory);
        if (
            !expected ||
            actual.dev !== expected.dev ||
            actual.ino !== expected.ino
        )
            throw new Error('exportTemplates:errors.recovery');
    }

    /** Checks names, sizes, permissions and optional change metadata without reading contents.
     * @param directory - Retained source or copied destination.
     * @param expected - Journal file inventory.
     * @param survivors - Allows files already removed by interrupted committed cleanup.
     * @param compareMetadata - Checks identity and timestamps for files that were not copied.
     */
    private async assertFastFiles(
        directory: string,
        expected: TemplateFile[],
        survivors = false,
        compareMetadata = true,
    ): Promise<FastTemplateVersionMigration['files']> {
        await this.directoryIdentity(directory);
        const files = await readTemplateTree(directory, false, undefined, true);
        const known = new Map(expected.map((file) => [file.relative, file]));
        if (!survivors && files.length !== expected.length)
            throw new Error('exportTemplates:errors.changed');
        for (const file of files) {
            const previous = known.get(file.relative);
            if (
                !previous ||
                file.size !== previous.size ||
                file.mode !== previous.mode ||
                (compareMetadata &&
                    previous.metadata &&
                    JSON.stringify(file.metadata) !==
                        JSON.stringify(previous.metadata))
            )
                throw new Error('exportTemplates:errors.changed');
        }
        return files.map((file) => ({ ...file, hash: '' as const }));
    }

    /** Deletes an owned original backup after its connection and settings are committed.
     * @param journal - Committed version move.
     */
    private async cleanFastBackup(
        journal: FastTemplateVersionMigration,
    ): Promise<void> {
        const backup = this.backup(journal);
        if (!(await templateLstat(backup))) return;
        await this.assertBackupParents(journal);
        await this.assertDirectoryIdentity(backup, journal.sourceIdentity);
        await this.assertFastFiles(backup, journal.files, true);
        await this.makeOwnedDirectoriesWritable(backup);
        await fs.promises.rm(backup, { recursive: true });
    }

    /** Allows removal of verified, operation-owned copies containing read-only directories.
     * @param directory - Owned copy already checked against its recorded inventory.
     */
    private async makeOwnedDirectoriesWritable(
        directory: string,
    ): Promise<void> {
        await this.directoryIdentity(directory);
        const mode = (await fs.promises.stat(directory)).mode & 0o777;
        if ((mode & 0o700) !== 0o700)
            await fs.promises.chmod(directory, mode | 0o700);
        for (const entry of await fs.promises.readdir(directory, {
            withFileTypes: true,
        })) {
            if (entry.isSymbolicLink())
                throw new Error('exportTemplates:errors.unsafe');
            if (entry.isDirectory())
                await this.makeOwnedDirectoriesWritable(
                    path.join(directory, entry.name),
                );
        }
    }

    /** Reads a registered project and rejects changes made outside this batch.
     * @param source - Reviewed editor identity.
     * @param expected - Settings after earlier versions have completed.
     */
    private async current(
        source: TemplateMigrationSource,
        expected: ProjectDetails,
    ): Promise<ProjectDetails> {
        const project = (await this.projects.list()).find(
            (item) => item.path === source.projectPath,
        );
        if (
            !project ||
            project.release.source === 'custom' ||
            project.launch_path !== source.launchPath ||
            `${project.release.version.replace('-', '.')}${project.release.mono ? '.mono' : ''}` !==
                source.setId
        )
            throw new Error('exportTemplates:errors.changed');
        this.assertProject(project, expected);
        return project;
    }
    /** Guards the project choice write against an editor or selection change.
     * @param project - Current stored project.
     * @param expected - Last verified settings for this batch.
     */
    private assertProject(
        project: ProjectDetails,
        expected: ProjectDetails,
    ): void {
        if (
            project.launch_path !== expected.launch_path ||
            project.release.version !== expected.release.version ||
            project.release.mono !== expected.release.mono ||
            project.release.source !== expected.release.source ||
            project.exportTemplateMode !== expected.exportTemplateMode ||
            JSON.stringify(
                Object.entries(project.exportTemplateBuilds ?? {}).sort(),
            ) !==
                JSON.stringify(
                    Object.entries(expected.exportTemplateBuilds ?? {}).sort(),
                )
        )
            throw new Error('exportTemplates:errors.changed');
    }
    /** Resolves a destination only from the checked journal's version and build identity.
     * @param journal - Persisted main-owned inputs.
     */
    private target(journal: TemplateVersionMigration): string {
        if (
            (journal.build && journal.build.setId !== journal.setId) ||
            (journal.choice === 'save-imported') !== !!journal.build
        )
            throw new Error('exportTemplates:errors.recovery');
        return journal.build
            ? importedTemplateFiles(journal.build)
            : path.join(journal.sharedRoot, journal.setId);
    }
    /** Resolves the physical shared destination before it exists, preserving parent aliases across creation.
     * @param directory - Reviewed shared root or current configured shared root.
     */
    private async sharedIdentity(directory: string): Promise<string> {
        const absolute = path.resolve(directory);
        let existing = absolute;
        while (!(await templateLstat(existing))) {
            const parent = path.dirname(existing);
            if (parent === existing)
                throw new Error('exportTemplates:errors.location');
            existing = parent;
        }
        return path.resolve(
            await fs.promises.realpath(existing),
            path.relative(existing, absolute),
        );
    }
    /** Drops link ownership claims for versions replaced by ordinary local folders.
     * Real folders remain available for a separate migration decision.
     * @param collection - Checked project template collection.
     * @param managed - Previous ownership records, including earlier successful versions.
     */
    private async retainedManagedLinks(
        collection: string,
        managed: Record<string, string>,
    ): Promise<Record<string, string>> {
        const retained = { ...managed };
        for (const id of Object.keys(managed)) {
            const stat = await templateLstat(path.join(collection, id));
            if (stat?.isDirectory() && !stat.isSymbolicLink())
                delete retained[id];
        }
        return retained;
    }

    /** Keeps the backup on the same filesystem as the original for atomic rename.
     * @param journal - Version transaction identity.
     */
    private backup(journal: TemplateVersionMigration): string {
        return path.join(
            projectTemplateStorage(path.dirname(journal.launchPath)),
            'version-backups',
            journal.id,
            journal.setId,
        );
    }
    /** Creates only checked project-owned backup parents.
     * @param journal - Version transaction identity.
     */
    private async prepareBackupParent(
        journal: TemplateVersionMigration,
    ): Promise<void> {
        const storage = projectTemplateStorage(
            path.dirname(journal.launchPath),
        );
        for (const directory of [
            storage,
            path.join(storage, 'version-backups'),
            path.dirname(this.backup(journal)),
        ]) {
            const stat = await templateLstat(directory);
            if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
                throw new Error('exportTemplates:errors.unsafe');
            await fs.promises.mkdir(directory, { recursive: true });
        }
    }
    /** Refuses redirected backup parents during recovery.
     * @param journal - Version transaction identity.
     */
    private async assertBackupParents(
        journal: TemplateVersionMigration,
    ): Promise<void> {
        for (const directory of [
            path.dirname(path.dirname(this.backup(journal))),
            path.dirname(this.backup(journal)),
        ]) {
            const stat = await templateLstat(directory);
            if (!stat?.isDirectory() || stat.isSymbolicLink())
                throw new Error('exportTemplates:errors.recovery');
        }
    }
    /** Removes an empty transaction directory without deleting unrelated entries.
     * @param journal - Completed version transaction.
     */
    private async removeBackupParent(
        journal: TemplateVersionMigration,
    ): Promise<void> {
        if (await templateLstat(path.dirname(this.backup(journal))))
            await this.assertBackupParents(journal);
        try {
            await fs.promises.rmdir(path.dirname(this.backup(journal)));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
    }
    /** Reads checked bytes, publishing bounded updates for the current phase.
     * @param directory - Collection being checked.
     * @param expected - Files whose sizes define this check's total.
     * @param report - Optional active job reporter.
     * @param status - Phase shown while these bytes are read.
     * @param captureMetadata - Retains metadata for untouched-file comparisons.
     * @param checkedPaths - Exact files to hash, or all files when absent.
     */
    private async readCheckedFiles(
        directory: string,
        expected: TemplateFile[],
        report: MigrationProgressReporter | undefined,
        status: TemplateMigrationVersionStatus,
        captureMetadata = false,
        checkedPaths?: ReadonlySet<string>,
    ): Promise<TemplateFile[]> {
        const totalBytes = expected.reduce((sum, file) => sum + file.size, 0);
        let completedBytes = 0;
        let published = 0;
        report?.(status, { completedBytes, totalBytes });
        const files = await readTemplateTree(
            directory,
            true,
            undefined,
            captureMetadata,
            undefined,
            {
                files: checkedPaths,
                onBytes: (bytes) => {
                    completedBytes += bytes;
                    const now = Date.now();
                    if (now - published >= 100) {
                        published = now;
                        report?.(status, { completedBytes, totalBytes });
                    }
                },
            },
        );
        report?.(status, { completedBytes, totalBytes });
        return files;
    }

    /** Verifies the complete contents and permissions of one retained version.
     * @param directory - Original, imported copy or backup.
     * @param expected - Reviewed files relative to this version.
     * @param report - Optional active job progress reporter.
     * @param status - Phase for this content check.
     */
    private async assertFiles(
        directory: string,
        expected: TemplateFile[],
        report?: MigrationProgressReporter,
        status: TemplateMigrationVersionStatus = 'checking',
    ): Promise<void> {
        if (
            !(await templateLstat(directory)) ||
            templateFingerprint(
                await this.readCheckedFiles(
                    directory,
                    expected,
                    report,
                    status,
                ),
            ) !== templateFingerprint(expected)
        )
            throw new Error('exportTemplates:errors.changed');
    }
    /** Allows interrupted cleanup to remove only survivors that still match the reviewed originals.
     * @param directory - Job-owned copy or original backup.
     * @param expected - Reviewed files relative to this version.
     * @param report - Optional progress for the active move.
     */
    private async assertSurvivors(
        directory: string,
        expected: TemplateFile[],
        report?: MigrationProgressReporter,
    ): Promise<void> {
        const known = new Map(expected.map((file) => [file.relative, file]));
        const metadata = await readTemplateTree(directory, false);
        for (const file of await this.readCheckedFiles(
            directory,
            metadata,
            report,
            'cleaning',
        )) {
            const original = known.get(file.relative);
            if (
                !original ||
                original.hash !== file.hash ||
                original.size !== file.size ||
                original.mode !== file.mode
            )
                throw new Error('exportTemplates:errors.changed');
        }
    }
    /** Confirms the exact connection without traversing its target contents.
     * @param filename - Project-owned version link.
     * @param target - Main-owned destination.
     */
    private async assertLink(filename: string, target: string): Promise<void> {
        if (
            !(await templateLstat(filename))?.isSymbolicLink() ||
            (path.resolve(
                path.dirname(filename),
                await fs.promises.readlink(filename),
            ) !== path.resolve(target) &&
                (await fs.promises.realpath(filename)) !==
                    (await fs.promises.realpath(target))) ||
            !(await fs.promises.stat(filename)).isDirectory()
        )
            throw new Error('exportTemplates:errors.connection');
    }
}
