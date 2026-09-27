import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import { AppReady, AppReadyOrder } from '@mariodebono/di-electron';
import type {
    ExportTemplateInventory,
    ExportTemplateSet,
    ProjectDetails,
    ProjectTemplateSettings,
    RemoveImportedTemplateOptions,
    TemplateJob,
    TemplateMigrationAssessment,
    TemplateMigrationChoice,
    TemplateMigrationVersionChoices,
    TemplatePackage,
    TemplateProjectAssessment,
    TemplateStorageKind,
} from '@shared/contracts';
import { shell } from 'electron';
import logger from 'electron-log';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorCatalogService } from '../editor-catalog/editor-catalog.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from '../projects/projects.store.js';
import { ImportedTemplatesService } from './imported-templates.service.js';
import {
    importedTemplateFiles,
    readImportedTemplates,
    resolveImportedTemplate,
} from './imported-templates.store.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TemplateArchiveAdapter } from './template-archive.adapter.js';
import {
    assessProjectTemplates,
    isTemplateHousekeeping,
} from './template-assessment.util.js';
import {
    pruneEmptyTemplateDirectories,
    updateTemplateFiles,
} from './template-file-update.util.js';
import {
    areTemplateConnectionsActive,
    areTemplatesMutating,
    checkTemplateCapacity,
    connectEmptyTemplateFolder,
    isTemplateIdentity,
    readTemplateTree,
    reserveTemplateOperation,
    setTemplatesMutating,
    sumTemplateFiles,
    type TemplateFile,
    templateChild,
    templateConnectionStatus,
    templateFingerprint,
    templateLstat,
} from './template-files.util.js';
import { projectOfficialTemplateRoot } from './template-paths.util.js';
import {
    extractTemplateRange,
    openTemplateRange,
    type TemplateRangeIndex,
} from './template-range.adapter.js';
import { getSharedTemplateRoot } from './template-runtime.util.js';
import { TemplateStorageService } from './template-storage.service.js';
import {
    commitTemplateTransaction,
    readTemplateJournal,
    recoverTemplateTransaction,
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
    release: () => void;
    project?: ProjectDetails;
    projectSynchronised?: boolean;
    sourceHash?: string;
    emptyConnectionStatus?: 'local' | 'missing';
};

/** Owns inventory and explicitly requested template operations. */
@Injectable()
export class ExportTemplatesService {
    private job: TemplateJob | null = null;
    private work?: Work;
    private starting = false;
    private discoveringEmptyProjects = false;
    private importStages = 0;
    private inspection?: AbortController;
    private tasks = new Map<
        string,
        { job: TemplateJob; action: () => Promise<void> }
    >();
    private waiting: string[] = [];
    private running: string | null = null;
    private pendingWork?: { id: string; signal: AbortController };
    private pumping = false;
    private packageIndexes = new Map<string, Promise<TemplateRangeIndex>>();
    private packageSnapshots = new Map<
        string,
        {
            index?: TemplateRangeIndex;
            cacheKey: string;
            id: string;
            before: TemplateFile[];
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

    private importedService?: ImportedTemplatesService;
    private storageService?: TemplateStorageService;
    /** Creates the storage facade on first use so existing service construction remains stable. */
    private get storage(): TemplateStorageService {
        this.storageService ??= new TemplateStorageService(
            this.projects,
            () => this.templatesBusy(),
            () => this.recoveries(),
        );
        return this.storageService;
    }
    private get imported(): ImportedTemplatesService {
        this.importedService ??= new ImportedTemplatesService(
            this.projects,
            this.templateArchives,
        );
        return this.importedService;
    }

    /** Repairs interrupted imported link updates before the main window opens. */
    @AppReady({ order: AppReadyOrder.BeforeWindow })
    async restoreTemplateLinks(): Promise<void> {
        try {
            await this.storage.assertAvailable('official');
        } catch (error) {
            logger.warn(
                'Export template storage is unavailable on startup',
                error,
            );
            return;
        }
        await this.libraryMutation(async () => {
            await this.imported.cleanupAbandonedPreviews();
            if ((await this.recoveries()).length) return;
            for (const project of await this.projects.list()) {
                if (
                    !project.launch_path ||
                    project.release.source === 'custom' ||
                    !Object.keys(project.exportTemplateBuilds ?? {}).length
                )
                    continue;
                const assessment = await assessProjectTemplates(
                    project,
                    getSharedTemplateRoot(),
                );
                if (assessment.state !== 'shared') continue;
                try {
                    await this.imported.synchronise(undefined, [project]);
                } catch (error) {
                    logger.warn(
                        'Could not restore project export template links',
                        error,
                    );
                }
            }
        }, 'official').catch((error) =>
            logger.warn(
                'Could not restore export template links on startup',
                error,
            ),
        );
    }

    /** Returns the current connection and installed files for one registered project.
     * @param projectPath - Stored project identity.
     * @param selectedSetId - Optional version selected in project settings.
     */
    async getProjectSettings(
        projectPath: string,
        selectedSetId?: string,
    ): Promise<ProjectTemplateSettings> {
        await this.storage.assertAvailable();
        const project = await this.assessmentProject(projectPath);
        if (!project.launch_path)
            throw new Error('exportTemplates:errors.connection');
        const local = this.local(project);
        const status = await templateConnectionStatus(
            local,
            getSharedTemplateRoot(),
        );
        const custom = project.release.source === 'custom';
        const setId = custom ? '' : (selectedSetId ?? this.identity(project));
        if (!custom && !isTemplateIdentity(setId))
            throw new Error('exportTemplates:errors.identity');
        const root = custom ? local : getSharedTemplateRoot();
        const readable = ['shared', 'local', 'missing'].includes(status);
        const files = readable
            ? await readTemplateTree(
                  setId ? templateChild(root, setId) : root,
                  false,
              )
            : [];
        const sets: ProjectTemplateSettings['sets'] = [];
        if (readable && !custom) {
            sets.push({
                id: setId,
                files: files
                    .map((file) => file.relative)
                    .filter((name) => name !== 'version.txt'),
            });
        }
        const library = await readImportedTemplates();
        let activeBuild: ProjectTemplateSettings['activeBuild'];
        try {
            activeBuild = resolveImportedTemplate(
                library,
                setId,
                project.exportTemplateBuilds?.[setId],
            );
        } catch {
            /* Keep settings usable so a missing selection can be corrected. */
        }
        return {
            buildSelections: project.exportTemplateBuilds ?? {},
            importedBuilds: await Promise.all(
                library.builds
                    .filter((build) => build.setId === setId)
                    .map(async (build) => ({
                        ...build,
                        available: await this.imported
                            .isBuildAvailable(build)
                            .catch((error) => {
                                logger.warn(
                                    'Could not inspect imported template build',
                                    error,
                                );
                                return false;
                            }),
                    })),
            ),
            activeBuild,
            projectPath,
            setId,
            sets,
            status,
            custom,
            files: files
                .map((file) => file.relative)
                .filter((name) => name !== 'version.txt'),
            hasLocalFiles:
                status === 'local' &&
                (await fs.promises.readdir(local)).length > 0,
        };
    }

    /** Persists the result of an explicit connection choice against fresh project state.
     * @param project - Project snapshot whose editor must still match.
     * @param mode - Desired automatic connection preference.
     */
    private async setProjectTemplateMode(
        project: ProjectDetails,
        mode: 'shared',
    ): Promise<void> {
        if (mode === 'shared' && project.exportTemplateMode !== 'separate')
            return;
        await this.projects.update(async (projects) => {
            const current = projects.find((item) => item.path === project.path);
            if (
                !current ||
                current.launch_path !== project.launch_path ||
                this.identity(current) !== this.identity(project)
            )
                throw new Error('exportTemplates:errors.changed');
            return projects.map((item) =>
                item.path === project.path
                    ? { ...item, exportTemplateMode: mode }
                    : item,
            );
        });
    }

    /** Captures shared Official files and, when available, the matching download package.
     * @param projectPath - Registered project to manage.
     * @param localOnly - Skip the official package when offline.
     * @param setId - Explicit version and edition, defaulting to the current editor.
     */
    async getProjectPackage(
        projectPath: string,
        localOnly = false,
        setId?: string,
    ): Promise<TemplatePackage> {
        await this.storage.assertAvailable('official');
        const project = await this.project(projectPath);
        const root = getSharedTemplateRoot();
        const id = setId ?? this.identity(project);
        if (!isTemplateIdentity(id))
            throw new Error('exportTemplates:errors.identity');
        if (!localOnly) {
            const catalogue = await this.catalog.getCatalog({
                refreshIfStale: false,
            });
            for (const release of catalogue.releases) {
                const asset = release.templateAssets?.find(
                    (asset) =>
                        `${release.tag.replace('-', '.')}${asset.flavor === 'dotnet' ? '.mono' : ''}` ===
                        id,
                );
                if (asset) return this.getPackage(release.id, asset.id);
            }
        }
        const destination = templateChild(root, id);
        const before = await readTemplateTree(
            destination,
            false,
            undefined,
            true,
        );
        const token = randomUUID();
        this.packageSnapshots.set(token, {
            cacheKey: '',
            id,
            before,
            existed: Boolean(await templateLstat(destination)),
        });
        return {
            token,
            files: [],
            localFiles: before
                .map((file) => file.relative)
                .filter((name) => name !== 'version.txt'),
        };
    }

    /** Lists migration candidates and counts projects needing a user decision, using metadata only. */
    async getMigrationAssessment(): Promise<TemplateMigrationAssessment> {
        await this.storage.assertAvailable('official');
        const projects = await this.projects.list();
        const recoveryIds = await this.recoveries();
        const assessments: TemplateProjectAssessment[] = [];
        let pendingCount = 0;
        for (const project of projects) {
            const assessment = await assessProjectTemplates(
                project,
                getSharedTemplateRoot(),
            );
            // Empty projects connect automatically, even while their queued work is busy.
            if (assessment.pending && assessment.reason !== 'empty')
                pendingCount++;
            assessments.push(
                this.migrationAvailability(assessment, recoveryIds),
            );
        }
        return {
            projects: assessments,
            pendingCount,
            recoveryIds,
        };
    }

    /** Connects empty official projects without changing existing local collections. */
    async connectEmptyProjects(): Promise<void> {
        await this.storage.assertAvailable('official');
        if (this.discoveringEmptyProjects) return;
        this.discoveringEmptyProjects = true;
        try {
            if (this.templatesBusy() || (await this.recoveries()).length)
                return;
            for (const project of await this.projects.list()) {
                const assessment = await assessProjectTemplates(
                    project,
                    getSharedTemplateRoot(),
                );
                if (!assessment.pending || assessment.reason !== 'empty')
                    continue;
                // Execution checks emptiness again; discovery does not authorise moving files.
                this.enqueue(
                    [this.identity(project)],
                    'migrate',
                    () =>
                        this.executeMigration(
                            project.path,
                            'share-project',
                            true,
                            project,
                        ),
                    project.path,
                );
            }
        } finally {
            this.discoveringEmptyProjects = false;
        }
    }

    /** Compares one registered project without changing templates or preferences.
     * @param projectPath - Canonical project identity from the UI.
     * @param contents - Whether to verify matching contents after the metadata listing.
     */
    async inspectProjectTemplates(
        projectPath: string,
        contents = true,
    ): Promise<TemplateProjectAssessment> {
        await this.storage.assertAvailable('official');
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
            Boolean(this.storageService?.isActive()) ||
            this.starting ||
            this.importStages > 0 ||
            areTemplatesMutating() ||
            areTemplateConnectionsActive() ||
            [...this.tasks.values()].some(({ job }) => !TERMINAL.has(job.stage))
        );
    }

    /** Reports the current physical template stores and retained move job. */
    getStorageSettings() {
        return this.storage.getSettings();
    }

    /** Reviews a destination before any data is moved.
     * @param kind - Store to move.
     * @param destination - Exact destination directory.
     */
    async prepareStorageMove(kind: TemplateStorageKind, destination: string) {
        if (kind === 'imported')
            await this.libraryMutation(async () => undefined);
        return this.storage.prepare(kind, destination);
    }

    /** Starts the retained main-process move.
     * @param token - Reviewed move token.
     */
    startStorageMove(token: string) {
        return this.storage.start(token);
    }

    /** Cancels a move while copying or verifying.
     * @param jobId - Active move job.
     */
    cancelStorageMove(jobId: string) {
        return this.storage.cancel(jobId);
    }

    /** Reconciles a durable interrupted move journal. */
    recoverStorageMove() {
        return this.storage.recover();
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
        if (this.storageService?.isActive())
            throw new Error('exportTemplates:storage.errors.busy');
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
            this.storageService?.isActive() ||
            this.running ||
            this.pumping ||
            this.starting ||
            !this.waiting.length
        )
            return;
        this.pumping = true;
        try {
            await this.storage.assertAvailable('journal');
            if ((await this.recoveries()).length) return;
            const id = this.waiting.shift();
            if (!id) return;
            const task = this.tasks.get(id);
            if (!task) return;
            this.running = id;
            this.pendingWork = { id, signal: new AbortController() };
            task.job = { ...task.job, stage: 'preparing' };
            try {
                await task.action();
            } catch (error) {
                task.job = {
                    ...task.job,
                    stage: this.pendingWork?.signal.signal.aborted
                        ? 'cancelled'
                        : 'error',
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
            this.pendingWork = undefined;
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
        await this.storage.assertAvailable('official');
        if (!isTemplateIdentity(setId))
            throw new Error('exportTemplates:errors.identity');
        const destination = templateChild(getSharedTemplateRoot(), setId);
        const before = await readTemplateTree(
            destination,
            false,
            undefined,
            true,
        );
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
        const desired = selected.some(
            (name) => !name.split('/').some(isTemplateHousekeeping),
        )
            ? [...selected]
            : [];
        this.enqueue([snapshot.id], 'update', async () => {
            this.packageSnapshots.set(token, snapshot);
            await this.executeSavePackage(token, desired);
        });
    }

    /** Returns named complete-package imports and their current users. */
    async getImportedTemplates() {
        await this.storage.assertAvailable('imported');
        return this.imported.inventory();
    }
    /** Selects a TPZ without processing its contents. */
    async chooseTemplateImport() {
        await this.storage.assertAvailable('imported');
        if (this.storage.isActive())
            throw new Error('exportTemplates:storage.errors.busy');
        return this.imported.choose();
    }
    /** Prepares the selected TPZ for review.
     * @param token - Main-owned file selection token.
     */
    async prepareTemplateImport(token: string) {
        await this.storage.assertAvailable('imported');
        if (this.storage.isActive())
            throw new Error('exportTemplates:storage.errors.busy');
        this.importStages += 1;
        try {
            return await this.imported.prepare(token);
        } finally {
            this.importStages -= 1;
        }
    }
    /** Reads preparation progress for the selected archive.
     * @param token - Main-owned file selection token.
     */
    async getTemplateImportProgress(token: string) {
        return this.imported.getProgress(token);
    }
    /** Discards a cancelled import preview.
     * @param token - Main-owned preview token.
     */
    async discardTemplateImport(token: string) {
        await this.storage.assertAvailable('imported');
        if (this.storage.isActive())
            throw new Error('exportTemplates:storage.errors.busy');
        this.importStages += 1;
        try {
            return await this.imported.discard(token);
        } finally {
            this.importStages -= 1;
        }
    }
    /** Installs a reviewed package into the central library.
     * @param token - Prepared package token.
     * @param label - Display name.
     * @param replaceId - Existing entry to replace.
     */
    installTemplateImport(token: string, label: string, replaceId?: string) {
        return this.libraryMutation(() =>
            this.imported.install(token, label, replaceId),
        );
    }
    /** Renames a library entry.
     * @param id - Imported build ID.
     * @param label - Display label.
     */
    renameImportedTemplate(id: string, label: string) {
        return this.libraryMutation(() => this.imported.rename(id, label));
    }
    /** Opens an imported build's stored files without accepting a renderer path.
     * @param id - Registered imported build ID.
     */
    async openImportedTemplateFolder(id: string): Promise<void> {
        await this.storage.assertAvailable('imported');
        const build = (await readImportedTemplates()).builds.find(
            (item) => item.id === id,
        );
        if (!build) throw new Error('exportTemplates:library.missing');
        const folder = importedTemplateFiles(build);
        const stat = await templateLstat(folder);
        if (!stat?.isDirectory() || stat.isSymbolicLink())
            throw new Error('exportTemplates:library.missing');
        const result = await shell.openPath(folder);
        if (result) throw new Error('exportTemplates:errors.read');
    }
    /** Replaces reviewed project references and deletes the imported build.
     * @param id - Imported build ID.
     * @param options - Reviewed replacement and exact project references.
     */
    removeImportedTemplate(
        id: string,
        options?: RemoveImportedTemplateOptions,
    ) {
        return this.libraryMutation(() => this.imported.remove(id, options));
    }
    /** Persists changed per-version project selections.
     * @param projectPath - Registered project.
     * @param choices - Changed selections.
     */
    setProjectTemplateBuilds(
        projectPath: string,
        choices: Record<string, string>,
    ) {
        return this.libraryMutation(() =>
            this.imported.select(projectPath, choices),
        );
    }
    /** Serialises library commits with official download and migration mutations.
     * @param action - Library operation to execute exclusively.
     * @param kind - Store that must be available for this operation.
     */
    private async libraryMutation<T>(
        action: () => Promise<T>,
        kind: TemplateStorageKind = 'imported',
    ): Promise<T> {
        await this.storage.assertAvailable(kind);
        if (this.templatesBusy())
            throw new Error('exportTemplates:errors.busy');
        this.starting = true;
        const release = await reserveTemplateOperation();
        setTemplatesMutating(true);
        try {
            await this.imported.recoverSavedProjects();
            return await action();
        } finally {
            this.starting = false;
            setTemplatesMutating(false);
            release();
            void this.pump();
        }
    }

    /** Queues the project-level choice for immediate execution.
     * @param projectPath - Registered project identity.
     * @param choice - Default policy for the whole project collection.
     * @param versionChoices - Optional explicit choices for every populated version.
     */
    async prepareMigration(
        projectPath: string,
        choice?: TemplateMigrationChoice,
        versionChoices?: TemplateMigrationVersionChoices,
    ): Promise<void> {
        await this.storage.assertAvailable('official');
        if (
            choice !== undefined &&
            !['share-project', 'use-shared', 'save-imported'].includes(choice)
        )
            throw new Error('exportTemplates:errors.connection');
        if (
            versionChoices !== undefined &&
            (!versionChoices ||
                typeof versionChoices !== 'object' ||
                Array.isArray(versionChoices) ||
                Object.entries(versionChoices).some(
                    ([id, value]) =>
                        !isTemplateIdentity(id) ||
                        !['share-project', 'use-shared'].includes(value),
                ))
        )
            throw new Error('exportTemplates:errors.decision');
        const decisions =
            versionChoices === undefined ? undefined : { ...versionChoices };
        const project = await this.project(projectPath);
        const ids = (
            await fs.promises
                .readdir(this.local(project))
                .catch((error: NodeJS.ErrnoException) => {
                    if (error.code === 'ENOENT') return [];
                    throw error;
                })
        ).filter(isTemplateIdentity);
        this.enqueue(
            [...new Set([this.identity(project), ...ids])],
            'migrate',
            () =>
                this.executeMigration(
                    projectPath,
                    choice ?? 'share-project',
                    false,
                    project,
                    decisions,
                ),
            project.path,
        );
    }

    /** Queues removal against the collection currently shown to the user.
     * @param setId - Installed version and flavour.
     */
    async remove(setId: string): Promise<void> {
        await this.storage.assertAvailable('official');
        if (!isTemplateIdentity(setId))
            throw new Error('exportTemplates:errors.identity');
        const before = this.selectionMetadata(
            await readTemplateTree(
                templateChild(getSharedTemplateRoot(), setId),
                false,
                undefined,
                true,
            ),
        );
        this.enqueue([setId], 'remove', () =>
            this.executeRemove(setId, before),
        );
    }

    /** Scans the shared collection and project connections. */
    async getInventory(): Promise<ExportTemplateInventory> {
        await this.storage.assertAvailable('official');
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
        await this.storage.assertAvailable('official');
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
        const before = await readTemplateTree(
            destination,
            false,
            undefined,
            true,
        );
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

    /** Identifies selection changes without reading file contents.
     * @param files - File names, sizes, permissions and filesystem metadata.
     */
    private selectionMetadata(files: TemplateFile[]): string {
        return JSON.stringify(
            files.map(({ relative, size, mode, metadata }) => [
                relative,
                size,
                mode,
                metadata,
            ]),
        );
    }

    /** Downloads missing selected files and applies only explicitly selected changes.
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
        const { index, cacheKey, id } = snapshot;
        const before = snapshot.before;
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
            const current = await readTemplateTree(
                destination,
                false,
                undefined,
                true,
            );
            // Only removed files need to match the selection snapshot. Unrelated edits are preserved.
            for (const name of removed) {
                const old = before.find((file) => file.relative === name);
                const now = current.find((file) => file.relative === name);
                if (
                    now &&
                    this.selectionMetadata([now]) !==
                        this.selectionMetadata(old ? [old] : [])
                )
                    throw new Error('exportTemplates:errors.changed');
            }
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
                        ),
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
            await this.assertRoot(work);
            work.signal.signal.throwIfAborted();
            this.update(work, { stage: 'applying' });
            setTemplatesMutating(true);
            try {
                const additions =
                    added.length && !local.has('version.txt')
                        ? [...added, 'version.txt']
                        : added;
                await updateTemplateFiles(
                    destination,
                    source,
                    additions,
                    removed,
                );
                const remaining = await readTemplateTree(destination, false);
                if (
                    !remaining.some((file) => file.relative !== 'version.txt')
                ) {
                    await updateTemplateFiles(
                        destination,
                        source,
                        [],
                        ['version.txt'],
                    );
                    await pruneEmptyTemplateDirectories(destination);
                }
            } finally {
                setTemplatesMutating(false);
            }
            this.packageSnapshots.delete(token);
        });
    }

    /** Executes the selected policy against the current shared collection.
     * @param projectPath - Registered project identity.
     * @param choice - Merge local files, use shared files or save local folders as imports.
     * @param emptyOnly - Automatic connections must never move newly added local files.
     * @param expected - Project editor captured when the operation was requested.
     * @param versionChoices - Choices that must cover the populated collection before any file is copied.
     */
    private async executeMigration(
        projectPath: string,
        choice: TemplateMigrationChoice,
        emptyOnly = false,
        expected?: ProjectDetails,
        versionChoices?: TemplateMigrationVersionChoices,
    ): Promise<void> {
        const work = await this.begin();
        void this.run(work, async () => {
            const project = await this.project(projectPath);
            if (
                expected &&
                (project.launch_path !== expected.launch_path ||
                    this.identity(project) !== this.identity(expected))
            )
                throw new Error('exportTemplates:errors.changed');
            const local = this.local(project);
            const status = await templateConnectionStatus(
                local,
                getSharedTemplateRoot(),
            );
            if (status === 'shared') {
                await this.setProjectTemplateMode(project, 'shared');
                return;
            }
            if (status !== 'local' && status !== 'missing')
                throw new Error('exportTemplates:errors.connection');
            work.project = project;
            const entries =
                status === 'missing' ? [] : await fs.promises.readdir(local);
            if (!entries.length) {
                if (versionChoices && Object.keys(versionChoices).length)
                    throw new Error('exportTemplates:errors.changed');
                work.emptyConnectionStatus = status;
                work.sourceHash = templateFingerprint([]);
                await this.applyMigration(work);
                return;
            }
            if (emptyOnly) throw new Error('exportTemplates:errors.changed');
            for (const id of entries) {
                if (!isTemplateHousekeeping(id) && !isTemplateIdentity(id))
                    throw new Error('exportTemplates:errors.identity');
            }
            if (choice === 'save-imported') {
                setTemplatesMutating(true);
                this.update(work, {
                    stage: 'applying',
                    setIds: entries.filter(isTemplateIdentity),
                });
                for (const name of entries.filter(isTemplateHousekeeping))
                    await fs.promises.rm(path.join(local, name), {
                        recursive: true,
                        force: true,
                    });
                await this.imported.saveProject(project, local);
                work.projectSynchronised = true;
                return;
            }
            const contents = await readTemplateTree(
                local,
                false,
                work.signal.signal,
            );
            work.sourceHash = templateFingerprint(contents);
            const versions = entries.filter(isTemplateIdentity).map((id) => ({
                id,
                files: contents
                    .filter((file) => file.relative.startsWith(`${id}/`))
                    .map((file) => ({
                        ...file,
                        relative: file.relative.slice(id.length + 1),
                    })),
            }));
            if (versionChoices) {
                const populatedIds = versions
                    .filter(({ files }) =>
                        files.some((file) => file.relative !== 'version.txt'),
                    )
                    .map(({ id }) => id);
                if (
                    Object.keys(versionChoices).length !==
                        populatedIds.length ||
                    populatedIds.some(
                        (id) => !Object.hasOwn(versionChoices, id),
                    )
                )
                    throw new Error('exportTemplates:errors.changed');
            }
            this.update(work, { setIds: versions.map(({ id }) => id) });
            await this.assertRoot(work);
            work.signal.signal.throwIfAborted();
            this.update(work, { stage: 'applying' });
            setTemplatesMutating(true);
            try {
                for (const { id, files } of versions) {
                    if (
                        (versionChoices?.[id] ?? choice) !== 'share-project' ||
                        !files.length
                    )
                        continue;
                    await updateTemplateFiles(
                        templateChild(work.root, id),
                        templateChild(local, id),
                        files.map((file) => file.relative),
                        [],
                        true,
                    );
                }
            } finally {
                setTemplatesMutating(false);
            }
            await this.applyMigration(work);
        });
    }

    /** Commits the prepared project connection after migration files are ready.
     * @param work - Exclusive queued migration.
     */
    private async applyMigration(work: Work): Promise<void> {
        if (!work.project) throw new Error('exportTemplates:errors.connection');
        const project = await this.project(work.project.path);
        if (this.local(project) !== this.local(work.project))
            throw new Error('exportTemplates:errors.changed');
        if (work.emptyConnectionStatus) {
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
            await this.setProjectTemplateMode(project, 'shared');
            return;
        }
        const journal: TemplateJournal = {
            version: 2,
            phase: 'committing',
            sets: [],
            projectPath: project.path,
            sourceHash: work.sourceHash,
            retainBackup: false,
            metadataOnly: true,
        };
        await this.assertRoot(work);
        work.signal.signal.throwIfAborted();
        this.update(work, { stage: 'applying' });
        await commitTemplateTransaction(
            work.root,
            work.directory,
            journal,
            this.local(project),
            getSharedTemplateRoot(),
        );
        await this.setProjectTemplateMode(project, 'shared');
    }

    /** Cancels queued work or preparation before file changes begin.
     * @param jobId - Exact process-local job.
     */
    async cancel(jobId: string): Promise<void> {
        const queued = this.tasks.get(jobId);
        if (queued && ['queued', 'error'].includes(queued.job.stage)) {
            this.waiting = this.waiting.filter((id) => id !== jobId);
            this.tasks.delete(jobId);
            return;
        }
        if (this.pendingWork?.id === jobId) {
            this.pendingWork.signal.abort();
            return;
        }
        const work = this.requireWork(jobId);
        if (this.job?.stage === 'applying')
            throw new Error('exportTemplates:errors.busy');
        work.signal.abort();
    }

    /** Deletes only the version collection explicitly confirmed by the user.
     * @param setId - Identity selected from the inventory.
     * @param expected - File metadata when removal was requested.
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
            const before = this.selectionMetadata(
                await readTemplateTree(target, false, undefined, true),
            );
            if (before !== expected)
                throw new Error('exportTemplates:errors.changed');
            work.signal.signal.throwIfAborted();
            this.update(work, { stage: 'applying' });
            await this.assertRoot(work);
            setTemplatesMutating(true);
            try {
                await fs.promises.rm(target, { recursive: true });
            } finally {
                setTemplatesMutating(false);
            }
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
        const release = await reserveTemplateOperation();
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
                                'replacement',
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
            await recoverTemplateTransaction(
                root,
                directory,
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
            release();
            void this.pump();
        }
    }

    /** Allocates one exclusive preparation job. */
    private async begin(): Promise<Work> {
        await this.storage.assertAvailable('official');
        if (
            this.storage.isActive() ||
            this.starting ||
            (this.job && !TERMINAL.has(this.job.stage))
        )
            throw new Error('exportTemplates:errors.busy');
        this.starting = true;
        this.inspection?.abort();
        const id = this.running ?? randomUUID();
        const signal = this.pendingWork?.signal ?? new AbortController();
        const release = await reserveTemplateOperation();
        let allocated: string | undefined;
        try {
            signal.signal.throwIfAborted();
            await this.imported.recoverSavedProjects();
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
            signal.signal.throwIfAborted();
            const directory = path.join(parent, id);
            await fs.promises.mkdir(directory);
            allocated = directory;
            signal.signal.throwIfAborted();
            const work = {
                id,
                directory,
                root,
                signal,
                release,
            };
            this.work = work;
            this.job = { ...this.tasks.get(id)?.job, id, stage: 'preparing' };
            const task = this.tasks.get(id);
            if (task) task.job = this.job;
            this.pendingWork = undefined;
            return work;
        } catch (error) {
            if (allocated)
                await fs.promises
                    .rm(allocated, { recursive: true, force: true })
                    .catch(() => undefined);
            release();
            throw error;
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
            work.signal.signal.throwIfAborted();
            await action();
            work.signal.signal.throwIfAborted();
            if (this.job?.projectPath && !work.projectSynchronised) {
                const project = await this.assessmentProject(
                    this.job.projectPath,
                );
                await this.imported.synchronise(undefined, [project]);
            }
            await this.cleanup(work);
            this.update(work, { stage: 'complete' });
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
            setTemplatesMutating(false);
            if (this.job && TERMINAL.has(this.job.stage)) {
                work.release();
                this.running = null;
                void this.pump();
            }
        }
    }

    /** Gets recoverable transactions without following unexpected links. */
    private async recoveries(): Promise<string[]> {
        const result: string[] = [];
        const roots = await this.storage.workRoots();
        if (await templateLstat(getSharedTemplateRoot()))
            roots.push(await fs.promises.realpath(getSharedTemplateRoot()));
        for (const parent of new Set(
            roots.map((root) => this.workParent(root)),
        )) {
            const stat = await templateLstat(parent);
            if (!stat) continue;
            if (!stat.isDirectory() || stat.isSymbolicLink())
                throw new Error('exportTemplates:errors.unsafe');
            for (const id of await fs.promises.readdir(parent)) {
                if (!OPERATION_ID.test(id)) continue;
                const directory = path.join(parent, id);
                const dirStat = await fs.promises.lstat(directory);
                if (!dirStat.isDirectory() || dirStat.isSymbolicLink())
                    continue;
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
        }
        return [...new Set(result)];
    }

    /** Resolves a project from canonical stored state.
     * @param projectPath - Requested project identity.
     */
    private async project(projectPath: string): Promise<ProjectDetails> {
        const project = (await this.projects.list()).find(
            (candidate) =>
                candidate.path === projectPath &&
                candidate.release.source !== 'custom' &&
                candidate.launch_path,
        );
        if (!project) throw new Error('exportTemplates:errors.connection');
        return project;
    }
    /** Gets the local template directory.
     * @param project - Stored project.
     */
    private local(project: ProjectDetails): string {
        return projectOfficialTemplateRoot(path.dirname(project.launch_path));
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
