import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import type {
    ImportedTemplateBuild,
    ImportedTemplateInventory,
    ImportedTemplateLibrary,
    PreparedTemplateImport,
    ProjectDetails,
    RemoveImportedTemplateOptions,
    SelectedTemplateImport,
    TemplateImportProgress,
} from '@shared/contracts';
import { dialog } from 'electron';
import logger from 'electron-log';
import { AtomicJsonFileAdapter } from '../json-store/atomic-json-file.adapter.js';
import type { ProjectsStore } from '../projects/projects.store.js';
import {
    type SwitchJournal,
    switchJournalSchema,
} from './imported-template-switch.schema.js';
import {
    importedTemplateDirectoryName,
    importedTemplateFiles,
    importedTemplateRoot,
    readImportedTemplates,
    resolveImportedTemplate,
    writeImportedTemplates,
} from './imported-templates.store.js';
import {
    clearSavedProjectMigration,
    readSavedProjectMigration,
    type SavedProjectMigration,
    writeSavedProjectMigration,
} from './saved-project-migration.store.js';
import type { TemplateArchiveAdapter } from './template-archive.adapter.js';
import {
    checkTemplateCapacity,
    isSharedTemplateLink,
    isTemplateIdentity,
    readTemplateTree,
    templateFingerprint,
    templateLstat,
} from './template-files.util.js';
import { projectTemplateStorage } from './template-paths.util.js';
import { projectTemplateBuilds } from './template-projection.util.js';
import { getSharedTemplateRoot } from './template-runtime.util.js';

const layoutAdapter = new AtomicJsonFileAdapter();
const UUID_SOURCE =
    '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const UUID = new RegExp(`^${UUID_SOURCE}$`, 'i');
const ORPHAN_INCOMING = new RegExp(
    `^incoming-${UUID_SOURCE}-${UUID_SOURCE}$`,
    'i',
);

/** Owns complete-package imports and their project selections. Callers serialise mutations with the existing template queue. */
export class ImportedTemplatesService {
    private progress = new Map<string, TemplateImportProgress>();
    /** Returns the latest extraction counters for this selection.
     * @param token - Main-owned file selection token.
     */
    getProgress(token: string): TemplateImportProgress | null {
        return this.progress.get(token) ?? null;
    }
    private selected = new Map<string, SelectedTemplateImport>();
    private prepared = new Map<
        string,
        PreparedTemplateImport & { directory: string; contents: string }
    >();
    private preparing = new Map<
        string,
        {
            controller: AbortController;
            promise: Promise<PreparedTemplateImport>;
        }
    >();
    private discarding = new Map<string, Promise<void>>();
    private installing = new Set<string>();
    /** Receives existing project storage and archive validation.
     * @param projects - Canonical project store.
     * @param archives - Existing checked TPZ extractor.
     */
    constructor(
        private readonly projects: ProjectsStore,
        private readonly archives: TemplateArchiveAdapter,
    ) {}

    /** Reads library metadata and separates current usage from remembered choices. */
    async inventory(): Promise<ImportedTemplateInventory> {
        const library = await readImportedTemplates();
        const usage: Record<string, string[]> = {};
        const references: ImportedTemplateInventory['references'] = {};
        for (const build of library.builds) {
            usage[build.id] = [];
            references[build.id] = [];
        }
        for (const project of await this.projects.list()) {
            const currentSetId = this.identity(project);
            for (const [setId, selection] of Object.entries(
                project.exportTemplateBuilds ?? {},
            )) {
                const build = library.builds.find(
                    (item) => item.id === selection,
                );
                if (!build) continue;
                const active =
                    !!project.launch_path &&
                    project.release.source !== 'custom' &&
                    setId === currentSetId &&
                    setId === build.setId;
                references[build.id].push({
                    projectPath: project.path,
                    projectName: project.name,
                    currentSetId,
                    active,
                });
                if (active) usage[build.id].push(project.name);
            }
        }
        const builds = await Promise.all(
            library.builds.map(async (build) => ({
                ...build,
                available: await this.isBuildAvailable(build).catch((error) => {
                    logger.warn(
                        'Could not inspect imported template build',
                        error,
                    );
                    return false;
                }),
            })),
        );
        return { ...library, builds, usage, references };
    }

    /** Selects a TPZ without reading, copying or extracting its contents. */
    async choose(): Promise<SelectedTemplateImport | null> {
        const selection = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Godot export templates', extensions: ['tpz'] }],
        });
        if (selection.canceled || !selection.filePaths[0]) return null;
        const token = randomUUID();
        const selected = {
            token,
            sourcePath: selection.filePaths[0],
            archiveName: path.basename(selection.filePaths[0]),
        };
        this.selected.set(token, selected);
        return selected;
    }

    /** Validates the selected package in private staging when the user chooses Next.
     * @param token - Main-owned file selection token.
     */
    async prepare(token: string): Promise<PreparedTemplateImport> {
        const selected = this.selected.get(token);
        if (!selected) throw new Error('exportTemplates:errors.changed');
        if (
            this.preparing.has(token) ||
            this.discarding.has(token) ||
            this.installing.has(token)
        )
            throw new Error('exportTemplates:errors.busy');
        const existing = this.prepared.get(token);
        if (existing) {
            const {
                directory: _directory,
                contents: _contents,
                ...preview
            } = existing;
            return preview;
        }
        const controller = new AbortController();
        const promise = this.prepareSelected(
            token,
            selected,
            controller.signal,
        );
        this.preparing.set(token, { controller, promise });
        try {
            return await promise;
        } finally {
            this.preparing.delete(token);
        }
    }

    /** Extracts one selected archive and checks cancellation after every asynchronous step.
     * @param token - Process-owned selection token.
     * @param selected - Original file selection.
     * @param signal - Cancellation requested through discard.
     */
    private async prepareSelected(
        token: string,
        selected: SelectedTemplateImport,
        signal: AbortSignal,
    ): Promise<PreparedTemplateImport> {
        const directory = path.join(importedTemplateRoot(), '.staging', token);
        try {
            await fs.promises.mkdir(directory, { recursive: true });
            signal.throwIfAborted();
            const source = await fs.promises.stat(selected.sourcePath);
            signal.throwIfAborted();
            if (!source.isFile())
                throw new Error('exportTemplates:errors.archive');
            const extracted = await this.archives.extract(
                selected.sourcePath,
                path.join(directory, 'extracted'),
                signal,
                (completedBytes, totalBytes) => {
                    if (!signal.aborted)
                        this.progress.set(token, {
                            completedBytes,
                            totalBytes,
                        });
                },
            );
            signal.throwIfAborted();
            const after = await fs.promises.stat(selected.sourcePath);
            signal.throwIfAborted();
            if (
                source.size !== after.size ||
                source.mtimeMs !== after.mtimeMs ||
                source.ctimeMs !== after.ctimeMs ||
                source.ino !== after.ino ||
                source.dev !== after.dev
            )
                throw new Error('exportTemplates:errors.changed');
            const files = await readTemplateTree(extracted.contents);
            signal.throwIfAborted();
            const preview: PreparedTemplateImport = {
                token,
                archiveName: path.basename(selected.sourcePath),
                setId: extracted.identity,
                files: files
                    .map((file) => file.relative)
                    .filter((file) => file !== 'version.txt'),
                sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
            };
            this.prepared.set(token, {
                ...preview,
                directory,
                contents: extracted.contents,
            });
            return preview;
        } catch (error) {
            await fs.promises.rm(directory, { recursive: true, force: true });
            throw error;
        } finally {
            this.progress.delete(token);
        }
    }

    /** Removes only a process-owned preview that the user cancelled.
     * @param token - Preview token returned by the picker.
     */
    async discard(token: string): Promise<void> {
        const active = this.discarding.get(token);
        if (active) return active;
        if (this.installing.has(token))
            throw new Error('exportTemplates:errors.busy');
        const known =
            this.selected.has(token) ||
            this.preparing.has(token) ||
            this.prepared.has(token);
        if (!known) return;
        this.selected.delete(token);
        const pending = this.preparing.get(token);
        if (!pending && !this.prepared.has(token)) return;
        pending?.controller.abort(new Error('exportTemplates:errors.changed'));
        const promise = (async () => {
            await pending?.promise.catch(() => undefined);
            const preview = this.prepared.get(token);
            this.prepared.delete(token);
            await fs.promises.rm(
                preview?.directory ??
                    path.join(importedTemplateRoot(), '.staging', token),
                {
                    recursive: true,
                    force: true,
                },
            );
        })();
        this.discarding.set(token, promise);
        try {
            await promise;
        } finally {
            this.discarding.delete(token);
        }
    }

    /** Removes abandoned process-only staging during startup, after durable recovery. */
    async cleanupAbandonedPreviews(): Promise<void> {
        const staging = path.join(importedTemplateRoot(), '.staging');
        const root = await templateLstat(staging);
        if (!root) return;
        if (!root.isDirectory() || root.isSymbolicLink())
            throw new Error('exportTemplates:errors.unsafe');
        const active = new Set([
            ...this.selected.keys(),
            ...this.preparing.keys(),
            ...this.prepared.keys(),
            ...this.discarding.keys(),
            ...this.installing,
        ]);
        const journal = await layoutAdapter.read(
            path.join(importedTemplateRoot(), 'imported-template-switch.json'),
        );
        const canRemoveIncoming =
            journal === undefined && !this.installing.size;
        for (const name of await fs.promises.readdir(staging)) {
            const abandonedPreview = UUID.test(name) && !active.has(name);
            const abandonedIncoming =
                canRemoveIncoming && ORPHAN_INCOMING.test(name);
            if (!abandonedPreview && !abandonedIncoming) continue;
            const preview = path.join(staging, name);
            const stat = await templateLstat(preview);
            if (!stat) continue;
            if (!stat.isDirectory() || stat.isSymbolicLink())
                throw new Error('exportTemplates:errors.unsafe');
            await fs.promises.rm(preview, { recursive: true });
        }
    }

    /** Installs a new immutable revision and commits its library entry.
     * @param token - Process-owned validated package.
     * @param label - Name for a new build; ignored when replacing one.
     * @param replaceId - Existing library entry to replace as a whole.
     */
    async install(
        token: string,
        label: string,
        replaceId?: string,
    ): Promise<string> {
        if (
            this.preparing.has(token) ||
            this.discarding.has(token) ||
            this.installing.has(token)
        )
            throw new Error('exportTemplates:errors.busy');
        this.installing.add(token);
        try {
            return await this.installPrepared(token, label, replaceId);
        } finally {
            this.installing.delete(token);
        }
    }

    /** Commits a preview after its token has been reserved against cancellation.
     * @param token - Prepared package token.
     * @param label - Name for a new build; ignored when replacing one.
     * @param replaceId - Existing build to replace.
     */
    private async installPrepared(
        token: string,
        label: string,
        replaceId?: string,
    ): Promise<string> {
        const preview = this.prepared.get(token);
        if (!preview) throw new Error('exportTemplates:errors.changed');
        const library = await readImportedTemplates();
        const previous = replaceId
            ? library.builds.find((build) => build.id === replaceId)
            : undefined;
        if (replaceId && (!previous || previous.setId !== preview.setId))
            throw new Error('exportTemplates:library.incompatible');
        // Replacing a package changes its files, never its name or folder.
        label = previous?.label ?? this.label(label);
        this.assertUniqueLabel(
            library.builds,
            preview.setId,
            label,
            previous?.id,
        );
        const directoryName =
            previous?.directoryName ?? importedTemplateDirectoryName(label);
        await this.assertFolderAvailable(
            preview.setId,
            directoryName,
            library.builds,
            previous?.id,
        );
        const build = {
            id: previous?.id ?? randomUUID(),
            revision: randomUUID(),
            directoryName,
            label,
            setId: preview.setId,
            importedAt: new Date().toISOString(),
            archiveName: preview.archiveName,
            files: preview.files,
            sizeBytes: preview.sizeBytes,
        };
        const next: ImportedTemplateLibrary = {
            ...library,
            builds: [
                ...library.builds.filter((item) => item.id !== build.id),
                build,
            ],
        };
        const affected = await this.affected(library, next);
        const target = importedTemplateFiles(build);
        const parent = path.dirname(target);
        await fs.promises.mkdir(parent, { recursive: true });
        await checkTemplateCapacity(parent, preview.sizeBytes);
        if (previous) {
            const old = importedTemplateFiles(previous);
            const incoming = path.join(
                importedTemplateRoot(),
                '.staging',
                `incoming-${build.id}-${build.revision}`,
            );
            const backup = path.join(
                importedTemplateRoot(),
                '.staging',
                `backup-${build.id}-${previous.revision}`,
            );
            const stageParent = await templateLstat(path.dirname(incoming));
            if (
                stageParent &&
                (!stageParent.isDirectory() || stageParent.isSymbolicLink())
            )
                throw new Error('exportTemplates:errors.unsafe');
            if (
                !(await templateLstat(old))?.isDirectory() ||
                (await templateLstat(incoming)) ||
                (await templateLstat(backup))
            )
                throw new Error('exportTemplates:errors.recovery');
            await fs.promises.mkdir(path.dirname(incoming), {
                recursive: true,
            });
            const journalPath = path.join(
                importedTemplateRoot(),
                'imported-template-switch.json',
            );
            try {
                await fs.promises.cp(preview.contents, incoming, {
                    recursive: true,
                    errorOnExist: true,
                    force: false,
                });
                const source = templateFingerprint(
                    await readTemplateTree(preview.contents, true),
                );
                if (
                    source !==
                    templateFingerprint(await readTemplateTree(incoming, true))
                )
                    throw new Error('exportTemplates:errors.changed');
                const beforeFiles = await readTemplateTree(old, true);
                const journal: SwitchJournal = {
                    version: 1,
                    kind: 'replace',
                    id: build.id,
                    setId: build.setId,
                    beforeRevision: previous.revision,
                    afterRevision: build.revision,
                    beforeDirectoryName: previous.directoryName,
                    afterDirectoryName: directoryName,
                    beforeFingerprint: templateFingerprint(beforeFiles),
                    afterFingerprint: source,
                    beforeCleanupFiles: beforeFiles,
                };
                await layoutAdapter.write(
                    journalPath,
                    JSON.stringify(journal, null, 2),
                );
            } catch (error) {
                if ((await layoutAdapter.read(journalPath)) === undefined) {
                    const partial = await templateLstat(incoming);
                    if (partial) {
                        if (!partial.isDirectory() || partial.isSymbolicLink())
                            throw new Error('exportTemplates:errors.recovery');
                        await fs.promises.rm(incoming, { recursive: true });
                    }
                }
                throw error;
            }
            try {
                if (old === target) await fs.promises.rename(old, backup);
                await fs.promises.rename(incoming, target);
                await writeImportedTemplates(next);
                await this.synchronise(next, affected);
                await this.recoverSwitch();
            } catch (error) {
                await this.recoverSwitch();
                throw error;
            }
        } else {
            try {
                await fs.promises.cp(preview.contents, target, {
                    recursive: true,
                    errorOnExist: true,
                    force: false,
                });
                await this.commit(library, next, affected);
            } catch (error) {
                const saved = await readImportedTemplates();
                if (
                    !saved.builds.some(
                        (item) => item.revision === build.revision,
                    )
                )
                    await fs.promises.rm(target, {
                        recursive: true,
                        force: true,
                    });
                throw error;
            }
        }
        this.selected.delete(token);
        this.prepared.delete(token);
        await fs.promises
            .rm(preview.directory, { recursive: true, force: true })
            .catch((error) =>
                logger.warn('Could not clean completed import staging', error),
            );
        return build.id;
    }

    /** Copies local versions before committing project choices, then removes originals.
     * @param project - Project whose original files are being migrated.
     * @param local - Validated local template collection.
     */
    async saveProject(project: ProjectDetails, local: string): Promise<void> {
        await this.recoverSavedProjects();
        const before = await readImportedTemplates();
        const builds: SavedProjectMigration['builds'] = [];
        const selections = { ...project.exportTemplateBuilds };
        for (const setId of (await fs.promises.readdir(local)).filter(
            isTemplateIdentity,
        )) {
            const files = await readTemplateTree(path.join(local, setId), true);
            const label = await this.uniqueMigrationLabel(
                [...before.builds, ...builds.map((item) => item.build)],
                setId,
                this.label(project.name.slice(0, 80)),
            );
            const build: ImportedTemplateBuild = {
                id: randomUUID(),
                revision: randomUUID(),
                directoryName: importedTemplateDirectoryName(label),
                label,
                setId,
                importedAt: new Date().toISOString(),
                archiveName: '',
                files: files
                    .map((file) => file.relative)
                    .filter((name) => name !== 'version.txt'),
                sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
            };
            builds.push({ build, fingerprint: templateFingerprint(files) });
            selections[setId] = build.id;
        }
        const migration: SavedProjectMigration = {
            version: 1,
            projectPath: project.path,
            launchPath: project.launch_path,
            localPath: local,
            builds,
        };
        for (const { build } of builds) {
            if (await templateLstat(importedTemplateFiles(build)))
                throw new Error('exportTemplates:errors.changed');
        }
        await writeSavedProjectMigration(migration);
        try {
            await checkTemplateCapacity(
                importedTemplateRoot(),
                builds.reduce((sum, item) => sum + item.build.sizeBytes, 0),
            );
            for (const { build, fingerprint } of builds) {
                const source = path.join(local, build.setId);
                const target = importedTemplateFiles(build);
                await fs.promises.mkdir(path.dirname(target), {
                    recursive: true,
                });
                await fs.promises.cp(source, target, {
                    recursive: true,
                    errorOnExist: true,
                    force: false,
                });
                if (
                    !(await templateLstat(target))?.isDirectory() ||
                    templateFingerprint(
                        await readTemplateTree(source, true),
                    ) !== fingerprint ||
                    templateFingerprint(
                        await readTemplateTree(target, true),
                    ) !== fingerprint
                )
                    throw new Error('exportTemplates:errors.changed');
            }
            await writeImportedTemplates({
                ...before,
                builds: [...before.builds, ...builds.map(({ build }) => build)],
            });
            await this.projects.update((projects) =>
                projects.map((current) => {
                    if (current.path !== project.path) return current;
                    if (
                        current.launch_path !== project.launch_path ||
                        this.identity(current) !== this.identity(project)
                    )
                        throw new Error('exportTemplates:errors.changed');
                    return {
                        ...current,
                        exportTemplateMode: 'shared',
                        exportTemplateBuilds: selections,
                    };
                }),
            );
            await this.recoverSavedProjects();
        } catch (error) {
            // If the project write succeeded, recovery completes the committed migration.
            await this.recoverSavedProjects();
            const saved = (await this.projects.list()).find(
                (item) => item.path === project.path,
            );
            if (
                saved?.exportTemplateMode === 'shared' &&
                builds.every(
                    ({ build }) =>
                        saved.exportTemplateBuilds?.[build.setId] === build.id,
                )
            )
                return;
            throw error;
        }
    }

    /** Completes a committed save or removes uncommitted imported copies after interruption. */
    async recoverSavedProjects(): Promise<void> {
        const migration = await readSavedProjectMigration();
        if (!migration) {
            await this.recoverSwitch();
            return;
        }
        const editorDirectory = path.dirname(migration.launchPath);
        const storage = projectTemplateStorage(editorDirectory);
        if (
            !path.isAbsolute(migration.localPath) ||
            !path.isAbsolute(migration.projectPath) ||
            !path.isAbsolute(migration.launchPath) ||
            ![
                path.join(storage, 'official'),
                path.join(editorDirectory, 'editor_data', 'export_templates'),
            ].includes(migration.localPath)
        )
            throw new Error('exportTemplates:errors.recovery');
        const project = (await this.projects.list()).find(
            (item) => item.path === migration.projectPath,
        );
        const matching = project?.launch_path === migration.launchPath;
        const selected = migration.builds.map(
            ({ build }) =>
                project?.exportTemplateBuilds?.[build.setId] === build.id,
        );
        if (selected.some(Boolean) && (!matching || !selected.every(Boolean)))
            throw new Error('exportTemplates:errors.recovery');
        const committed =
            !!matching &&
            project?.exportTemplateMode === 'shared' &&
            selected.every(Boolean);
        const library = await readImportedTemplates();
        for (const { build } of migration.builds) {
            const registered = library.builds.find(
                (item) => item.id === build.id,
            );
            if (registered && registered.revision !== build.revision)
                throw new Error('exportTemplates:errors.recovery');
            if (committed && !registered)
                throw new Error('exportTemplates:errors.recovery');
        }
        if (committed) {
            if (!project) throw new Error('exportTemplates:errors.recovery');
            const local = await templateLstat(migration.localPath);
            let connected = !!local?.isSymbolicLink();
            if (
                connected &&
                !(await isSharedTemplateLink(
                    migration.localPath,
                    getSharedTemplateRoot(),
                ))
            )
                throw new Error('exportTemplates:errors.recovery');
            if (local && !connected && !local.isDirectory())
                throw new Error('exportTemplates:errors.recovery');
            if (local?.isDirectory() && !connected) {
                const names = await fs.promises.readdir(migration.localPath);
                if (
                    names.length &&
                    (
                        await Promise.all(
                            names.map((name) =>
                                templateLstat(
                                    path.join(migration.localPath, name),
                                ),
                            ),
                        )
                    ).every((entry) => entry?.isSymbolicLink())
                )
                    connected = true;
            }
            // An interrupted recursive removal may leave only some original files.
            // Verify each survivor against the complete imported copy.
            for (const { build, fingerprint } of migration.builds) {
                if (
                    !(
                        await templateLstat(importedTemplateFiles(build))
                    )?.isDirectory()
                )
                    throw new Error('exportTemplates:errors.recovery');
                const imported = await readTemplateTree(
                    importedTemplateFiles(build),
                    true,
                );
                if (templateFingerprint(imported) !== fingerprint)
                    throw new Error('exportTemplates:errors.recovery');
                if (!local || connected) continue;
                const source = path.join(migration.localPath, build.setId);
                if (!(await templateLstat(source))) continue;
                const known = new Map(
                    imported.map((file) => [file.relative, file]),
                );
                for (const file of await readTemplateTree(source, true)) {
                    const expected = known.get(file.relative);
                    if (
                        !expected ||
                        file.size !== expected.size ||
                        file.hash !== expected.hash ||
                        file.mode !== expected.mode
                    )
                        throw new Error('exportTemplates:errors.changed');
                }
            }
            if (local && !connected) {
                for (const { build } of migration.builds) {
                    const source = path.join(migration.localPath, build.setId);
                    if (await templateLstat(source))
                        await fs.promises.rm(source, { recursive: true });
                }
                try {
                    await fs.promises.rmdir(migration.localPath);
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                        throw error;
                }
            }
            await this.synchronise(library, [project]);
        } else {
            const local = await templateLstat(migration.localPath);
            if (!local?.isDirectory() || local.isSymbolicLink())
                throw new Error('exportTemplates:errors.recovery');
            for (const { build } of migration.builds) {
                if (
                    !(await templateLstat(
                        path.join(migration.localPath, build.setId),
                    ))
                )
                    throw new Error('exportTemplates:errors.recovery');
            }
            if (
                migration.builds.some(({ build }) =>
                    library.builds.some((item) => item.id === build.id),
                )
            )
                await writeImportedTemplates({
                    ...library,
                    builds: library.builds.filter(
                        (item) =>
                            !migration.builds.some(
                                ({ build }) => build.id === item.id,
                            ),
                    ),
                });
            for (const { build } of migration.builds) {
                const target = importedTemplateFiles(build);
                const stat = await templateLstat(target);
                if (stat) {
                    if (!stat.isDirectory() || stat.isSymbolicLink())
                        throw new Error('exportTemplates:errors.recovery');
                    await fs.promises.rm(target, { recursive: true });
                }
            }
        }
        await clearSavedProjectMigration();
        await this.recoverSwitch();
    }

    /** Refuses symlinked readable-layout parent folders.
     * @param setId - Godot version and edition folder.
     */
    private async assertReadableParent(setId: string): Promise<void> {
        const parent = path.join(importedTemplateRoot(), 'imported', setId);
        for (const ancestor of [path.dirname(parent), parent]) {
            const entry = await templateLstat(ancestor);
            if (entry && (!entry.isDirectory() || entry.isSymbolicLink()))
                throw new Error('exportTemplates:errors.unsafe');
        }
    }

    /** Resolves a switch path from validated journal components.
     * @param journal - Durable rename or replacement intent.
     * @param phase - Before or after the switch.
     */
    private switchPath(
        journal: SwitchJournal,
        phase: 'before' | 'after',
    ): string {
        return importedTemplateFiles({
            id: journal.id,
            revision:
                phase === 'before'
                    ? journal.beforeRevision
                    : journal.afterRevision,
            setId: journal.setId,
            directoryName:
                phase === 'before'
                    ? journal.beforeDirectoryName
                    : journal.afterDirectoryName,
        } as ImportedTemplateBuild);
    }

    /** Returns the hidden backup path for a same-folder replacement.
     * @param journal - Durable replacement intent.
     */
    private switchBackup(journal: SwitchJournal): string {
        return path.join(
            importedTemplateRoot(),
            '.staging',
            `backup-${journal.id}-${journal.beforeRevision}`,
        );
    }

    /** Returns the hidden incoming path for a replacement.
     * @param journal - Durable replacement intent.
     */
    private switchIncoming(journal: SwitchJournal): string {
        return path.join(
            importedTemplateRoot(),
            '.staging',
            `incoming-${journal.id}-${journal.afterRevision}`,
        );
    }

    /** Returns the temporary folder used to make a case-only rename durable.
     * @param journal - Durable rename intent.
     */
    private switchCaseStage(journal: SwitchJournal): string {
        return path.join(
            importedTemplateRoot(),
            '.staging',
            `case-${journal.id}-${journal.beforeRevision}`,
        );
    }

    /** Checks a retained package before recovery changes or removes it.
     * @param folder - Package folder.
     * @param expected - Fingerprint recorded before switching.
     */
    private async assertSwitchFingerprint(
        folder: string,
        expected: string,
    ): Promise<void> {
        if (
            !(await templateLstat(folder))?.isDirectory() ||
            templateFingerprint(await readTemplateTree(folder, true)) !==
                expected
        )
            throw new Error('exportTemplates:errors.recovery');
    }

    /** Checks a rename target without reading the package contents.
     * @param folder - Original, staged or renamed package folder.
     */
    private async assertRenameDirectory(folder: string): Promise<void> {
        const stat = await templateLstat(folder);
        if (!stat?.isDirectory() || stat.isSymbolicLink())
            throw new Error('exportTemplates:errors.recovery');
    }

    /** Allows resumed cleanup only for unchanged files from the recorded package.
     * @param folder - Old or incoming package being removed.
     * @param expected - Complete verified file snapshot before cleanup began.
     * @param fingerprint - Snapshot hash in the durable switch record.
     */
    private async assertSwitchCleanupFiles(
        folder: string,
        expected: NonNullable<SwitchJournal['beforeCleanupFiles']>,
        fingerprint: string,
    ): Promise<void> {
        if (templateFingerprint(expected) !== fingerprint)
            throw new Error('exportTemplates:errors.recovery');
        const known = new Map(expected.map((file) => [file.relative, file]));
        for (const file of await readTemplateTree(folder, true)) {
            const original = known.get(file.relative);
            if (
                !original ||
                file.size !== original.size ||
                file.hash !== original.hash ||
                file.mode !== original.mode
            )
                throw new Error('exportTemplates:errors.recovery');
        }
    }

    /** Resolves an interrupted rename or replacement from the committed registry. */
    private async recoverSwitch(): Promise<void> {
        const journalPath = path.join(
            importedTemplateRoot(),
            'imported-template-switch.json',
        );
        const raw = await layoutAdapter.read(journalPath);
        if (raw === undefined) return;
        const journal = switchJournalSchema.parse(JSON.parse(raw));
        await this.assertReadableParent(journal.setId);
        const staging = await templateLstat(
            path.join(importedTemplateRoot(), '.staging'),
        );
        if (staging && (!staging.isDirectory() || staging.isSymbolicLink()))
            throw new Error('exportTemplates:errors.unsafe');
        const library = await readImportedTemplates();
        const current = library.builds.find((item) => item.id === journal.id);
        if (!current || current.setId !== journal.setId)
            throw new Error('exportTemplates:errors.recovery');
        const before = this.switchPath(journal, 'before');
        const after = this.switchPath(journal, 'after');
        const committed =
            current.revision === journal.afterRevision &&
            current.directoryName === journal.afterDirectoryName;
        const uncommitted =
            current.revision === journal.beforeRevision &&
            current.directoryName === journal.beforeDirectoryName;
        if (!committed && !uncommitted)
            throw new Error('exportTemplates:errors.recovery');
        if (journal.kind === 'rename') {
            const caseOnly =
                journal.beforeDirectoryName !== journal.afterDirectoryName &&
                journal.beforeDirectoryName.normalize('NFKC').toLowerCase() ===
                    journal.afterDirectoryName.normalize('NFKC').toLowerCase();
            if (caseOnly) {
                const parent = path.dirname(before);
                const key = journal.beforeDirectoryName
                    .normalize('NFKC')
                    .toLowerCase();
                const entries = (await fs.promises.readdir(parent)).filter(
                    (name) => name.normalize('NFKC').toLowerCase() === key,
                );
                if (entries.length > 1)
                    throw new Error('exportTemplates:errors.recovery');
                const actual = entries[0]
                    ? path.join(parent, entries[0])
                    : undefined;
                const stage = this.switchCaseStage(journal);
                const stageParent = await templateLstat(path.dirname(stage));
                if (
                    stageParent &&
                    (!stageParent.isDirectory() || stageParent.isSymbolicLink())
                )
                    throw new Error('exportTemplates:errors.unsafe');
                const staged = await templateLstat(stage);
                if (actual && staged)
                    throw new Error('exportTemplates:errors.recovery');
                const expected = committed ? after : before;
                if (actual) {
                    await this.assertRenameDirectory(actual);
                    if (actual !== expected) {
                        await fs.promises.rename(actual, stage);
                        await fs.promises.rename(stage, expected);
                    }
                } else if (staged) {
                    await this.assertRenameDirectory(stage);
                    await fs.promises.rename(stage, expected);
                } else throw new Error('exportTemplates:errors.recovery');
                await this.assertRenameDirectory(expected);
            } else {
                if (
                    (await templateLstat(before)) &&
                    (await templateLstat(after))
                )
                    throw new Error('exportTemplates:errors.recovery');
                if (
                    committed &&
                    !(await templateLstat(after)) &&
                    (await templateLstat(before))
                ) {
                    await this.assertRenameDirectory(before);
                    await fs.promises.rename(before, after);
                }
                if (
                    uncommitted &&
                    !(await templateLstat(before)) &&
                    (await templateLstat(after))
                ) {
                    await this.assertRenameDirectory(after);
                    await fs.promises.rename(after, before);
                }
                await this.assertRenameDirectory(committed ? after : before);
            }
        } else {
            const backup = this.switchBackup(journal);
            const incoming = this.switchIncoming(journal);
            if (committed) {
                if (
                    !(await templateLstat(after)) &&
                    (await templateLstat(incoming))
                ) {
                    await this.assertSwitchFingerprint(
                        incoming,
                        journal.afterFingerprint,
                    );
                    await fs.promises.rename(incoming, after);
                }
                await this.assertSwitchFingerprint(
                    after,
                    journal.afterFingerprint,
                );
            } else if (await templateLstat(backup)) {
                await this.assertSwitchFingerprint(
                    backup,
                    journal.beforeFingerprint,
                );
                if (await templateLstat(after)) {
                    await this.assertSwitchFingerprint(
                        after,
                        journal.afterFingerprint,
                    );
                    if (await templateLstat(incoming))
                        throw new Error('exportTemplates:errors.recovery');
                    await fs.promises.rename(after, incoming);
                }
                await fs.promises.rename(backup, before);
            } else if (before !== after && (await templateLstat(after))) {
                await this.assertSwitchFingerprint(
                    after,
                    journal.afterFingerprint,
                );
                if (await templateLstat(incoming))
                    throw new Error('exportTemplates:errors.recovery');
                await fs.promises.rename(after, incoming);
            }
            await this.assertSwitchFingerprint(
                committed ? after : before,
                committed
                    ? journal.afterFingerprint
                    : journal.beforeFingerprint,
            );
        }
        const affectedProjects = (await this.projects.list()).filter(
            (project) =>
                project.launch_path &&
                project.release.source !== 'custom' &&
                this.identity(project) === journal.setId &&
                project.exportTemplateBuilds?.[journal.setId] === journal.id,
        );
        await this.synchronise(library, affectedProjects);
        if (!committed && journal.kind === 'replace') {
            const incoming = this.switchIncoming(journal);
            const stat = await templateLstat(incoming);
            if (stat) {
                if (!stat.isDirectory() || stat.isSymbolicLink())
                    throw new Error('exportTemplates:errors.recovery');
                let expected = journal.rollbackCleanupFiles;
                if (!expected) {
                    expected = await readTemplateTree(incoming, true);
                    if (
                        templateFingerprint(expected) !==
                        journal.afterFingerprint
                    )
                        throw new Error('exportTemplates:errors.recovery');
                    await layoutAdapter.write(
                        journalPath,
                        JSON.stringify({
                            ...journal,
                            rollbackCleanupFiles: expected,
                        }),
                    );
                }
                await this.assertSwitchCleanupFiles(
                    incoming,
                    expected,
                    journal.afterFingerprint,
                );
                await fs.promises.rm(incoming, { recursive: true });
            }
        }
        if (committed && journal.kind === 'replace') {
            const old = before === after ? this.switchBackup(journal) : before;
            const stat = await templateLstat(old);
            if (stat) {
                if (!stat.isDirectory() || stat.isSymbolicLink())
                    throw new Error('exportTemplates:errors.recovery');
                let expected = journal.beforeCleanupFiles;
                if (!expected) {
                    expected = await readTemplateTree(old, true);
                    if (
                        templateFingerprint(expected) !==
                        journal.beforeFingerprint
                    )
                        throw new Error('exportTemplates:errors.recovery');
                    await layoutAdapter.write(
                        journalPath,
                        JSON.stringify({
                            ...journal,
                            beforeCleanupFiles: expected,
                        }),
                    );
                }
                await this.assertSwitchCleanupFiles(
                    old,
                    expected,
                    journal.beforeFingerprint,
                );
                await fs.promises.rm(old, { recursive: true });
            }
        }
        await fs.promises.rm(journalPath, { force: true });
    }

    /** Renames a build and reconnects selected projects without reading package contents.
     * @param id - Stable imported ID.
     * @param label - New display name.
     */
    async rename(id: string, label: string): Promise<void> {
        const library = await readImportedTemplates();
        const build = library.builds.find((item) => item.id === id);
        if (!build) throw new Error('exportTemplates:library.missing');
        const nextLabel = this.label(label);
        this.assertUniqueLabel(library.builds, build.setId, nextLabel, id);
        const directoryName = importedTemplateDirectoryName(nextLabel);
        await this.assertFolderAvailable(
            build.setId,
            directoryName,
            library.builds,
            id,
        );
        const next = {
            ...library,
            builds: library.builds.map((item) =>
                item.id === id
                    ? { ...item, label: nextLabel, directoryName }
                    : item,
            ),
        };
        if (directoryName === build.directoryName) {
            await writeImportedTemplates(next);
            return;
        }
        const old = importedTemplateFiles(build);
        const target = importedTemplateFiles({ ...build, directoryName });
        const caseOnly =
            build.directoryName.normalize('NFKC').toLowerCase() ===
            directoryName.normalize('NFKC').toLowerCase();
        const original = await templateLstat(old);
        if (
            !original?.isDirectory() ||
            original.isSymbolicLink() ||
            ((await templateLstat(target)) && !caseOnly)
        )
            throw new Error('exportTemplates:library.folderConflict');
        const active = (await this.projects.list()).filter(
            (project) =>
                !!project.launch_path &&
                project.release.source !== 'custom' &&
                this.identity(project) === build.setId &&
                project.exportTemplateBuilds?.[build.setId] === id,
        );
        const journal: SwitchJournal = {
            version: 1,
            kind: 'rename',
            id,
            setId: build.setId,
            beforeRevision: build.revision,
            afterRevision: build.revision,
            beforeDirectoryName: build.directoryName,
            afterDirectoryName: directoryName,
        };
        const journalPath = path.join(
            importedTemplateRoot(),
            'imported-template-switch.json',
        );
        const caseStage = this.switchCaseStage(journal);
        if (caseOnly) {
            const stageParent = path.dirname(caseStage);
            const stageStat = await templateLstat(stageParent);
            if (
                stageStat &&
                (!stageStat.isDirectory() || stageStat.isSymbolicLink())
            )
                throw new Error('exportTemplates:errors.unsafe');
            if (await templateLstat(caseStage))
                throw new Error('exportTemplates:errors.recovery');
            await fs.promises.mkdir(stageParent, { recursive: true });
        }
        await layoutAdapter.write(
            journalPath,
            JSON.stringify(journal, null, 2),
        );
        try {
            if (caseOnly) {
                await fs.promises.rename(old, caseStage);
                await fs.promises.rename(caseStage, target);
            } else await fs.promises.rename(old, target);
            await writeImportedTemplates(next);
            await this.synchronise(next, active);
            await this.recoverSwitch();
        } catch (error) {
            await this.recoverSwitch();
            throw error;
        }
    }

    /** Replaces every saved reference before removing the old build and files.
     * @param id - Library ID explicitly confirmed for deletion.
     * @param options - Reviewed replacement and exact reference snapshot.
     */
    async remove(
        id: string,
        options?: RemoveImportedTemplateOptions,
    ): Promise<void> {
        const library = await readImportedTemplates();
        const previous = library.builds.find((build) => build.id === id);
        if (!previous) throw new Error('exportTemplates:library.missing');
        const projects = await this.projects.list();
        const referenced = projects.filter((project) =>
            Object.values(project.exportTemplateBuilds ?? {}).includes(id),
        );
        const currentReferences = referenced.map((project) => ({
            projectPath: project.path,
            currentSetId: this.identity(project),
            active:
                !!project.launch_path &&
                project.release.source !== 'custom' &&
                this.identity(project) === previous.setId &&
                project.exportTemplateBuilds?.[previous.setId] === id,
        }));
        if (!options && referenced.length)
            throw new Error('exportTemplates:library.inUse');
        const replacement = options?.replacement;
        if (options) {
            if (
                options.revision !== previous.revision ||
                !Array.isArray(options.references) ||
                options.references.length !== currentReferences.length ||
                new Set(options.references.map((item) => item?.projectPath))
                    .size !== options.references.length ||
                options.references.some(
                    (item) =>
                        !item ||
                        typeof item.projectPath !== 'string' ||
                        typeof item.currentSetId !== 'string' ||
                        typeof item.active !== 'boolean' ||
                        !currentReferences.some(
                            (current) =>
                                current.projectPath === item.projectPath &&
                                current.currentSetId === item.currentSetId &&
                                current.active === item.active,
                        ),
                )
            )
                throw new Error('exportTemplates:errors.changed');
            if (typeof replacement !== 'string' || replacement === id)
                throw new Error('exportTemplates:library.incompatible');
            if (replacement !== 'official') {
                const alternative = library.builds.find(
                    (build) => build.id === replacement,
                );
                if (!alternative)
                    throw new Error('exportTemplates:library.missing');
                if (alternative.setId !== previous.setId)
                    throw new Error('exportTemplates:library.incompatible');
                const available = await this.isBuildAvailable(
                    alternative,
                ).catch((error) => {
                    logger.warn(
                        'Could not inspect replacement template build',
                        error,
                    );
                    return false;
                });
                if (!available)
                    throw new Error('exportTemplates:library.missing');
            }
        }
        if (
            referenced.some((project) =>
                Object.entries(project.exportTemplateBuilds ?? {}).some(
                    ([setId, selection]) =>
                        selection === id && setId !== previous.setId,
                ),
            )
        )
            throw new Error('exportTemplates:errors.changed');
        const active = referenced.filter(
            (project) =>
                !!project.launch_path &&
                project.release.source !== 'custom' &&
                this.identity(project) === previous.setId,
        );
        const next = {
            ...library,
            builds: library.builds.filter((build) => build.id !== id),
        };
        if (referenced.length) {
            const expected = new Map(
                referenced.map((project) => [project.path, project]),
            );
            const chosen = replacement as string;
            try {
                const saved = await this.projects.update((current) => {
                    const currentReferences = current.filter((project) =>
                        Object.values(
                            project.exportTemplateBuilds ?? {},
                        ).includes(id),
                    );
                    if (
                        currentReferences.length !== referenced.length ||
                        currentReferences.some((project) => {
                            const earlier = expected.get(project.path);
                            return (
                                !earlier ||
                                project.exportTemplateBuilds?.[
                                    previous.setId
                                ] !== id ||
                                project.launch_path !== earlier.launch_path ||
                                this.identity(project) !==
                                    this.identity(earlier) ||
                                project.release.source !==
                                    earlier.release.source
                            );
                        })
                    )
                        throw new Error('exportTemplates:errors.changed');
                    return current.map((project) =>
                        expected.has(project.path)
                            ? {
                                  ...project,
                                  exportTemplateBuilds: {
                                      ...project.exportTemplateBuilds,
                                      [previous.setId]: chosen,
                                  },
                              }
                            : project,
                    );
                });
                await this.synchronise(
                    library,
                    saved.filter((project) =>
                        active.some((item) => item.path === project.path),
                    ),
                );
                await writeImportedTemplates(next);
            } catch (error) {
                let registered: boolean;
                try {
                    registered = (await readImportedTemplates()).builds.some(
                        (build) =>
                            build.id === id &&
                            build.revision === previous.revision,
                    );
                } catch (readError) {
                    logger.warn(
                        'Could not determine imported template removal state',
                        readError,
                    );
                    // The saved replacement remains valid with either registry state.
                    throw error;
                }
                if (!registered) {
                    // The registry commit completed despite the reported error.
                    await fs.promises.rm(importedTemplateFiles(previous), {
                        recursive: true,
                        force: true,
                    });
                    return;
                }
                let savedProjects: ProjectDetails[];
                try {
                    savedProjects = await this.projects.list();
                } catch (readError) {
                    logger.warn(
                        'Could not read imported template project choices after failure',
                        readError,
                    );
                    throw error;
                }
                if (
                    !savedProjects.some(
                        (project) =>
                            expected.has(project.path) &&
                            project.exportTemplateBuilds?.[previous.setId] ===
                                chosen,
                    )
                )
                    throw error;
                try {
                    const restored = await this.projects.update((current) =>
                        current.map((project) =>
                            expected.has(project.path) &&
                            project.exportTemplateBuilds?.[previous.setId] ===
                                chosen
                                ? {
                                      ...project,
                                      exportTemplateBuilds: {
                                          ...project.exportTemplateBuilds,
                                          [previous.setId]: id,
                                      },
                                  }
                                : project,
                        ),
                    );
                    await this.synchronise(
                        library,
                        restored.filter((project) =>
                            active.some((item) => item.path === project.path),
                        ),
                    );
                } catch (rollbackError) {
                    logger.warn(
                        'Could not restore imported template references',
                        rollbackError,
                    );
                }
                throw error;
            }
        } else {
            await writeImportedTemplates(next);
        }
        await fs.promises.rm(importedTemplateFiles(previous), {
            recursive: true,
            force: true,
        });
    }

    /** Saves version-specific choices and reconnects only this project.
     * @param projectPath - Registered project identity.
     * @param choices - Changed choices, merged with existing saved versions.
     */
    async select(
        projectPath: string,
        choices: Record<string, string>,
    ): Promise<void> {
        if (!choices || typeof choices !== 'object' || Array.isArray(choices))
            throw new Error('exportTemplates:errors.decision');
        const library = await readImportedTemplates();
        for (const [setId, selection] of Object.entries(choices)) {
            if (!isTemplateIdentity(setId) || typeof selection !== 'string')
                throw new Error('exportTemplates:errors.decision');
            const build = resolveImportedTemplate(library, setId, selection);
            if (
                build &&
                !(await this.isBuildAvailable(build).catch((error) => {
                    logger.warn(
                        'Could not inspect selected template build',
                        error,
                    );
                    return false;
                }))
            )
                throw new Error('exportTemplates:library.missing');
        }
        const project = (await this.projects.list()).find(
            (item) => item.path === projectPath,
        );
        if (!project?.launch_path || project.release.source === 'custom')
            throw new Error('exportTemplates:errors.connection');
        const next = {
            ...project,
            exportTemplateBuilds: {
                ...project.exportTemplateBuilds,
                ...choices,
            },
        };
        await this.projects.update((projects) =>
            projects.map((item) => {
                if (item.path !== projectPath) return item;
                if (item.launch_path !== project.launch_path)
                    throw new Error('exportTemplates:errors.changed');
                return {
                    ...item,
                    exportTemplateBuilds: next.exportTemplateBuilds,
                };
            }),
        );
        try {
            await this.synchronise(library, [next]);
        } catch (error) {
            await this.projects.update((projects) =>
                projects.map((item) =>
                    item.path === projectPath
                        ? {
                              ...item,
                              exportTemplateBuilds:
                                  project.exportTemplateBuilds,
                          }
                        : item,
                ),
            );
            await this.synchronise(library, [project]);
            throw error;
        }
    }

    /** Rebuilds views from authoritative choices, including after a restart.
     * @param library - Current metadata.
     * @param projects - Projects to connect; defaults to all registered projects.
     */
    async synchronise(
        library?: ImportedTemplateLibrary,
        projects?: ProjectDetails[],
    ): Promise<void> {
        const targets = projects ?? (await this.projects.list());
        const needsImports = targets.some((project) => {
            if (!project.launch_path || project.release.source === 'custom')
                return false;
            const choice =
                project.exportTemplateBuilds?.[this.identity(project)];
            return choice && choice !== 'official';
        });
        const current =
            library ??
            (needsImports
                ? await readImportedTemplates()
                : { schemaVersion: 1 as const, builds: [] });
        for (const project of targets) {
            if (!project.launch_path || project.release.source === 'custom')
                continue;
            await projectTemplateBuilds(
                path.dirname(project.launch_path),
                getSharedTemplateRoot(),
                current,
                project.exportTemplateBuilds,
                this.identity(project),
            );
        }
    }

    /** Commits metadata before links so interrupted work can be completed on the next launch.
     * @param previous - Registry to restore if reconnecting fails.
     * @param next - Desired registry.
     * @param projects - Affected project views.
     */
    private async commit(
        previous: ImportedTemplateLibrary,
        next: ImportedTemplateLibrary,
        projects: ProjectDetails[],
    ): Promise<void> {
        await writeImportedTemplates(next);
        try {
            await this.synchronise(next, projects);
        } catch (error) {
            await writeImportedTemplates(previous);
            await this.synchronise(previous, projects);
            throw error;
        }
    }

    /** Finds projects whose resolved imported revision changes.
     * @param previous - Registry before the operation.
     * @param next - Registry after the operation.
     */
    private async affected(
        previous: ImportedTemplateLibrary,
        next: ImportedTemplateLibrary,
    ): Promise<ProjectDetails[]> {
        const affected: ProjectDetails[] = [];
        for (const project of await this.projects.list()) {
            if (!project.launch_path || project.release.source === 'custom')
                continue;
            const id = this.identity(project);
            const selection = project.exportTemplateBuilds?.[id];
            const before = previous.builds.find(
                (build) => build.id === selection && build.setId === id,
            );
            const after = next.builds.find(
                (build) => build.id === selection && build.setId === id,
            );
            if (before?.revision !== after?.revision) affected.push(project);
        }
        return affected;
    }

    /** Checks that a build directory contains every recorded package file.
     * @param build - Imported build whose immutable files are being offered.
     */
    async isBuildAvailable(build: ImportedTemplateBuild): Promise<boolean> {
        const target = importedTemplateFiles(build);
        if (
            !build.files.length ||
            new Set(build.files).size !== build.files.length ||
            !(await templateLstat(target))?.isDirectory()
        )
            return false;
        const actual = new Set(
            (await readTemplateTree(target, false)).map(
                (file) => file.relative,
            ),
        );
        return build.files.every((file) => actual.has(file));
    }

    /** Computes the matching version/edition key.
     * @param project - Saved editor identity.
     */
    private identity(project: ProjectDetails): string {
        return `${project.release.version.replace('-', '.')}${project.release.mono ? '.mono' : ''}`;
    }
    /** Validates a label at the main-process boundary.
     * @param value - User-provided label.
     */
    private label(value: string): string {
        if (
            typeof value !== 'string' ||
            !value.trim() ||
            value.trim().length > 80 ||
            [...value].some((character) => character.charCodeAt(0) < 32)
        )
            throw new Error('exportTemplates:library.invalidLabel');
        return value.trim();
    }

    /** Refuses a duplicate display name within one Godot version and edition. */
    private assertUniqueLabel(
        builds: ImportedTemplateBuild[],
        setId: string,
        label: string,
        exceptId?: string,
    ): void {
        const key = label.normalize('NFKC').toLowerCase();
        if (
            builds.some(
                (build) =>
                    build.setId === setId &&
                    build.id !== exceptId &&
                    build.label.normalize('NFKC').toLowerCase() === key,
            )
        )
            throw new Error('exportTemplates:library.duplicateLabel');
    }

    /** Refuses a portable folder collision, including unregistered on-disk entries.
     * @param setId - Godot version and edition.
     * @param directoryName - Proposed stored folder component.
     * @param builds - Registered builds being checked.
     * @param exceptId - Existing build allowed to keep its exact folder.
     */
    private async assertFolderAvailable(
        setId: string,
        directoryName: string,
        builds: ImportedTemplateBuild[],
        exceptId?: string,
    ): Promise<void> {
        const key = directoryName.normalize('NFKC').toLowerCase();
        if (
            builds.some(
                (build) =>
                    build.setId === setId &&
                    build.id !== exceptId &&
                    build.directoryName.normalize('NFKC').toLowerCase() === key,
            )
        )
            throw new Error('exportTemplates:library.folderConflict');
        const parent = path.join(importedTemplateRoot(), 'imported', setId);
        await this.assertReadableParent(setId);
        let entries: string[];
        try {
            entries = await fs.promises.readdir(parent);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
        }
        const own = builds.find(
            (build) => build.id === exceptId && build.setId === setId,
        )?.directoryName;
        if (
            entries.some(
                (entry) =>
                    entry.normalize('NFKC').toLowerCase() === key &&
                    entry !== own,
            )
        )
            throw new Error('exportTemplates:library.folderConflict');
    }

    /** Gives automatically migrated project packages distinct labels and folders.
     * @param builds - Current and planned imported builds.
     * @param setId - Godot version and edition.
     * @param base - Preferred project-derived tag.
     */
    private async uniqueMigrationLabel(
        builds: ImportedTemplateBuild[],
        setId: string,
        base: string,
    ): Promise<string> {
        let candidate = base;
        for (let index = 2; ; index++) {
            try {
                this.assertUniqueLabel(builds, setId, candidate);
                await this.assertFolderAvailable(
                    setId,
                    importedTemplateDirectoryName(candidate),
                    builds,
                );
                return candidate;
            } catch (failure) {
                if (
                    !(failure instanceof Error) ||
                    ![
                        'exportTemplates:library.duplicateLabel',
                        'exportTemplates:library.folderConflict',
                    ].includes(failure.message)
                )
                    throw failure;
            }
            const suffix = ` (${index})`;
            candidate = `${base.slice(0, 80 - suffix.length).trimEnd()}${suffix}`;
        }
    }
}
