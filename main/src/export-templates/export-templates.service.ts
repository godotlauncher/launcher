import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    ExportTemplateInventory,
    ExportTemplateSet,
    ProjectDetails,
    TemplateJob,
    TemplateMigrationAssessment,
    TemplateMigrationBackup,
    TemplateMigrationChoice,
    TemplateMigrationFile,
    TemplatePackage,
    TemplateProjectAssessment,
    TemplateReview,
} from '@shared/contracts';
import { dialog, shell } from 'electron';
import logger from 'electron-log';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorCatalogService } from '../editor-catalog/editor-catalog.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from '../projects/projects.store.js';
import { resolveArchiveIntegrity } from '../utils/archive-integrity.util.js';
import { downloadReleaseAsset } from '../utils/releases.utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TemplateArchiveAdapter } from './template-archive.adapter.js';
import {
    assessProjectTemplates,
    isTemplateHousekeeping,
} from './template-assessment.util.js';
import {
    areTemplateConnectionsActive,
    areTemplatesMutating,
    checkTemplateCapacity,
    connectEmptyTemplateFolder,
    isTemplateIdentity,
    readTemplateTree,
    setTemplatesMutating,
    sumTemplateFiles,
    templateChild,
    templateConnectionStatus,
    templateFingerprint,
    templateLstat,
} from './template-files.util.js';
import {
    extractTemplateRange,
    openTemplateRange,
    type TemplateRangeIndex,
} from './template-range.adapter.js';
import {
    getSharedTemplateRoot,
    rememberSeparateTemplateDirectory,
} from './template-runtime.util.js';
import {
    commitTemplateTransaction,
    discardTemplateMigration,
    type PreparedTemplateSet,
    readTemplateJournal,
    recoverTemplateTransaction,
    restoreTemplateMigration,
    stageTemplateSets,
    type TemplateJournal,
} from './template-transaction.util.js';

const OPERATION_ID =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const TERMINAL = new Set<TemplateJob['stage']>([
    'complete',
    'cancelled',
    'error',
]);
type Work = {
    id: string;
    root: string;
    directory: string;
    signal: AbortController;
    sets: PreparedTemplateSet[];
    project?: ProjectDetails;
    sourceHash?: string;
    migrationChoice?: TemplateMigrationChoice;
    metadata?: string[];
    requiredDecisions?: Set<string>;
    migrationSetIds?: string[];
    emptyConnectionStatus?: 'local' | 'missing';
    affectedProjects?: string[];
    affectedProjectPaths?: string[];
    sourceBytes?: number;
};

/** Owns inventory and explicitly requested template operations. */
@Injectable()
export class ExportTemplatesService {
    private job: TemplateJob | null = null;
    private work?: Work;
    private starting = false;
    private inspection?: AbortController;
    private tasks = new Map<
        string,
        { job: TemplateJob; action: () => Promise<void> }
    >();
    private waiting: string[] = [];
    private running: string | null = null;
    private pumping = false;
    private packageIndexes = new Map<string, Promise<TemplateRangeIndex>>();
    private packageSnapshots = new Map<
        string,
        {
            index?: TemplateRangeIndex;
            cacheKey: string;
            id: string;
            before: PreparedTemplateSet['before'];
            existed: boolean;
        }
    >();
    /** Creates the template service.
     * @param catalog - Official release catalogue.
     * @param projects - Current registered projects.
     * @param templateArchives - Godot template package validation and extraction.
     */
    constructor(
        private readonly catalog: EditorCatalogService,
        private readonly projects: ProjectsStore,
        private readonly templateArchives: TemplateArchiveAdapter,
    ) {}

    /** Lists migration candidates using metadata only, without network requests. */
    async getMigrationAssessment(): Promise<TemplateMigrationAssessment> {
        const projects = await this.projects.list();
        const recoveryIds = await this.recoveries();
        const assessments: TemplateProjectAssessment[] = [];
        for (const project of projects) {
            const assessment = await assessProjectTemplates(
                project,
                getSharedTemplateRoot(),
            );
            assessments.push(
                this.migrationAvailability(assessment, recoveryIds),
            );
        }
        return {
            projects: assessments,
            pendingCount: assessments.filter((item) => item.pending).length,
            recoveryIds,
            backups: await this.migrationBackups(),
        };
    }

    /** Compares one registered project without changing templates or preferences.
     * @param projectPath - Canonical project identity from the UI.
     * @param contents - Whether to verify matching contents after the metadata listing.
     */
    async inspectProjectTemplates(
        projectPath: string,
        contents = true,
    ): Promise<TemplateProjectAssessment> {
        this.inspection?.abort();
        const inspection = new AbortController();
        this.inspection = inspection;
        const project = await this.assessmentProject(projectPath);
        const recoveryIds = await this.recoveries();
        const busy = this.templatesBusy() || recoveryIds.length > 0;
        const assessment = await assessProjectTemplates(
            project,
            getSharedTemplateRoot(),
            busy ? false : contents ? true : 'metadata',
            inspection.signal,
        );
        return this.migrationAvailability(assessment, recoveryIds);
    }

    /** Stops advisory file reads when the selected project or dialog changes. */
    async cancelTemplateInspection(): Promise<void> {
        this.inspection?.abort();
    }

    /** Lists completed migrations without reading template contents. */
    private async migrationBackups(): Promise<TemplateMigrationBackup[]> {
        if (!(await templateLstat(getSharedTemplateRoot()))) return [];
        const root = await fs.promises.realpath(getSharedTemplateRoot());
        const parent = this.workParent(root);
        const stat = await templateLstat(parent);
        if (!stat) return [];
        if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new Error('exportTemplates:errors.unsafe');
        const projects = await this.projects.list();
        const backups: TemplateMigrationBackup[] = [];
        for (const id of await fs.promises.readdir(parent)) {
            if (!OPERATION_ID.test(id)) continue;
            const directory = path.join(parent, id);
            const entry = await templateLstat(directory);
            if (!entry?.isDirectory() || entry.isSymbolicLink()) continue;
            try {
                const journal = await readTemplateJournal(directory);
                if (
                    journal.phase === 'complete' &&
                    journal.retainBackup &&
                    journal.projectPath
                ) {
                    backups.push({
                        id,
                        projectPath: journal.projectPath,
                        projectName:
                            projects.find(
                                (project) =>
                                    project.path === journal.projectPath,
                            )?.name ?? path.basename(journal.projectPath),
                        sizeBytes: journal.backupBytes ?? 0,
                        sets: journal.sets
                            .filter((set) => set.before !== set.after)
                            .map((set) => set.id),
                    });
                }
            } catch {
                /* Invalid journals remain available through recovery. */
            }
        }
        return backups;
    }

    /** Restores a completed migration and keeps the project separate afterwards.
     * @param backupId - Main-owned retained migration identity.
     */
    async restoreMigration(backupId: string): Promise<void> {
        await this.finishMigrationBackup(backupId, true);
    }

    /** Removes originals only after explicit cleanup confirmation.
     * @param backupId - Main-owned retained migration identity.
     */
    async discardMigrationBackup(backupId: string): Promise<void> {
        await this.finishMigrationBackup(backupId, false);
    }

    /** Serialises restore and cleanup with all template mutations.
     * @param backupId - Retained migration identity.
     * @param restore - Restore originals instead of permanently removing them.
     */
    private async finishMigrationBackup(
        backupId: string,
        restore: boolean,
    ): Promise<void> {
        if (this.templatesBusy())
            throw new Error('exportTemplates:errors.busy');
        this.starting = true;
        setTemplatesMutating(true);
        this.inspection?.abort();
        try {
            if ((await this.recoveries()).length)
                throw new Error('exportTemplates:errors.recovery');
            if (
                !OPERATION_ID.test(backupId) ||
                !(await this.migrationBackups()).some(
                    (backup) => backup.id === backupId,
                )
            )
                throw new Error('exportTemplates:errors.changed');
            const root = await fs.promises.realpath(getSharedTemplateRoot());
            const directory = path.join(this.workParent(root), backupId);
            if (restore) {
                const journal = await readTemplateJournal(directory);
                await restoreTemplateMigration(
                    root,
                    directory,
                    getSharedTemplateRoot(),
                    async () => {
                        await this.projects.update(async (projects) => {
                            const project = projects.find(
                                (item) => item.path === journal.projectPath,
                            );
                            if (
                                !project ||
                                !journal.localPath ||
                                path.join(
                                    await fs.promises.realpath(
                                        path.dirname(this.local(project)),
                                    ),
                                    'export_templates',
                                ) !== journal.localPath
                            )
                                throw new Error(
                                    'exportTemplates:errors.changed',
                                );
                            rememberSeparateTemplateDirectory(
                                path.dirname(project.launch_path),
                            );
                            return projects.map((item) =>
                                item.path === project.path
                                    ? {
                                          ...item,
                                          exportTemplateMode:
                                              'separate' as const,
                                      }
                                    : item,
                            );
                        });
                    },
                );
            } else {
                await discardTemplateMigration(
                    root,
                    directory,
                    getSharedTemplateRoot(),
                );
            }
        } finally {
            this.starting = false;
            setTemplatesMutating(false);
        }
    }

    /** Persists local management without detaching links or moving any files.
     * @param projectPath - Canonical project identity from the UI.
     */
    async keepProjectTemplatesSeparate(
        projectPath: string,
    ): Promise<TemplateProjectAssessment> {
        if (this.templatesBusy())
            throw new Error('exportTemplates:errors.busy');
        this.starting = true;
        setTemplatesMutating(true);
        try {
            if ((await this.recoveries()).length)
                throw new Error('exportTemplates:errors.recovery');
            const project = await this.assessmentProject(projectPath);
            const status = project.launch_path
                ? await templateConnectionStatus(
                      this.local(project),
                      getSharedTemplateRoot(),
                  )
                : 'error';
            if (!['local', 'missing'].includes(status))
                throw new Error('exportTemplates:errors.connection');
            if (project.exportTemplateMode !== 'separate') {
                await this.projects.update(async (projects) => {
                    const current = projects.find(
                        (item) => item.path === project.path,
                    );
                    if (!current || current.launch_path !== project.launch_path)
                        throw new Error('exportTemplates:errors.changed');
                    const currentStatus = await templateConnectionStatus(
                        this.local(current),
                        getSharedTemplateRoot(),
                    );
                    if (!['local', 'missing'].includes(currentStatus))
                        throw new Error('exportTemplates:errors.changed');
                    return projects.map((item) =>
                        item.path === current.path
                            ? {
                                  ...item,
                                  exportTemplateMode: 'separate' as const,
                              }
                            : item,
                    );
                });
            }
            rememberSeparateTemplateDirectory(
                path.dirname(project.launch_path),
            );
            return await assessProjectTemplates(
                { ...project, exportTemplateMode: 'separate' },
                getSharedTemplateRoot(),
            );
        } finally {
            this.starting = false;
            setTemplatesMutating(false);
            void this.pump();
        }
    }

    /** Reads a project for assessment, including custom and unavailable editors.
     * @param projectPath - Exact registered identity; arbitrary paths are rejected.
     */
    private async assessmentProject(
        projectPath: string,
    ): Promise<ProjectDetails> {
        if (typeof projectPath !== 'string')
            throw new Error('exportTemplates:errors.connection');
        const project = (await this.projects.list()).find(
            (item) => item.path === projectPath,
        );
        if (!project) throw new Error('exportTemplates:errors.connection');
        return project;
    }

    /** Reports whether file operations currently prevent changing project management. */
    private templatesBusy(): boolean {
        return (
            this.starting ||
            areTemplatesMutating() ||
            areTemplateConnectionsActive() ||
            [...this.tasks.values()].some(({ job }) => !TERMINAL.has(job.stage))
        );
    }

    /** Adds queue and recovery constraints to an otherwise read-only assessment.
     * @param assessment - Filesystem assessment.
     * @param recoveryIds - Pending recovery operations.
     */
    private migrationAvailability(
        assessment: TemplateProjectAssessment,
        recoveryIds: string[],
    ): TemplateProjectAssessment {
        if (
            !assessment.pending ||
            !['ready', 'needs-review'].includes(assessment.state)
        )
            return assessment;
        if (recoveryIds.length || this.templatesBusy()) {
            return {
                ...assessment,
                state: recoveryIds.length ? 'recovery' : 'busy',
                reason: recoveryIds.length
                    ? 'interrupted-operation'
                    : 'active-operation',
                compared: false,
                files: undefined,
            };
        }
        return assessment;
    }

    /** Returns process-local progress without rescanning large templates. */
    async getJob(): Promise<TemplateJob | null> {
        return this.job;
    }

    /** Returns session queue state without scanning the filesystem. */
    async getJobs(): Promise<TemplateJob[]> {
        return [...this.tasks.values()].map((task) => task.job);
    }

    /** Enqueues one operation and prevents duplicate pending work for a version.
     * @param setIds - Affected version and flavour identities.
     * @param kind - User-facing operation category.
     * @param action - Deferred operation using main-owned inputs.
     */
    private enqueue(
        setIds: string[],
        kind: NonNullable<TemplateJob['kind']>,
        action: () => Promise<void>,
        projectPath?: string,
    ): void {
        if (
            this.waiting.length >= 64 ||
            [...this.tasks.values()].some(
                ({ job }) =>
                    !TERMINAL.has(job.stage) &&
                    ((projectPath &&
                        job.kind === 'migrate' &&
                        job.projectPath === projectPath) ||
                        (job.setIds?.some((id) => setIds.includes(id)) &&
                            !(
                                kind === 'migrate' &&
                                job.kind === 'migrate' &&
                                projectPath &&
                                job.projectPath &&
                                job.projectPath !== projectPath
                            ))),
            )
        )
            throw new Error('exportTemplates:errors.busy');
        for (const [id, task] of this.tasks) {
            if (
                TERMINAL.has(task.job.stage) &&
                (task.job.stage !== 'error' ||
                    task.job.setIds?.some((setId) => setIds.includes(setId)))
            )
                this.tasks.delete(id);
        }
        const id = randomUUID();
        this.tasks.set(id, {
            job: { id, setIds, kind, stage: 'queued', projectPath },
            action,
        });
        this.waiting.push(id);
        void this.pump();
    }

    /** Starts the next queued operation only after recovery is clear. */
    private async pump(): Promise<void> {
        if (
            this.running ||
            this.pumping ||
            this.starting ||
            !this.waiting.length
        )
            return;
        this.pumping = true;
        try {
            if ((await this.recoveries()).length) return;
            const id = this.waiting.shift();
            if (!id) return;
            const task = this.tasks.get(id);
            if (!task) return;
            this.running = id;
            task.job = { ...task.job, stage: 'preparing' };
            try {
                await task.action();
            } catch (error) {
                task.job = {
                    ...task.job,
                    stage: 'error',
                    error:
                        error instanceof Error &&
                        error.message.startsWith('exportTemplates:')
                            ? error.message
                            : 'exportTemplates:errors.failed',
                };
                this.job = task.job;
                this.running = null;
            }
        } catch (error) {
            logger.warn('Could not advance template queue', error);
        } finally {
            this.pumping = false;
        }
        if (!this.running && this.waiting.length) void this.pump();
    }

    /** Retries a failed operation with its retained main-owned inputs.
     * @param jobId - Failed queue entry.
     */
    async retryJob(jobId: string): Promise<void> {
        const task = this.tasks.get(jobId);
        if (task?.job.stage !== 'error')
            throw new Error('exportTemplates:errors.changed');
        this.enqueue(
            task.job.setIds ?? [],
            task.job.kind ?? 'update',
            task.action,
            task.job.projectPath,
        );
    }

    /** Captures a local-only file selection for an installed set.
     * @param setId - Installed version and flavour identity.
     */
    async getLocalPackage(setId: string): Promise<TemplatePackage> {
        if (!isTemplateIdentity(setId))
            throw new Error('exportTemplates:errors.identity');
        const destination = templateChild(getSharedTemplateRoot(), setId);
        const before = await readTemplateTree(destination, true);
        if (!(await templateLstat(destination)))
            throw new Error('exportTemplates:errors.changed');
        const token = randomUUID();
        this.packageSnapshots.set(token, {
            cacheKey: '',
            id: setId,
            before,
            existed: true,
        });
        return {
            token,
            files: [],
            localFiles: before
                .map((file) => file.relative)
                .filter((name) => name !== 'version.txt'),
        };
    }

    /** Queues a checked selection, retaining its snapshot until execution.
     * @param token - Main-owned package snapshot.
     * @param selected - Desired file paths.
     */
    async savePackage(token: string, selected: string[]): Promise<void> {
        const snapshot = this.packageSnapshots.get(token);
        if (!snapshot || !Array.isArray(selected) || selected.length > 100_000)
            throw new Error('exportTemplates:errors.package');
        const known = new Set([
            ...snapshot.before.map((file) => file.relative),
            ...(snapshot.index?.entries ?? []).map((entry) =>
                entry.fileName.slice(snapshot.index?.prefix.length ?? 0),
            ),
        ]);
        if (
            selected.some(
                (name) =>
                    typeof name !== 'string' ||
                    name === 'version.txt' ||
                    !known.has(name),
            )
        )
            throw new Error('exportTemplates:errors.package');
        const desired = [...selected];
        this.enqueue([snapshot.id], 'update', async () => {
            this.packageSnapshots.set(token, snapshot);
            await this.executeSavePackage(token, desired);
        });
    }

    /** Queues a full official package request retained for bridge compatibility.
     * @param releaseId - Cached release identity.
     * @param assetId - Official package identity.
     */
    async download(releaseId: string, assetId: string): Promise<void> {
        const release = await this.catalog.getReleaseById(releaseId);
        const asset = release?.templateAssets?.find(
            (item) => item.id === assetId,
        );
        const setIds =
            release && asset
                ? [
                      `${release.tag.replace('-', '.')}${asset.flavor === 'dotnet' ? '.mono' : ''}`,
                  ]
                : [];
        this.enqueue(setIds, 'download', () =>
            this.executeDownload(releaseId, assetId),
        );
    }

    /** Chooses a local TPZ immediately and queues its preparation. */
    async importArchive(): Promise<void> {
        const selection = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Godot export templates', extensions: ['tpz'] }],
        });
        if (!selection.canceled && selection.filePaths[0])
            this.enqueue([], 'import', () =>
                this.executeImportArchive(selection.filePaths[0]),
            );
    }

    /** Queues a project's reviewed connection or merge.
     * @param projectPath - Registered project identity.
     * @param choice - Whether project files should be merged into shared storage.
     */
    async prepareMigration(
        projectPath: string,
        choice: TemplateMigrationChoice = 'share-project',
    ): Promise<void> {
        if (!['share-project', 'use-shared'].includes(choice))
            throw new Error('exportTemplates:errors.connection');
        const project = await this.project(projectPath);
        this.enqueue(
            [this.identity(project)],
            'migrate',
            () => this.executeMigration(projectPath, choice),
            project.path,
        );
    }

    /** Queues removal against the collection currently shown to the user.
     * @param setId - Installed version and flavour.
     */
    async remove(setId: string): Promise<void> {
        if (!isTemplateIdentity(setId))
            throw new Error('exportTemplates:errors.identity');
        const before = templateFingerprint(
            await readTemplateTree(
                templateChild(getSharedTemplateRoot(), setId),
                true,
            ),
        );
        this.enqueue([setId], 'remove', () =>
            this.executeRemove(setId, before),
        );
    }

    /** Scans the shared collection and project connections. */
    async getInventory(): Promise<ExportTemplateInventory> {
        const root = getSharedTemplateRoot();
        const result: ExportTemplateInventory = {
            root,
            sets: [],
            totalBytes: 0,
            issues: [],
            connections: [],
            recoveries: [],
            job: this.job,
        };
        const projects = await this.projects.list();
        for (const project of projects.filter(
            (item) => item.release.source !== 'custom' && item.launch_path,
        )) {
            result.connections.push({
                projectPath: project.path,
                name: project.name,
                mode: project.exportTemplateMode,
                status: await templateConnectionStatus(
                    this.local(project),
                    root,
                ),
            });
        }
        try {
            if (await templateLstat(root)) {
                const actual = await fs.promises.realpath(root);
                for (const id of (await fs.promises.readdir(actual))
                    .sort(new Intl.Collator('en', { numeric: true }).compare)
                    .reverse()) {
                    try {
                        if (!isTemplateIdentity(id)) {
                            const total = await sumTemplateFiles(
                                path.join(actual, id),
                            );
                            result.totalBytes += total.bytes;
                            result.sizeIncomplete ||= total.incomplete;
                            continue;
                        }
                        const files = await readTemplateTree(
                            templateChild(actual, id),
                        );
                        if (!files.length) continue;
                        const platforms = new Set<string>();
                        for (const file of files) {
                            const platform =
                                /^(windows|linux|macos|osx|web|android|ios|visionos)/i.exec(
                                    file.relative,
                                )?.[1];
                            if (platform) platforms.add(platform.toLowerCase());
                        }
                        const edition: ExportTemplateSet['edition'] =
                            id.endsWith('.mono')
                                ? 'dotnet'
                                : /^\d+\.\d+(?:\.\d+)?\.(stable|rc\d+|beta\d+|alpha\d+|dev\d+)$/.test(
                                        id,
                                    )
                                  ? 'standard'
                                  : 'custom';
                        const sizeBytes = files.reduce(
                            (sum, file) => sum + file.size,
                            0,
                        );
                        result.totalBytes += sizeBytes;
                        result.sets.push({
                            id,
                            version: id.replace(/\.mono$/, ''),
                            edition,
                            sizeBytes,
                            fileCount: files.length,
                            files: files.map((file) => file.relative),
                            platforms: [...platforms].sort(),
                            projects: projects
                                .filter(
                                    (project) => this.identity(project) === id,
                                )
                                .map((project) => project.name),
                        });
                    } catch {
                        result.issues.push(id);
                        const total = await sumTemplateFiles(
                            path.join(actual, id),
                        );
                        result.totalBytes += total.bytes;
                        result.sizeIncomplete ||= total.incomplete;
                    }
                }
            }
            result.sizeIncomplete ??= false;
            result.recoveries = await this.recoveries();
            result.recoverySets = {};
            for (const id of result.recoveries) {
                try {
                    const journal = await readTemplateJournal(
                        path.join(
                            this.workParent(await fs.promises.realpath(root)),
                            id,
                        ),
                    );
                    result.recoverySets[id] = journal.sets.map((set) => set.id);
                } catch {
                    result.recoverySets[id] = [];
                }
            }
        } catch {
            result.sizeIncomplete = true;
            result.issues.push('exportTemplates:errors.read');
        }
        return result;
    }

    /** Loads a cached remote file index and captures the local state for a later save.
     * @param releaseId - Cached official release identity.
     * @param assetId - Template asset identity within the release.
     */
    async getPackage(
        releaseId: string,
        assetId: string,
    ): Promise<TemplatePackage> {
        const catalogue = await this.catalog.getCatalog({
            refreshIfStale: false,
        });
        const release = catalogue.releases.find(
            (item) => item.id === releaseId,
        );
        const asset = release?.templateAssets?.find(
            (item) => item.id === assetId,
        );
        if (!release || !asset)
            throw new Error('exportTemplates:errors.package');
        const id = `${release.tag.replace('-', '.')}${asset.flavor === 'dotnet' ? '.mono' : ''}`;
        if (!isTemplateIdentity(id))
            throw new Error('exportTemplates:errors.identity');
        const key = `${asset.downloadUrl}:${asset.sizeBytes}:${asset.digest ?? ''}`;
        let pending = this.packageIndexes.get(key);
        if (!pending) {
            if (this.packageIndexes.size >= 16)
                this.packageIndexes.delete(
                    this.packageIndexes.keys().next().value ?? '',
                );
            pending = openTemplateRange(
                asset.downloadUrl,
                AbortSignal.timeout(60_000),
            ).then(({ index, zip }) => {
                zip.close();
                return index;
            });
            this.packageIndexes.set(key, pending);
            void pending.catch(() => {
                this.packageIndexes.delete(key);
            });
        }
        const index = await pending;
        const destination = templateChild(getSharedTemplateRoot(), id);
        const before = await readTemplateTree(destination, true);
        const token = randomUUID();
        if (this.packageSnapshots.size >= 32)
            this.packageSnapshots.delete(
                this.packageSnapshots.keys().next().value ?? '',
            );
        this.packageSnapshots.set(token, {
            index,
            cacheKey: key,
            id,
            before,
            existed: Boolean(await templateLstat(destination)),
        });
        return {
            token,
            files: index.entries
                .filter(
                    (entry) => entry.fileName !== `${index.prefix}version.txt`,
                )
                .map((entry) => ({
                    path: entry.fileName.slice(index?.prefix.length ?? 0),
                    sizeBytes: entry.uncompressedSize,
                    downloadBytes: entry.compressedSize,
                })),
            localFiles: before
                .map((file) => file.relative)
                .filter((name) => name !== 'version.txt'),
        };
    }

    /** Downloads missing selected files and atomically applies additions and removals.
     * @param token - Snapshot issued by getPackage.
     * @param selected - Desired file paths, including existing files to retain.
     */
    private async executeSavePackage(
        token: string,
        selected: string[],
    ): Promise<void> {
        const snapshot = this.packageSnapshots.get(token);
        if (
            !snapshot ||
            !Array.isArray(selected) ||
            selected.length > 100_000 ||
            selected.some((name) => typeof name !== 'string')
        )
            throw new Error('exportTemplates:errors.changed');
        const { index, cacheKey, id, before, existed } = snapshot;
        const local = new Set(before.map((file) => file.relative));
        const available = new Map(
            (index?.entries ?? []).map((entry) => [
                entry.fileName.slice(index?.prefix.length ?? 0),
                entry,
            ]),
        );
        if (
            selected.some(
                (name) =>
                    name === 'version.txt' ||
                    (!available.has(name) && !local.has(name)),
            )
        )
            throw new Error('exportTemplates:errors.package');
        const desired = new Set(selected);
        const added = [...desired].filter((name) => !local.has(name));
        const removed = [...local].filter(
            (name) => name !== 'version.txt' && !desired.has(name),
        );
        if (!added.length && !removed.length) {
            const work = await this.begin();
            void this.run(work, async () => {});
            return;
        }
        const work = await this.begin();
        void this.run(work, async () => {
            const destination = templateChild(work.root, id);
            if (
                Boolean(await templateLstat(destination)) !== existed ||
                templateFingerprint(
                    await readTemplateTree(destination, true),
                ) !== templateFingerprint(before)
            )
                throw new Error('exportTemplates:errors.changed');
            const source = path.join(work.directory, 'extracted');
            await fs.promises.mkdir(source);
            if (added.length) {
                if (!index) throw new Error('exportTemplates:errors.package');
                const remote = await openTemplateRange(
                    index.url,
                    work.signal.signal,
                ).catch((error) => {
                    this.packageIndexes.delete(cacheKey);
                    throw error;
                });
                try {
                    if (remote.index.fingerprint !== index.fingerprint) {
                        this.packageIndexes.delete(cacheKey);
                        throw new Error('exportTemplates:errors.changed');
                    }
                    const wanted = [...added, 'version.txt'];
                    const entries = remote.index.entries.filter((entry) =>
                        wanted.includes(
                            entry.fileName.slice(remote.index.prefix.length),
                        ),
                    );
                    const totalBytes = entries.reduce(
                        (sum, entry) => sum + entry.compressedSize,
                        0,
                    );
                    await checkTemplateCapacity(
                        work.directory,
                        entries.reduce(
                            (sum, entry) => sum + entry.uncompressedSize,
                            0,
                        ) + before.reduce((sum, file) => sum + file.size, 0),
                    );
                    let receivedBytes = 0;
                    this.update(work, {
                        stage: 'downloading',
                        totalBytes,
                        receivedBytes,
                    });
                    for (const entry of entries) {
                        await extractTemplateRange(
                            remote.zip,
                            entry,
                            source,
                            entry.fileName.slice(remote.index.prefix.length),
                            work.signal.signal,
                            (bytes) => {
                                receivedBytes += bytes;
                                this.update(work, {
                                    stage: 'downloading',
                                    receivedBytes,
                                    totalBytes,
                                });
                            },
                        );
                    }
                    if (
                        (
                            await fs.promises.readFile(
                                path.join(source, 'version.txt'),
                                'utf8',
                            )
                        ).trim() !== id
                    )
                        throw new Error('exportTemplates:errors.identity');
                    if (local.has('version.txt'))
                        await fs.promises.unlink(
                            path.join(source, 'version.txt'),
                        );
                } finally {
                    remote.zip.close();
                }
            }
            work.signal.signal.throwIfAborted();
            work.sets = [
                {
                    id,
                    source,
                    before,
                    existed,
                    removed,
                    incoming: await readTemplateTree(
                        source,
                        true,
                        work.signal.signal,
                    ),
                },
            ];
            this.update(work, { stage: 'preparing' });
            const sets = await stageTemplateSets(
                work.root,
                work.directory,
                work.sets,
                {},
                work.signal.signal,
            );
            await this.assertRoot(work);
            work.signal.signal.throwIfAborted();
            this.update(work, { stage: 'applying' });
            await commitTemplateTransaction(work.root, work.directory, {
                version: 2,
                phase: 'committing',
                sets,
            });
            this.packageSnapshots.delete(token);
        });
    }

    /** Starts downloading one main-resolved official package.
     * @param releaseId - Catalogue release identity.
     * @param assetId - Template package identity within that release.
     */
    private async executeDownload(
        releaseId: string,
        assetId: string,
    ): Promise<void> {
        const work = await this.begin();
        void this.run(work, async () => {
            const release = await this.catalog.getReleaseById(releaseId);
            const selected = release?.templateAssets?.find(
                (asset) => asset.id === assetId,
            );
            if (!release || !selected)
                throw new Error('exportTemplates:errors.package');
            const asset = {
                name: selected.name,
                download_url: selected.downloadUrl,
                digest: selected.digest,
                checksum_manifest_url: selected.checksumManifestUrl,
                platform_tags: [],
                mono: selected.flavor === 'dotnet',
            };
            const integrity = await resolveArchiveIntegrity(asset, {
                expectedReleaseTag: release.tag,
                signal: work.signal.signal,
            });
            await checkTemplateCapacity(work.directory, selected.sizeBytes);
            const archive = path.join(work.directory, 'package.tpz');
            this.update(work, {
                stage: 'downloading',
                totalBytes: selected.sizeBytes,
                receivedBytes: 0,
            });
            await downloadReleaseAsset(asset, archive, {
                integrity,
                signal: work.signal.signal,
                onProgress: (progress) =>
                    this.update(work, { stage: 'downloading', ...progress }),
            });
            await this.prepareArchive(
                work,
                archive,
                `${release.tag.replace('-', '.')}${selected.flavor === 'dotnet' ? '.mono' : ''}`,
            );
        });
    }

    /** Prepares the chosen archive when its queue entry starts.
     * @param source - User-selected local TPZ path.
     */
    private async executeImportArchive(source: string): Promise<void> {
        const work = await this.begin();
        void this.run(work, async () => {
            work.signal.signal.throwIfAborted();
            const stat = await fs.promises.stat(source);
            if (!stat.isFile())
                throw new Error('exportTemplates:errors.archive');
            await checkTemplateCapacity(work.directory, stat.size);
            const archive = path.join(work.directory, 'package.tpz');
            await fs.promises.copyFile(
                source,
                archive,
                fs.constants.COPYFILE_EXCL,
            );
            await this.prepareArchive(work, archive);
        });
    }

    /** Prepares a reviewed switch from one stored project's local templates.
     * @param projectPath - Exact project identity from the inventory.
     * @param choice - Whether local files should be offered to shared storage.
     */
    private async executeMigration(
        projectPath: string,
        choice: TemplateMigrationChoice,
    ): Promise<void> {
        const work = await this.begin();
        void this.run(work, async () => {
            const project = await this.project(projectPath);
            const local = this.local(project);
            const status = await templateConnectionStatus(
                local,
                getSharedTemplateRoot(),
            );
            if (status === 'shared') return;
            if (status !== 'local' && status !== 'missing')
                throw new Error('exportTemplates:errors.connection');
            work.project = project;
            work.migrationChoice = choice;
            work.metadata = [];
            work.migrationSetIds = [this.identity(project)];
            const projects = await this.projects.list();
            work.affectedProjects = [];
            work.affectedProjectPaths = [];
            for (const candidate of projects) {
                if (
                    candidate.path !== project.path &&
                    candidate.launch_path &&
                    (await templateConnectionStatus(
                        this.local(candidate),
                        getSharedTemplateRoot(),
                    )) === 'shared'
                ) {
                    work.affectedProjects.push(candidate.name);
                    work.affectedProjectPaths.push(candidate.path);
                }
            }
            const entries =
                status === 'missing' ? [] : await fs.promises.readdir(local);
            if (!entries.length) {
                work.emptyConnectionStatus = status;
                work.sourceHash = templateFingerprint([]);
                this.review(work);
                return;
            }
            for (const id of entries) {
                if (isTemplateHousekeeping(id)) {
                    work.metadata.push(id);
                    continue;
                }
                if (!isTemplateIdentity(id))
                    throw new Error('exportTemplates:errors.identity');
                await this.addSet(work, id, templateChild(local, id));
            }
            const localFiles = await readTemplateTree(
                local,
                true,
                work.signal.signal,
            );
            work.sourceHash = templateFingerprint(localFiles);
            work.sourceBytes = localFiles.reduce(
                (sum, file) => sum + file.size,
                0,
            );
            const reviewedFiles = [
                ...localFiles.filter((file) =>
                    isTemplateHousekeeping(file.relative.split('/')[0]),
                ),
                ...work.sets.flatMap((set) =>
                    set.incoming.map((file) => ({
                        ...file,
                        relative: `${set.id}/${file.relative}`,
                    })),
                ),
            ];
            if (templateFingerprint(reviewedFiles) !== work.sourceHash)
                throw new Error('exportTemplates:errors.changed');
            this.review(work);
        });
    }

    /** Applies a prepared operation after the UI's explicit review confirmation.
     * @param jobId - Exact prepared job.
     * @param decisions - Choices for all differing files.
     */
    async apply(
        jobId: string,
        decisions: Record<string, 'shared' | 'incoming'>,
    ): Promise<void> {
        const work = this.requireWork(jobId);
        if (this.job?.stage !== 'review')
            throw new Error('exportTemplates:errors.busy');
        this.update(work, { stage: 'preparing' });
        void this.run(work, async () => {
            const project = work.project
                ? await this.project(work.project.path)
                : undefined;
            if (work.migrationChoice === 'share-project') {
                const connected: string[] = [];
                for (const candidate of await this.projects.list()) {
                    if (
                        candidate.path !== project?.path &&
                        candidate.launch_path &&
                        (await templateConnectionStatus(
                            this.local(candidate),
                            getSharedTemplateRoot(),
                        )) === 'shared'
                    )
                        connected.push(candidate.path);
                }
                if (
                    JSON.stringify(connected.sort()) !==
                    JSON.stringify(
                        [...(work.affectedProjectPaths ?? [])].sort(),
                    )
                )
                    throw new Error('exportTemplates:errors.changed');
            }
            if (
                project &&
                work.project &&
                this.local(project) !== this.local(work.project)
            )
                throw new Error('exportTemplates:errors.changed');
            if (project && work.emptyConnectionStatus) {
                const local = this.local(project);
                const status = await templateConnectionStatus(
                    local,
                    getSharedTemplateRoot(),
                );
                if (
                    status !== work.emptyConnectionStatus ||
                    (status === 'local' &&
                        (await fs.promises.readdir(local)).length)
                )
                    throw new Error('exportTemplates:errors.changed');
                await this.assertRoot(work);
                work.signal.signal.throwIfAborted();
                this.update(work, { stage: 'applying' });
                await connectEmptyTemplateFolder(
                    path.dirname(project.launch_path),
                    project.release,
                    getSharedTemplateRoot(),
                );
                if (
                    (await templateConnectionStatus(
                        local,
                        getSharedTemplateRoot(),
                    )) !== 'shared'
                )
                    throw new Error('exportTemplates:errors.changed');
                return;
            }
            const sets =
                work.migrationChoice === 'use-shared'
                    ? work.sets.map((set) => {
                          const before = templateFingerprint(set.before);
                          return {
                              id: set.id,
                              existed: set.existed,
                              before,
                              after: before,
                          };
                      })
                    : await stageTemplateSets(
                          work.root,
                          work.directory,
                          work.sets,
                          decisions,
                          work.signal.signal,
                          work.requiredDecisions,
                      );
            const journal: TemplateJournal = {
                version: 2,
                phase: 'committing',
                sets,
                projectPath: project?.path,
                sourceHash: work.sourceHash,
                retainBackup:
                    !!work.migrationChoice &&
                    (!!work.metadata?.length ||
                        !!this.job?.review?.files?.some((file) =>
                            ['different', 'local-only'].includes(file.state),
                        )),
                backupBytes:
                    (work.sourceBytes ?? 0) +
                    work.sets.reduce(
                        (sum, set) =>
                            sum +
                            (sets.find((item) => item.id === set.id)?.before !==
                            sets.find((item) => item.id === set.id)?.after
                                ? set.before.reduce(
                                      (bytes, file) => bytes + file.size,
                                      0,
                                  )
                                : 0),
                        0,
                    ),
            };
            await this.assertRoot(work);
            work.signal.signal.throwIfAborted();
            this.update(work, { stage: 'applying' });
            await commitTemplateTransaction(
                work.root,
                work.directory,
                journal,
                project ? this.local(project) : undefined,
                getSharedTemplateRoot(),
            );
        });
    }

    /** Cancels preparation or abandons a review without changing installed files.
     * @param jobId - Exact process-local job.
     */
    async cancel(jobId: string): Promise<void> {
        const queued = this.tasks.get(jobId);
        if (queued && ['queued', 'error'].includes(queued.job.stage)) {
            this.waiting = this.waiting.filter((id) => id !== jobId);
            this.tasks.delete(jobId);
            return;
        }
        const work = this.requireWork(jobId);
        if (this.job?.stage === 'applying')
            throw new Error('exportTemplates:errors.busy');
        work.signal.abort();
        if (this.job?.stage === 'review') {
            await this.cleanup(work);
            this.update(work, { stage: 'cancelled' });
            this.running = null;
            void this.pump();
        }
    }

    /** Removes one set after confirmation, preserving a recoverable directory swap.
     * @param setId - Identity selected from the inventory.
     * @param expected - File fingerprint when removal was requested.
     */
    private async executeRemove(
        setId: string,
        expected: string,
    ): Promise<void> {
        if (!isTemplateIdentity(setId))
            throw new Error('exportTemplates:errors.identity');
        const work = await this.begin();
        void this.run(work, async () => {
            const target = templateChild(work.root, setId);
            if (!(await templateLstat(target)))
                throw new Error('exportTemplates:errors.changed');
            const before = templateFingerprint(
                await readTemplateTree(target, true),
            );
            if (before !== expected)
                throw new Error('exportTemplates:errors.changed');
            work.signal.signal.throwIfAborted();
            this.update(work, { stage: 'applying' });
            await this.assertRoot(work);
            await commitTemplateTransaction(work.root, work.directory, {
                version: 2,
                phase: 'committing',
                sets: [{ id: setId, existed: true, before, after: null }],
            });
        });
    }

    /** Opens the conventional shared folder without creating it. */
    async openFolder(): Promise<void> {
        const result = await shell.openPath(getSharedTemplateRoot());
        if (result) throw new Error('exportTemplates:errors.read');
    }

    /** Restores an interrupted operation or finishes its committed cleanup.
     * @param recoveryId - Discovered operation identifier.
     */
    async recover(recoveryId: string): Promise<void> {
        if (this.starting || (this.job && !TERMINAL.has(this.job.stage)))
            throw new Error('exportTemplates:errors.busy');
        this.starting = true;
        setTemplatesMutating(true);
        const previous = this.tasks.get(recoveryId)?.job;
        const task = {
            job: {
                id: recoveryId,
                setIds: previous?.setIds ?? [],
                kind: 'recover',
                stage: 'applying',
            } as TemplateJob,
            action: () => this.recover(recoveryId),
        };
        this.tasks.set(recoveryId, task);
        try {
            if (
                !OPERATION_ID.test(recoveryId) ||
                !(await this.recoveries()).includes(recoveryId)
            )
                throw new Error('exportTemplates:errors.recovery');
            const root = await fs.promises.realpath(getSharedTemplateRoot());
            const directory = path.join(this.workParent(root), recoveryId);
            if (!(await templateLstat(path.join(directory, 'journal.json')))) {
                const names = await fs.promises.readdir(directory);
                if (
                    names.some(
                        (name) =>
                            ![
                                'package.tpz',
                                'extracted',
                                'new',
                                'journal.next',
                            ].includes(name),
                    )
                )
                    throw new Error('exportTemplates:errors.recovery');
                await fs.promises.rm(directory, { recursive: true });
                return;
            }
            const journal = await readTemplateJournal(directory);
            task.job = {
                ...task.job,
                setIds: journal.sets.map((set) => set.id),
            };
            const project =
                !journal.localPath && journal.projectPath
                    ? await this.project(journal.projectPath)
                    : undefined;
            await recoverTemplateTransaction(
                root,
                directory,
                project ? this.local(project) : undefined,
                getSharedTemplateRoot(),
            );
        } catch (error) {
            task.job = {
                ...task.job,
                stage: 'error',
                error:
                    error instanceof Error &&
                    error.message.startsWith('exportTemplates:')
                        ? error.message
                        : 'exportTemplates:errors.recovery',
            };
            throw error;
        } finally {
            if (task.job.stage !== 'error')
                task.job = { ...task.job, stage: 'complete' };
            this.starting = false;
            setTemplatesMutating(false);
            void this.pump();
        }
    }

    /** Allocates one exclusive preparation job. */
    private async begin(): Promise<Work> {
        if (this.starting || (this.job && !TERMINAL.has(this.job.stage)))
            throw new Error('exportTemplates:errors.busy');
        this.starting = true;
        this.inspection?.abort();
        try {
            if ((await this.recoveries()).length)
                throw new Error('exportTemplates:errors.recovery');
            await fs.promises.mkdir(getSharedTemplateRoot(), {
                recursive: true,
            });
            const root = await fs.promises.realpath(getSharedTemplateRoot());
            const parent = this.workParent(root);
            await fs.promises.mkdir(parent, { recursive: true });
            const parentStat = await fs.promises.lstat(parent);
            if (!parentStat.isDirectory() || parentStat.isSymbolicLink())
                throw new Error('exportTemplates:errors.unsafe');
            const id = this.running ?? randomUUID();
            const directory = path.join(parent, id);
            await fs.promises.mkdir(directory);
            const work = {
                id,
                directory,
                root,
                signal: new AbortController(),
                sets: [],
            };
            this.work = work;
            this.job = { ...this.tasks.get(id)?.job, id, stage: 'preparing' };
            const task = this.tasks.get(id);
            if (task) task.job = this.job;
            return work;
        } finally {
            this.starting = false;
        }
    }

    /** Contains asynchronous preparation failures and cleans only job-owned files.
     * @param work - Current job.
     * @param action - Preparation or commit operation.
     */
    private async run(work: Work, action: () => Promise<void>): Promise<void> {
        try {
            await action();
            work.signal.signal.throwIfAborted();
            if (this.job?.stage !== 'review') {
                await this.cleanup(work);
                this.update(work, { stage: 'complete' });
            }
        } catch (error) {
            if (!work.signal.signal.aborted)
                logger.warn('Export template operation failed', error);
            await this.cleanup(work).catch(() => undefined);
            this.update(work, {
                stage: work.signal.signal.aborted ? 'cancelled' : 'error',
                error:
                    error instanceof Error &&
                    error.message.startsWith('exportTemplates:')
                        ? error.message
                        : 'exportTemplates:errors.failed',
            });
        } finally {
            if (this.job && TERMINAL.has(this.job.stage)) {
                this.running = null;
                void this.pump();
            }
        }
    }

    /** Prepares an extracted archive for merge review.
     * @param work - Current job.
     * @param archive - Job-owned TPZ.
     * @param expected - Exact expected official identity, if known.
     */
    private async prepareArchive(
        work: Work,
        archive: string,
        expected?: string,
    ): Promise<void> {
        this.update(work, { stage: 'extracting' });
        const extracted = await this.templateArchives.extract(
            archive,
            path.join(work.directory, 'extracted'),
            work.signal.signal,
        );
        if (expected && extracted.identity !== expected)
            throw new Error('exportTemplates:errors.identity');
        await this.addSet(work, extracted.identity, extracted.contents);
        this.review(work);
    }

    /** Captures source and destination manifests for one set.
     * @param work - Current job.
     * @param id - Godot package identity.
     * @param source - Validated source directory.
     */
    private async addSet(
        work: Work,
        id: string,
        source: string,
    ): Promise<void> {
        const destination = templateChild(work.root, id);
        work.sets.push({
            id,
            source,
            incoming: await readTemplateTree(source, true, work.signal.signal),
            before: await readTemplateTree(
                destination,
                true,
                work.signal.signal,
            ),
            existed: Boolean(await templateLstat(destination)),
        });
    }

    /** Builds the user-visible merge review.
     * @param work - Prepared job.
     */
    private review(work: Work): void {
        const review: TemplateReview = {
            sets:
                work.migrationChoice && !work.sets.length
                    ? (work.migrationSetIds ?? [])
                    : work.sets.map((set) => set.id),
            sizeBytes: 0,
            addedFiles: 0,
            identicalFiles: 0,
            conflicts: [],
            projectName: work.project?.name,
            migrationChoice: work.migrationChoice,
            metadata: work.metadata,
            affectedProjects: work.affectedProjects,
        };
        const migrationFiles: TemplateMigrationFile[] = [];
        const requiredDecisions = new Set<string>();
        for (const set of work.sets) {
            const before = new Map(
                set.before.map((file) => [file.relative, file]),
            );
            const incoming = new Map(
                set.incoming.map((file) => [file.relative, file]),
            );
            for (const file of set.incoming) {
                review.sizeBytes += file.size;
                const old = before.get(file.relative);
                if (!old) {
                    review.addedFiles++;
                } else if (
                    old.hash === file.hash &&
                    (!work.migrationChoice || old.mode === file.mode)
                )
                    review.identicalFiles++;
                else {
                    review.conflicts.push({
                        path: `${set.id}/${file.relative}`,
                        sharedBytes: old.size,
                        incomingBytes: file.size,
                    });
                }
            }
            if (work.migrationChoice) {
                for (const name of [
                    ...new Set([...before.keys(), ...incoming.keys()]),
                ].sort()) {
                    const local = incoming.get(name);
                    const shared = before.get(name);
                    const migrationFile: TemplateMigrationFile = {
                        path: `${set.id}/${name}`,
                        state: !local
                            ? 'shared-only'
                            : !shared
                              ? 'local-only'
                              : local.size === shared.size &&
                                  local.hash === shared.hash &&
                                  local.mode === shared.mode
                                ? 'identical'
                                : 'different',
                        localBytes: local?.size,
                        sharedBytes: shared?.size,
                    };
                    migrationFiles.push(migrationFile);
                    if (
                        work.migrationChoice === 'share-project' &&
                        ['local-only', 'different'].includes(
                            migrationFile.state,
                        )
                    )
                        requiredDecisions.add(migrationFile.path);
                }
            }
        }
        if (work.migrationChoice) {
            work.requiredDecisions = requiredDecisions;
            review.files = migrationFiles;
            review.requiredDecisions = [...requiredDecisions].sort();
            review.retainsBackup =
                !!work.metadata?.length ||
                migrationFiles.some((file) =>
                    ['local-only', 'different'].includes(file.state),
                );
        }
        this.update(work, { stage: 'review', review, setIds: review.sets });
    }

    /** Gets recoverable transactions without following unexpected links. */
    private async recoveries(): Promise<string[]> {
        if (!(await templateLstat(getSharedTemplateRoot()))) return [];
        const root = await fs.promises.realpath(getSharedTemplateRoot());
        const parent = this.workParent(root);
        const stat = await templateLstat(parent);
        if (!stat) return [];
        if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new Error('exportTemplates:errors.unsafe');
        const result: string[] = [];
        for (const id of await fs.promises.readdir(parent)) {
            if (!OPERATION_ID.test(id)) continue;
            const directory = path.join(parent, id);
            const dirStat = await fs.promises.lstat(directory);
            if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) continue;
            try {
                const journal = await readTemplateJournal(directory);
                if (journal.phase === 'complete' && journal.retainBackup)
                    continue;
            } catch {
                /* Unreadable and incomplete operations still need recovery. */
            }
            if (
                id !== this.job?.id ||
                TERMINAL.has(this.job.stage) ||
                (await templateLstat(path.join(directory, 'journal.json')))
            )
                result.push(id);
        }
        return result;
    }

    /** Resolves a project from canonical stored state.
     * @param projectPath - Requested project identity.
     */
    private async project(projectPath: string): Promise<ProjectDetails> {
        const project = (await this.projects.list()).find(
            (candidate) =>
                candidate.path === projectPath &&
                candidate.release.source !== 'custom' &&
                candidate.exportTemplateMode !== 'separate' &&
                candidate.launch_path,
        );
        if (!project) throw new Error('exportTemplates:errors.connection');
        return project;
    }
    /** Gets the local template directory.
     * @param project - Stored project.
     */
    private local(project: ProjectDetails): string {
        return path.join(
            path.dirname(project.launch_path),
            'editor_data',
            'export_templates',
        );
    }
    /** Gets the expected official template identity.
     * @param project - Stored project.
     */
    private identity(project: ProjectDetails): string {
        return project.release.source === 'custom'
            ? ''
            : `${project.release.version.replace('-', '.')}${project.release.mono ? '.mono' : ''}`;
    }
    /** Gets the hidden staging parent outside the template inventory.
     * @param root - Canonical shared root.
     */
    private workParent(root: string): string {
        return path.join(path.dirname(root), '.godot-launcher-template-work');
    }
    /** Refuses a shared location redirected while a review was open.
     * @param work - Operation whose root was resolved during preparation.
     */
    private async assertRoot(work: Work): Promise<void> {
        if ((await fs.promises.realpath(getSharedTemplateRoot())) !== work.root)
            throw new Error('exportTemplates:errors.changed');
    }
    /** Checks a renderer-supplied job identity.
     * @param id - Exact current job identity.
     */
    private requireWork(id: string): Work {
        if (!this.work || this.work.id !== id)
            throw new Error('exportTemplates:errors.changed');
        return this.work;
    }
    /** Updates process-local progress.
     * @param work - Owning job.
     * @param update - Progress fields to publish.
     */
    private update(work: Work, update: Partial<TemplateJob>): void {
        if (this.job?.id === work.id) {
            this.job = { ...this.job, ...update };
            const task = this.tasks.get(work.id);
            if (task) task.job = this.job;
        }
    }
    /** Removes only non-recoverable staging owned by the job.
     * @param work - Owning job.
     */
    private async cleanup(work: Work): Promise<void> {
        if (!(await templateLstat(path.join(work.directory, 'journal.json'))))
            await fs.promises.rm(work.directory, {
                recursive: true,
                force: true,
            });
    }
}
