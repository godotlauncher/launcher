import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    ProjectDetails,
    TemplateStorageKind,
    TemplateStorageLocation,
    TemplateStorageMoveJob,
    TemplateStorageMoveReview,
    TemplateStorageSettings,
} from '@shared/contracts';
import logger from 'electron-log';
import { getCurrentAppConfig } from '../config/current-app-config.js';
import type { ProjectsStore } from '../projects/projects.store.js';
import { isPortablePathSegment } from '../utils/portable-path.util.js';
import {
    importedTemplateDefaultRoot,
    importedTemplateFiles,
    importedTemplateRoot,
    readImportedTemplates,
} from './imported-templates.store.js';
import {
    areTemplateConnectionsActive,
    areTemplatesMutating,
    isTemplateIdentity,
    reserveTemplateOperation,
    setTemplatesMutating,
} from './template-files.util.js';
import { getSharedTemplateRoot } from './template-runtime.util.js';
import {
    templateStorageJournalSchema,
    templateStorageSavedSchema,
} from './template-storage.schema.js';

type Entry = {
    relative: string;
    type: 'directory' | 'file';
    size: number;
    mode: number;
    hash?: string;
};
type SavedLocation = {
    official?: string;
    imported?: string;
    importedBootstrapIssue?: boolean;
    officialWorkRoots?: string[];
    managedRoots?: string[];
};
type ProjectLink = {
    link: string;
    before: string;
    after: string;
};
type MoveJournal = {
    id: string;
    kind: TemplateStorageKind;
    source: string;
    canonical: string;
    destination: string;
    backup: string;
    destinationCreated: boolean;
    restore: boolean;
    entries: Entry[];
    projectLinks: ProjectLink[];
    phase: 'copying' | 'verified' | 'switching' | 'linked';
};

/** Creates a translation-keyed storage error.
 * @param key - Storage error key suffix.
 */
const error = (key: string) =>
    new Error(`exportTemplates:storage.errors.${key}`);
const SPACE_MARGIN_BYTES = 16 * 1024 * 1024;
const MAX_PENDING_REVIEWS = 16;
/** Owns relocation state independently of the renderer and imported template root. */
export class TemplateStorageService {
    private reviews = new Map<
        string,
        {
            review: TemplateStorageMoveReview;
            entries: Entry[];
            projectPaths: string[];
            restore: boolean;
        }
    >();
    private job: TemplateStorageMoveJob | null = null;
    private abort?: AbortController;
    private active = false;
    private reserving = false;

    /** Reports whether the main process owns a relocation right now. */
    isActive(): boolean {
        return this.active || this.reserving;
    }

    /** Creates storage management around the existing template mutation queue.
     * @param projects - Saved projects used for the review and editor check.
     * @param otherBusy - Whether a template job is already active or queued.
     * @param recoveries - Pending official template transactions.
     */
    constructor(
        private readonly projects: ProjectsStore,
        private readonly otherBusy: () => boolean,
        private readonly recoveries: () => Promise<string[]>,
    ) {}

    /** Keeps managed destination metadata outside either movable store. */
    private get statePath(): string {
        return path.join(
            getCurrentAppConfig().paths.configDir,
            'template-storage.json',
        );
    }
    /** Keeps interrupted-move recovery state outside either movable store. */
    private get journalPath(): string {
        return path.join(
            getCurrentAppConfig().paths.configDir,
            'template-storage-move.json',
        );
    }

    /** Returns the stable path that project links already use.
     * @param kind - Selected store.
     */
    private canonical(kind: TemplateStorageKind): string {
        return kind === 'official'
            ? getSharedTemplateRoot()
            : importedTemplateRoot();
    }

    /** Returns the ordinary physical location offered for each store.
     * @param kind - Selected store.
     */
    private defaultLocation(kind: TemplateStorageKind): string {
        return kind === 'official'
            ? this.canonical(kind)
            : importedTemplateDefaultRoot();
    }

    /** Reads one launcher-owned JSON record without following a link.
     * @param filename - Record under the app configuration directory.
     */
    private async read<T>(filename: string): Promise<T | undefined> {
        const stat = await fs.promises
            .lstat(filename)
            .catch((cause: NodeJS.ErrnoException) => {
                if (cause.code === 'ENOENT') return undefined;
                throw cause;
            });
        if (!stat) return undefined;
        if (!stat.isFile() || stat.isSymbolicLink()) throw error('attention');
        return JSON.parse(await fs.promises.readFile(filename, 'utf8')) as T;
    }

    /** Atomically replaces one launcher-owned JSON record.
     * @param filename - Record under the app configuration directory.
     * @param value - Complete next record.
     */
    private async write(filename: string, value: unknown): Promise<void> {
        const temporary = `${filename}.${randomUUID()}.tmp`;
        await fs.promises.mkdir(path.dirname(filename), { recursive: true });
        try {
            const handle = await fs.promises.open(temporary, 'wx');
            try {
                await handle.writeFile(JSON.stringify(value, null, 2));
                await handle.sync();
            } finally {
                await handle.close();
            }
            await fs.promises.rename(temporary, filename);
            if (process.platform !== 'win32') {
                const directory = await fs.promises.open(
                    path.dirname(filename),
                    'r',
                );
                try {
                    await directory.sync();
                } finally {
                    await directory.close();
                }
            }
        } finally {
            await fs.promises.rm(temporary, { force: true });
        }
    }

    /** Validates persisted metadata before its paths can affect a filesystem mutation. */
    private async saved(): Promise<SavedLocation> {
        const raw = await this.read<unknown>(this.statePath);
        const parsed = templateStorageSavedSchema.safeParse(raw ?? {});
        if (!parsed.success) throw error('attention');
        for (const value of [
            parsed.data.official,
            parsed.data.imported,
            ...(parsed.data.officialWorkRoots ?? []),
            ...(parsed.data.managedRoots ?? []),
        ]) {
            if (value && !path.isAbsolute(value)) throw error('attention');
        }
        return parsed.data;
    }

    /** Validates a durable move record, resolving saved parent aliases before checking its source. */
    private async journal(): Promise<MoveJournal | undefined> {
        const raw = await this.read<unknown>(this.journalPath);
        if (raw === undefined) return undefined;
        const parsed = templateStorageJournalSchema.safeParse(raw);
        if (!parsed.success) throw error('recovery');
        const journal = parsed.data;
        const saved = await this.saved();
        const validProjectLinks = journal.projectLinks.every((projectLink) => {
            if (
                journal.kind !== 'imported' ||
                !path.isAbsolute(projectLink.link) ||
                !path.isAbsolute(projectLink.before) ||
                !path.isAbsolute(projectLink.after) ||
                path.basename(path.dirname(projectLink.link)) !==
                    'export_templates' ||
                path.basename(path.dirname(path.dirname(projectLink.link))) !==
                    'editor_data' ||
                !isTemplateIdentity(path.basename(projectLink.link))
            )
                return false;
            const relative =
                relativeUnder(journal.source, projectLink.before) ??
                relativeUnder(journal.canonical, projectLink.before);
            return (
                relative !== undefined &&
                isImportedFilesRelative(relative) &&
                samePath(
                    projectLink.after,
                    path.join(journal.destination, relative),
                )
            );
        });
        if (
            journal.canonical !== this.canonical(journal.kind) ||
            journal.backup !==
                `${journal.canonical}.launcher-storage-${journal.id}` ||
            (journal.restore && journal.kind !== 'official') ||
            (journal.restore &&
                journal.destination !==
                    `${journal.canonical}.launcher-restore-${journal.id}`) ||
            !path.isAbsolute(journal.source) ||
            !path.isAbsolute(journal.destination) ||
            overlap(journal.destination, journal.canonical) ||
            overlap(journal.destination, journal.source) ||
            !(
                await Promise.all(
                    [
                        journal.canonical,
                        saved[journal.kind],
                        ...(saved.managedRoots ?? []),
                    ]
                        .filter((value): value is string => value !== undefined)
                        .map((value) => sameStoragePath(value, journal.source)),
                )
            ).some(Boolean) ||
            new Set(journal.entries.map((entry) => entry.relative)).size !==
                journal.entries.length ||
            new Set(journal.projectLinks.map((item) => item.link)).size !==
                journal.projectLinks.length ||
            !validProjectLinks ||
            journal.entries.some(
                (entry) =>
                    path.isAbsolute(entry.relative) ||
                    entry.relative
                        .split(path.sep)
                        .some(
                            (part) => !part || part === '.' || part === '..',
                        ) ||
                    (entry.type === 'file' && !entry.hash),
            )
        )
            throw error('recovery');
        return journal;
    }

    /** Gets the current physical root and refuses unknown links after resolving parent aliases.
     * @param kind - Selected store.
     * @param saved - Launcher-managed destinations.
     */
    private async location(
        kind: TemplateStorageKind,
        saved: SavedLocation,
    ): Promise<TemplateStorageLocation> {
        const canonical = this.canonical(kind);
        const expected = saved[kind];
        const stat = await fs.promises
            .lstat(canonical)
            .catch((cause: NodeJS.ErrnoException) => {
                if (cause.code === 'ENOENT') return undefined;
                throw cause;
            });
        const base: TemplateStorageLocation = {
            kind,
            defaultPath: this.defaultLocation(kind),
            storagePath: expected ?? canonical,
            status: 'empty',
        };
        if (kind === 'imported' && saved.importedBootstrapIssue)
            return {
                ...base,
                status: 'attention',
                issue: 'exportTemplates:storage.errors.attention',
            };
        if (!stat)
            return expected
                ? {
                      ...base,
                      status: 'unavailable',
                      issue: 'exportTemplates:storage.errors.unavailable',
                  }
                : base;
        if (stat.isSymbolicLink()) {
            if (!expected)
                return {
                    ...base,
                    status: 'attention',
                    issue: 'exportTemplates:storage.errors.attention',
                };
            const linked = await storageLinkTarget(canonical);
            if (!(await sameStoragePath(linked, expected)))
                return {
                    ...base,
                    status: 'attention',
                    issue: 'exportTemplates:storage.errors.attention',
                };
            const physicalRoot = await lstat(expected);
            if (
                physicalRoot?.isSymbolicLink() ||
                (physicalRoot && !physicalRoot.isDirectory())
            )
                return {
                    ...base,
                    status: 'attention',
                    issue: 'exportTemplates:storage.errors.attention',
                };
            const physical = await fs.promises
                .stat(canonical)
                .catch((cause: NodeJS.ErrnoException) => {
                    if (cause.code === 'ENOENT') return undefined;
                    throw cause;
                });
            return physical?.isDirectory()
                ? { ...base, status: 'healthy' }
                : {
                      ...base,
                      status: 'unavailable',
                      issue: 'exportTemplates:storage.errors.unavailable',
                  };
        }
        if (!stat.isDirectory() || expected)
            return {
                ...base,
                status: 'attention',
                issue: 'exportTemplates:storage.errors.attention',
            };
        return { ...base, status: 'healthy' };
    }

    /** Reports physical stores and process-owned move progress. */
    async getSettings(): Promise<TemplateStorageSettings> {
        let damaged = false;
        const saved = await this.saved().catch(() => {
            damaged = true;
            return {} as SavedLocation;
        });
        const journal = await this.journal().catch(() => {
            damaged = true;
            return undefined;
        });
        const locations = await Promise.all(
            (['official', 'imported'] as const).map((kind) =>
                this.location(kind, saved),
            ),
        );
        return {
            platform: process.platform,
            defaultGodotPath: this.canonical('official'),
            locations,
            job: this.job,
            busy:
                this.active ||
                this.reserving ||
                this.otherBusy() ||
                areTemplatesMutating() ||
                areTemplateConnectionsActive(),
            recoveryRequired: damaged || (Boolean(journal) && !this.active),
        };
    }

    /** Refuses template access while a managed location is unavailable or recovery is pending. */
    async assertAvailable(
        kind?: TemplateStorageKind | 'journal',
    ): Promise<void> {
        if (await this.journal()) throw error('recovery');
        const { locations } = await this.getSettings();
        const selected = kind
            ? locations.filter((item) => item.kind === kind)
            : locations;
        if (selected.some((item) => item.status === 'unavailable'))
            throw error('unavailable');
        if (selected.some((item) => item.status === 'attention'))
            throw error('attention');
    }

    /** Returns historical official roots whose recovery work must remain discoverable. */
    async workRoots(): Promise<string[]> {
        return (await this.saved()).officialWorkRoots ?? [];
    }

    /** Drops completed-move provenance while retaining roots with possible official recovery work. */
    private async pruneHistory(): Promise<void> {
        try {
            if (await lstat(this.journalPath)) return;
            const saved = await this.saved();
            const retained: string[] = [];
            for (const root of saved.officialWorkRoots ?? []) {
                const work = path.join(
                    path.dirname(root),
                    '.godot-launcher-template-work',
                );
                try {
                    const stat = await lstat(work);
                    if (
                        stat &&
                        (!stat.isDirectory() ||
                            stat.isSymbolicLink() ||
                            (await fs.promises.readdir(work)).length > 0)
                    )
                        retained.push(root);
                } catch {
                    // An inaccessible work folder may still contain recovery data.
                    retained.push(root);
                }
            }
            if (
                retained.length === (saved.officialWorkRoots ?? []).length &&
                !saved.managedRoots?.length
            )
                return;
            await this.write(this.statePath, {
                ...saved,
                officialWorkRoots: retained.length ? retained : undefined,
                managedRoots: undefined,
            });
        } catch (cause) {
            logger.warn(
                'Could not prune completed template storage history',
                cause,
            );
        }
    }

    /** Creates or reconnects the default imported store, accepting linked parent folders. */
    async bootstrapImportedDefault(): Promise<void> {
        const canonical = this.canonical('imported');
        if (await lstat(canonical)) return;
        const destination = this.defaultLocation('imported');
        const saved = await this.saved();
        if (saved.imported) {
            if (!(await sameStoragePath(saved.imported, destination))) return;
            const existing = await lstat(destination);
            if (!existing?.isDirectory() || existing.isSymbolicLink()) return;
            await fs.promises.mkdir(path.dirname(canonical), {
                recursive: true,
            });
            try {
                await fs.promises.symlink(
                    destination,
                    canonical,
                    process.platform === 'win32' ? 'junction' : 'dir',
                );
            } catch (cause) {
                await this.write(this.statePath, {
                    ...saved,
                    importedBootstrapIssue: true,
                });
                throw cause;
            }
            if (saved.importedBootstrapIssue)
                await this.write(this.statePath, {
                    ...saved,
                    importedBootstrapIssue: undefined,
                });
            return;
        }
        const existing = await lstat(destination);
        if (
            existing &&
            (!existing.isDirectory() ||
                existing.isSymbolicLink() ||
                (await fs.promises.readdir(destination)).length)
        ) {
            await this.bootstrapImportedFallback(canonical);
            return;
        }
        if (!existing) {
            await fs.promises.mkdir(path.dirname(destination), {
                recursive: true,
            });
            await fs.promises.mkdir(destination);
        }
        await this.write(this.statePath, {
            ...saved,
            imported: destination,
            importedBootstrapIssue: undefined,
        });
        await fs.promises.mkdir(path.dirname(canonical), { recursive: true });
        try {
            await fs.promises.symlink(
                destination,
                canonical,
                process.platform === 'win32' ? 'junction' : 'dir',
            );
        } catch (cause) {
            if (!(await lstat(canonical))) {
                await this.write(this.statePath, {
                    ...saved,
                    imported: undefined,
                    importedBootstrapIssue: undefined,
                });
                await this.bootstrapImportedFallback(canonical);
                return;
            }
            await this.write(this.statePath, {
                ...saved,
                imported: destination,
                importedBootstrapIssue: true,
            });
            throw cause;
        }
    }

    /** Creates an empty internal library when the preferred fresh path cannot be adopted.
     * @param canonical - Stable imported-template lookup path.
     */
    private async bootstrapImportedFallback(canonical: string): Promise<void> {
        await fs.promises.mkdir(path.dirname(canonical), { recursive: true });
        await fs.promises.mkdir(canonical);
    }

    /** Reviews an exact empty destination and stores a short-lived process token.
     * @param kind - Store to relocate.
     * @param destination - Chosen physical directory.
     */
    async prepare(
        kind: TemplateStorageKind,
        destination: string,
    ): Promise<TemplateStorageMoveReview> {
        if (kind !== 'official' && kind !== 'imported')
            throw error('destination');
        if (
            this.active ||
            this.otherBusy() ||
            areTemplatesMutating() ||
            areTemplateConnectionsActive()
        )
            throw error('busy');
        await this.assertAvailable();
        if ((await this.recoveries()).length) throw error('recovery');
        const paths = await this.validateDestination(kind, destination);
        const entries = await tree(paths.source, true);
        const capacity = await this.checkDestinationCapacity(
            kind,
            paths.destination,
            entries,
            false,
        );
        const projects = await this.affectedProjects(kind);
        const templateCount =
            kind === 'official'
                ? new Set(
                      entries
                          .filter(
                              (entry) =>
                                  entry.type === 'file' &&
                                  entry.relative.includes(path.sep),
                          )
                          .map((entry) => entry.relative.split(path.sep)[0])
                          .filter(isTemplateIdentity),
                  ).size
                : (await readImportedTemplates()).builds.length;
        const review: TemplateStorageMoveReview = {
            token: randomUUID(),
            kind,
            source: paths.source,
            destination: paths.destination,
            sizeBytes: entries.reduce((total, item) => total + item.size, 0),
            fileCount: entries.filter((item) => item.type === 'file').length,
            templateCount,
            ...capacity,
            projects: projects.map((item) => item.name),
        };
        this.reviews.set(review.token, {
            review,
            entries,
            projectPaths: projects.map((item) => item.path).sort(),
            restore: paths.restore,
        });
        if (this.reviews.size > MAX_PENDING_REVIEWS)
            this.reviews.delete(this.reviews.keys().next().value as string);
        return review;
    }

    /** Starts the retained move job after revalidating the reviewed source and destination.
     * @param token - Review token from this main process.
     */
    async start(token: string): Promise<void> {
        const savedReview = this.reviews.get(token);
        if (!savedReview) throw error('changed');
        const { review } = savedReview;
        if (
            this.active ||
            this.reserving ||
            this.otherBusy() ||
            areTemplatesMutating() ||
            areTemplateConnectionsActive()
        )
            throw error('busy');
        this.reserving = true;
        setTemplatesMutating(true);
        let launched = false;
        try {
            this.reviews.delete(token);
            await this.assertAvailable();
            if ((await this.recoveries()).length) throw error('recovery');
            const paths = await this.validateDestination(
                review.kind,
                review.destination,
            );
            const entries = await tree(paths.source, true);
            if (
                !samePath(paths.source, review.source) ||
                paths.restore !== savedReview.restore ||
                !equalEntries(savedReview.entries, entries)
            )
                throw error('changed');
            await this.checkDestinationCapacity(
                review.kind,
                paths.destination,
                entries,
            );
            const projects = await this.affectedProjects(review.kind);
            if (
                projects
                    .map((item) => item.path)
                    .sort()
                    .join('\0') !== savedReview.projectPaths.join('\0')
            )
                throw error('changed');
            const id = randomUUID();
            const abort = new AbortController();
            this.abort = abort;
            this.active = true;
            this.job = {
                id,
                kind: review.kind,
                source: review.source,
                destination: review.destination,
                stage: 'preparing',
                completedBytes: 0,
                totalBytes: review.sizeBytes,
                cancellable: true,
            };
            void this.move(
                review,
                entries,
                savedReview.restore,
                id,
                abort.signal,
            );
            launched = true;
        } finally {
            this.reserving = false;
            if (!launched) setTemplatesMutating(false);
        }
    }

    /** Requests cancellation before the final canonical-path switch.
     * @param jobId - Current process-owned job.
     */
    async cancel(jobId: string): Promise<void> {
        if (!this.job || this.job.id !== jobId) throw error('changed');
        if (!this.job.cancellable || !this.abort) throw error('busy');
        this.abort.abort();
    }

    /** Reconciles an interrupted journal through parent aliases without replacing an unavailable destination. */
    async recover(): Promise<void> {
        if (
            this.active ||
            this.reserving ||
            this.otherBusy() ||
            areTemplatesMutating() ||
            areTemplateConnectionsActive()
        )
            throw error('busy');
        this.reserving = true;
        setTemplatesMutating(true);
        let release: (() => void) | undefined;
        try {
            release = await reserveTemplateOperation();
            const journal = await this.journal();
            if (!journal) return;
            const startedAt = Date.now();
            logger.info(
                `Recovering interrupted ${journal.kind} export template move (phase: ${journal.phase})`,
            );
            await this.reconcile(journal);
            logger.info(
                'Export template files and project links checked; clearing recovery record',
            );
            const canonical = await lstat(journal.canonical);
            const completed =
                (journal.restore &&
                    Boolean(canonical?.isDirectory()) &&
                    !canonical?.isSymbolicLink()) ||
                (!journal.restore &&
                    Boolean(canonical?.isSymbolicLink()) &&
                    (await sameStoragePath(
                        await storageLinkTarget(journal.canonical),
                        journal.destination,
                    )));
            await fs.promises.rm(this.journalPath, { force: true });
            await this.pruneHistory();
            if (this.job?.id === journal.id) {
                this.job = {
                    ...this.job,
                    stage: completed ? 'complete' : 'cancelled',
                    recoveryRequired: false,
                    error: undefined,
                    cancellable: false,
                };
            }
            logger.info(
                `Export template storage recovery completed in ${Date.now() - startedAt} ms`,
            );
        } finally {
            setTemplatesMutating(false);
            release?.();
            this.reserving = false;
        }
    }

    /** Copies files and switches the canonical path after checking the physical link target.
     * Preserves an existing destination folder.
     * @param review - Revalidated review.
     * @param entries - Current source entries.
     * @param restore - Whether the reviewed destination is the canonical default.
     * @param id - Move job identity.
     * @param signal - Preparation and copy cancellation.
     */
    private async move(
        review: TemplateStorageMoveReview,
        entries: Entry[],
        restore: boolean,
        id: string,
        signal: AbortSignal,
    ): Promise<void> {
        let release: (() => void) | undefined;
        let journal: MoveJournal | undefined;
        try {
            release = await reserveTemplateOperation();
            if ((await this.recoveries()).length) throw error('recovery');
            const paths = await this.validateDestination(
                review.kind,
                review.destination,
            );
            if (paths.restore !== restore) throw error('changed');
            const current = await tree(paths.source, true, signal);
            if (!equalEntries(entries, current)) throw error('changed');
            if (!(await lstat(this.canonical(review.kind))))
                await fs.promises.mkdir(
                    path.dirname(this.canonical(review.kind)),
                    { recursive: true },
                );
            await this.checkDestinationCapacity(
                review.kind,
                review.destination,
                current,
            );
            const canonical = this.canonical(review.kind);
            const copyDestination = paths.restore
                ? `${canonical}.launcher-restore-${id}`
                : review.destination;
            const created = !(await lstat(copyDestination));
            const backup = `${canonical}.launcher-storage-${id}`;
            if (
                (await lstat(backup)) ||
                (paths.restore && (await lstat(copyDestination)))
            )
                throw error('destination');
            journal = {
                id,
                kind: review.kind,
                source: paths.source,
                canonical,
                destination: copyDestination,
                backup,
                destinationCreated: created,
                restore: paths.restore,
                entries: current,
                projectLinks:
                    review.kind === 'imported'
                        ? await this.importedProjectLinks(
                              paths.source,
                              copyDestination,
                          )
                        : [],
                phase: 'copying',
            };
            await this.write(this.journalPath, journal);
            if (created) await fs.promises.mkdir(copyDestination);
            this.setStage('moving');
            for (const entry of current) {
                signal.throwIfAborted();
                const to = path.join(copyDestination, entry.relative);
                if (entry.type === 'directory') {
                    await fs.promises.mkdir(to, { mode: 0o700 });
                } else {
                    await copyFile(
                        path.join(paths.source, entry.relative),
                        to,
                        entry.mode,
                        signal,
                        (bytes) => {
                            if (this.job) this.job.completedBytes += bytes;
                        },
                        id,
                    );
                }
            }
            for (const entry of [...current].reverse()) {
                if (entry.type === 'directory')
                    await fs.promises.chmod(
                        path.join(copyDestination, entry.relative),
                        entry.mode,
                    );
            }
            if (created && (await lstat(paths.source)))
                await fs.promises.chmod(
                    copyDestination,
                    (await fs.promises.lstat(paths.source)).mode & 0o777,
                );
            signal.throwIfAborted();
            this.setStage('verifying');
            const copied = await tree(copyDestination, true, signal);
            if (!equalEntries(current, copied)) throw error('changed');
            const sourceNow = await tree(paths.source, true, signal);
            if (!equalEntries(current, sourceNow)) throw error('changed');
            journal.phase = 'verified';
            await this.write(this.journalPath, journal);
            signal.throwIfAborted();
            this.setStage('connecting', false);
            const canonicalStat = await lstat(canonical);
            if (paths.restore) {
                if (
                    !canonicalStat?.isSymbolicLink() ||
                    !(await sameStoragePath(
                        await storageLinkTarget(canonical),
                        paths.source,
                    ))
                )
                    throw error('changed');
                journal.phase = 'switching';
                await this.write(this.journalPath, journal);
                await fs.promises.rename(canonical, backup);
                await fs.promises.rename(copyDestination, canonical);
            } else if (!canonicalStat) {
                // An initially empty store has no directory to preserve.
            } else if (canonicalStat.isSymbolicLink()) {
                if (
                    !(await sameStoragePath(
                        await storageLinkTarget(canonical),
                        paths.source,
                    ))
                )
                    throw error('changed');
                await fs.promises.unlink(canonical);
            } else {
                await fs.promises.rename(canonical, backup);
            }
            if (!paths.restore) {
                journal.phase = 'switching';
                await this.write(this.journalPath, journal);
                await fs.promises.symlink(
                    review.destination,
                    canonical,
                    process.platform === 'win32' ? 'junction' : 'dir',
                );
            }
            journal.phase = 'linked';
            await this.write(this.journalPath, journal);
            const saved = await this.saved();
            await this.write(this.statePath, {
                ...saved,
                [review.kind]: paths.restore ? undefined : review.destination,
                officialWorkRoots:
                    review.kind === 'official'
                        ? [
                              ...new Set([
                                  ...(saved.officialWorkRoots ?? []),
                                  review.source,
                              ]),
                          ]
                        : saved.officialWorkRoots,
                managedRoots: [
                    ...new Set([...(saved.managedRoots ?? []), review.source]),
                ],
            });
            this.setStage('cleaning', false);
            await this.reconcile(journal);
            await fs.promises.rm(this.journalPath, { force: true });
            await this.pruneHistory();
            this.setStage('complete', false);
        } catch (cause) {
            if (journal) {
                try {
                    await this.reconcile(journal);
                    await fs.promises.rm(this.journalPath, { force: true });
                    await this.pruneHistory();
                } catch {
                    if (this.job) this.job.recoveryRequired = true;
                }
            }
            if (this.job) {
                this.job.stage = signal.aborted ? 'cancelled' : 'error';
                this.job.error = signal.aborted
                    ? 'exportTemplates:storage.errors.cancelled'
                    : cause instanceof Error &&
                        cause.message.startsWith('exportTemplates:')
                      ? cause.message
                      : 'exportTemplates:storage.errors.failed';
                this.job.cancellable = false;
            }
        } finally {
            this.abort = undefined;
            this.active = false;
            setTemplatesMutating(false);
            release?.();
        }
    }

    /** Updates the retained job stage.
     * @param stage - Current work stage.
     * @param cancellable - Whether cancellation remains safe.
     */
    private setStage(
        stage: TemplateStorageMoveJob['stage'],
        cancellable = true,
    ): void {
        if (this.job) this.job = { ...this.job, stage, cancellable };
    }

    /** Rolls back move-owned contents or finishes a switch using physical link targets.
     * Keeps a destination folder that existed before the move.
     * @param journal - Durable move record.
     */
    private async reconcile(journal: MoveJournal): Promise<void> {
        await removeOwnedPartials(journal);
        if (journal.restore) {
            await this.reconcileRestore(journal);
            return;
        }
        const originalIsCanonical = samePath(
            journal.source,
            await physicalPath(journal.canonical),
        );
        const canonicalStat = await lstat(journal.canonical);
        const backupStat = await lstat(journal.backup);
        const destinationStat = await lstat(journal.destination);
        const pointsToDestination =
            canonicalStat?.isSymbolicLink() &&
            (await sameStoragePath(
                await storageLinkTarget(journal.canonical),
                journal.destination,
            ));
        if (pointsToDestination) {
            if (!destinationStat?.isDirectory()) throw error('unavailable');
            if (
                !equalEntries(
                    journal.entries,
                    await tree(journal.destination, true),
                )
            )
                throw error('recovery');
            const saved = await this.saved();
            await this.write(this.statePath, {
                ...saved,
                [journal.kind]: journal.destination,
                officialWorkRoots:
                    journal.kind === 'official'
                        ? [
                              ...new Set([
                                  ...(saved.officialWorkRoots ?? []),
                                  journal.source,
                              ]),
                          ]
                        : saved.officialWorkRoots,
                managedRoots: [
                    ...new Set([...(saved.managedRoots ?? []), journal.source]),
                ],
            });
            await this.repairImportedProjectLinks(journal);
            if (backupStat) {
                if (
                    !backupStat.isDirectory() ||
                    backupStat.isSymbolicLink() ||
                    !entriesAreOwnedSubset(
                        await tree(journal.backup, true),
                        journal.entries,
                    )
                )
                    throw error('recovery');
                await fs.promises.rm(journal.backup, { recursive: true });
            } else if (!originalIsCanonical && (await lstat(journal.source))) {
                if (
                    !entriesAreOwnedSubset(
                        await tree(journal.source, true),
                        journal.entries,
                    )
                )
                    throw error('recovery');
                await fs.promises.rm(journal.source, { recursive: true });
            }
            return;
        }
        if (canonicalStat) {
            if (canonicalStat.isSymbolicLink()) {
                const target = await storageLinkTarget(journal.canonical);
                if (!(await sameStoragePath(target, journal.source)))
                    throw error('recovery');
            } else if (
                !canonicalStat.isDirectory() ||
                !originalIsCanonical ||
                backupStat
            ) {
                throw error('recovery');
            }
        }
        if (!canonicalStat && backupStat)
            await fs.promises.rename(journal.backup, journal.canonical);
        else if (
            !canonicalStat &&
            !originalIsCanonical &&
            (await lstat(journal.source))
        )
            await fs.promises.symlink(
                journal.source,
                journal.canonical,
                process.platform === 'win32' ? 'junction' : 'dir',
            );
        else if (!canonicalStat && journal.phase === 'linked')
            throw error('recovery');
        if (journal.phase === 'linked' && canonicalStat && !pointsToDestination)
            throw error('recovery');
        if (destinationStat) {
            if (
                !destinationStat.isDirectory() ||
                destinationStat.isSymbolicLink()
            )
                throw error('recovery');
            const contents = await tree(journal.destination, true);
            const expected = new Map(
                journal.entries.map((entry) => [entry.relative, entry]),
            );
            if (
                contents.some((entry) => {
                    const known = expected.get(entry.relative);
                    return (
                        !known ||
                        known.type !== entry.type ||
                        (entry.type === 'file' &&
                            !equalEntries([known], [entry]))
                    );
                })
            )
                throw error('recovery');
            if (journal.destinationCreated) {
                await fs.promises.rm(journal.destination, { recursive: true });
            } else {
                for (const entry of contents) {
                    if (path.dirname(entry.relative) === '.')
                        await fs.promises.rm(
                            path.join(journal.destination, entry.relative),
                            { recursive: true },
                        );
                }
            }
        }
    }

    /** Records absolute active project link targets that use the imported physical or canonical root.
     * @param source - Current imported physical root.
     * @param destination - Next imported physical root.
     */
    private async importedProjectLinks(
        source: string,
        destination: string,
    ): Promise<ProjectLink[]> {
        const links = new Map<string, ProjectLink>();
        const library = await readImportedTemplates();
        for (const project of await this.projects.list()) {
            if (!project.launch_path || project.release.source === 'custom')
                continue;
            const identity = `${project.release.version.replace('-', '.')}${project.release.mono ? '.mono' : ''}`;
            if (!isTemplateIdentity(identity)) continue;
            const link = path.join(
                path.dirname(project.launch_path),
                'editor_data',
                'export_templates',
                identity,
            );
            const stat = await lstat(link);
            if (!stat?.isSymbolicLink()) continue;
            const selection = project.exportTemplateBuilds?.[identity];
            const build = library.builds.find(
                (item) => item.id === selection && item.setId === identity,
            );
            if (!build) continue;
            const before = await storageLinkTarget(link);
            const relative = path.relative(
                this.canonical('imported'),
                importedTemplateFiles(build),
            );
            if (
                ![source, this.canonical('imported')].some((root) =>
                    samePath(path.join(root, relative), before),
                )
            )
                continue;
            links.set(link, {
                link,
                before,
                after: path.join(destination, relative),
            });
        }
        return [...links.values()].sort((left, right) =>
            left.link.localeCompare(right.link),
        );
    }

    /** Repairs journaled project links through parent aliases before removing the old imported root.
     * @param journal - Validated storage move record.
     */
    private async repairImportedProjectLinks(
        journal: MoveJournal,
    ): Promise<void> {
        for (const projectLink of journal.projectLinks ?? []) {
            const staging = `${projectLink.link}.launcher-storage-${journal.id}`;
            let stagingStat = await lstat(staging);
            if (stagingStat) {
                if (
                    !stagingStat.isSymbolicLink() ||
                    !(await sameStoragePath(
                        await storageLinkTarget(staging),
                        projectLink.after,
                    ))
                )
                    throw error('recovery');
            }
            const current = await lstat(projectLink.link);
            if (current) {
                if (!current.isSymbolicLink()) throw error('recovery');
                const target = await storageLinkTarget(projectLink.link);
                if (await sameStoragePath(target, projectLink.after)) {
                    if (stagingStat) await fs.promises.unlink(staging);
                    continue;
                }
                if (!(await sameStoragePath(target, projectLink.before)))
                    throw error('recovery');
            } else if (!stagingStat) {
                throw error('recovery');
            }
            if (!stagingStat) {
                await fs.promises.symlink(
                    projectLink.after,
                    staging,
                    process.platform === 'win32' ? 'junction' : 'dir',
                );
                stagingStat = await lstat(staging);
                if (!stagingStat?.isSymbolicLink()) throw error('recovery');
            }
            if (current) await fs.promises.unlink(projectLink.link);
            await fs.promises.rename(staging, projectLink.link);
        }
    }

    /** Rolls back or completes a restore, comparing link targets through their physical parents.
     * @param journal - Validated restore record.
     */
    private async reconcileRestore(journal: MoveJournal): Promise<void> {
        const canonicalStat = await lstat(journal.canonical);
        const backupStat = await lstat(journal.backup);
        const destinationStat = await lstat(journal.destination);
        const sourceStat = await lstat(journal.source);
        const canonicalPointsToSource =
            canonicalStat?.isSymbolicLink() &&
            (await sameStoragePath(
                await storageLinkTarget(journal.canonical),
                journal.source,
            ));
        if (canonicalStat?.isDirectory() && !canonicalStat.isSymbolicLink()) {
            if (
                !equalEntries(
                    journal.entries,
                    await tree(journal.canonical, true),
                ) ||
                destinationStat
            )
                throw error('recovery');
            if (backupStat) {
                if (
                    !backupStat.isSymbolicLink() ||
                    !(await sameStoragePath(
                        await storageLinkTarget(journal.backup),
                        journal.source,
                    ))
                )
                    throw error('recovery');
                await fs.promises.unlink(journal.backup);
            }
            if (sourceStat) {
                if (
                    !sourceStat.isDirectory() ||
                    sourceStat.isSymbolicLink() ||
                    !entriesAreOwnedSubset(
                        await tree(journal.source, true),
                        journal.entries,
                    )
                )
                    throw error('recovery');
                await fs.promises.rm(journal.source, { recursive: true });
            }
            const saved = await this.saved();
            await this.write(this.statePath, {
                ...saved,
                [journal.kind]: undefined,
                officialWorkRoots: [
                    ...new Set([
                        ...(saved.officialWorkRoots ?? []),
                        journal.source,
                    ]),
                ],
                managedRoots: [
                    ...new Set([...(saved.managedRoots ?? []), journal.source]),
                ],
            });
            return;
        }
        if (canonicalPointsToSource) {
            if (backupStat) throw error('recovery');
            await this.removeRestoreStaging(journal, destinationStat);
            return;
        }
        if (!canonicalStat && backupStat) {
            if (
                !backupStat.isSymbolicLink() ||
                !(await sameStoragePath(
                    await storageLinkTarget(journal.backup),
                    journal.source,
                ))
            )
                throw error('recovery');
            await fs.promises.rename(journal.backup, journal.canonical);
            await this.removeRestoreStaging(journal, destinationStat);
            return;
        }
        throw error('recovery');
    }

    /** Removes only a restore staging tree whose contents are move-owned.
     * @param journal - Validated restore record.
     * @param destinationStat - Current staging-root entry.
     */
    private async removeRestoreStaging(
        journal: MoveJournal,
        destinationStat: fs.Stats | undefined,
    ): Promise<void> {
        if (!destinationStat) return;
        if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink())
            throw error('recovery');
        const contents = await tree(journal.destination, true);
        const expected = new Map(
            journal.entries.map((entry) => [entry.relative, entry]),
        );
        if (
            contents.some((entry) => {
                const known = expected.get(entry.relative);
                return (
                    !known ||
                    known.type !== entry.type ||
                    (entry.type === 'file' && !equalEntries([known], [entry]))
                );
            })
        )
            throw error('recovery');
        await fs.promises.rm(journal.destination, { recursive: true });
    }

    /** Validates physical destinations and both store relationships, including aliased default parents.
     * @param kind - Store to move.
     * @param destination - Proposed physical directory.
     */
    private async validateDestination(
        kind: TemplateStorageKind,
        destination: string,
    ): Promise<{ source: string; destination: string; restore: boolean }> {
        if (typeof destination !== 'string' || !path.isAbsolute(destination))
            throw error('destination');
        const target = await physicalPath(destination).catch(() => {
            throw error('destination');
        });
        const parent = path.dirname(target);
        const parentStat = await lstat(parent);
        if (!parentStat?.isDirectory()) throw error('destination');
        const saved = await this.saved();
        const selected = await this.location(kind, saved);
        if (selected.status === 'attention') throw error('attention');
        if (selected.status === 'unavailable') throw error('unavailable');
        const source = await physicalPath(selected.storagePath);
        const restore =
            kind === 'official' &&
            samePath(target, await physicalPath(this.canonical('official')));
        const targetStat = await lstat(target);
        if (restore) {
            if (
                !saved.official ||
                samePath(source, target) ||
                !targetStat?.isSymbolicLink() ||
                !(await sameStoragePath(
                    await storageLinkTarget(target),
                    source,
                ))
            )
                throw error('destination');
            return { source, destination: target, restore: true };
        }
        if (
            targetStat &&
            (!targetStat.isDirectory() ||
                targetStat.isSymbolicLink() ||
                (await fs.promises.readdir(target)).length)
        )
            throw error('destination');
        for (const store of ['official', 'imported'] as const) {
            const item = await this.location(store, saved);
            for (const existing of [item.defaultPath, item.storagePath]) {
                if (
                    kind === 'imported' &&
                    store === 'imported' &&
                    samePath(target, await physicalPath(item.defaultPath)) &&
                    !samePath(
                        await physicalPath(item.defaultPath),
                        await physicalPath(item.storagePath),
                    )
                )
                    continue;
                if (overlap(target, await physicalPath(existing)))
                    throw error('destination');
            }
        }
        for (const root of [
            this.canonical('official'),
            ...(await this.workRoots()),
        ]) {
            if (
                overlap(
                    target,
                    path.join(
                        path.dirname(root),
                        '.godot-launcher-template-work',
                    ),
                )
            )
                throw error('destination');
        }
        if (
            overlap(target, this.statePath) ||
            overlap(target, this.journalPath)
        )
            throw error('destination');
        return { source, destination: target, restore: false };
    }

    /** Confirms space, write permission and directory-link support before moving files.
     * @param kind - Store whose canonical link must be supported.
     * @param destination - Canonical physical destination.
     * @param entries - Source snapshot to accommodate.
     * @param enforceSpace - Whether insufficient space must reject instead of returning review data.
     */
    private async checkDestinationCapacity(
        kind: TemplateStorageKind,
        destination: string,
        entries: Entry[],
        enforceSpace = true,
    ): Promise<{
        availableBytes: number | null;
        spaceSufficient: boolean | null;
    }> {
        const parent = path.dirname(destination);
        await fs.promises.access(parent, fs.constants.W_OK).catch(() => {
            throw error('destination');
        });
        const bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
        let availableBytes: number | null = null;
        if (typeof fs.promises.statfs === 'function') {
            try {
                const capacity = await fs.promises.statfs(parent);
                const available =
                    BigInt(capacity.bavail) * BigInt(capacity.bsize);
                availableBytes = Number(
                    available > BigInt(Number.MAX_SAFE_INTEGER)
                        ? BigInt(Number.MAX_SAFE_INTEGER)
                        : available < 0n
                          ? 0n
                          : available,
                );
            } catch (cause) {
                if ((cause as NodeJS.ErrnoException).code === 'ENOSPC')
                    availableBytes = 0;
            }
        }
        const spaceSufficient =
            availableBytes === null
                ? null
                : availableBytes >= bytes + SPACE_MARGIN_BYTES;
        if (spaceSufficient === false) {
            if (enforceSpace) throw error('destination');
            return { availableBytes, spaceSufficient };
        }
        const probe = path.join(
            parent,
            `.godot-launcher-link-probe-${randomUUID()}`,
        );
        const link = `${probe}.link`;
        try {
            await fs.promises.mkdir(probe);
            await fs.promises.symlink(
                probe,
                link,
                process.platform === 'win32' ? 'junction' : 'dir',
            );
        } catch (cause) {
            if (
                !enforceSpace &&
                (cause as NodeJS.ErrnoException).code === 'ENOSPC'
            )
                return { availableBytes, spaceSufficient: false };
            throw error('destination');
        } finally {
            await fs.promises.rm(link, { force: true }).catch(() => undefined);
            await fs.promises
                .rm(probe, { recursive: true, force: true })
                .catch(() => undefined);
        }
        const canonicalParent = path.dirname(this.canonical(kind));
        if (await lstat(canonicalParent)) {
            const second = path.join(
                canonicalParent,
                `.godot-launcher-link-probe-${randomUUID()}`,
            );
            try {
                await fs.promises.symlink(
                    parent,
                    second,
                    process.platform === 'win32' ? 'junction' : 'dir',
                );
            } catch (cause) {
                if (
                    !enforceSpace &&
                    (cause as NodeJS.ErrnoException).code === 'ENOSPC'
                )
                    return { availableBytes, spaceSufficient: false };
                throw error('destination');
            } finally {
                await fs.promises
                    .rm(second, { force: true })
                    .catch(() => undefined);
            }
        }
        return { availableBytes, spaceSufficient };
    }

    /** Lists registered project names whose template paths can resolve through this store.
     * @param kind - Relocated store.
     */
    private async affectedProjects(
        kind: TemplateStorageKind,
    ): Promise<ProjectDetails[]> {
        return (await this.projects.list()).filter(
            (project) =>
                Boolean(project.launch_path) &&
                project.release.source !== 'custom' &&
                (kind === 'official' ||
                    Object.values(project.exportTemplateBuilds ?? {}).some(
                        (value) => value !== 'official',
                    )),
        );
    }
}

/** Checks persisted storage safety before project startup touches template paths. */
export async function assertTemplateStorageAvailable(
    kind?: TemplateStorageKind | 'journal',
): Promise<void> {
    const guard = new TemplateStorageService(
        null as unknown as ProjectsStore,
        () => false,
        async () => [],
    );
    await guard.assertAvailable(kind);
}

/** Recovers storage after the primary app instance is acquired, before project startup hooks. */
export async function recoverTemplateStorageOnStartup(): Promise<void> {
    const guard = new TemplateStorageService(
        null as unknown as ProjectsStore,
        () => false,
        async () => [],
    );
    await guard.recover();
    await guard.bootstrapImportedDefault();
}

/** Reads a regular-file tree and optionally hashes its contents.
 * @param root - Physical source or destination directory.
 * @param hash - Whether to hash files.
 * @param signal - Optional cancellation.
 */
async function tree(
    root: string,
    hash = false,
    signal?: AbortSignal,
): Promise<Entry[]> {
    const result: Entry[] = [];
    const rootStat = await lstat(root);
    if (!rootStat) return result;
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
        throw error('attention');
    async function walk(directory: string, prefix: string): Promise<void> {
        for (const name of (await fs.promises.readdir(directory)).sort()) {
            signal?.throwIfAborted();
            const relative = prefix ? path.join(prefix, name) : name;
            const filename = path.join(root, relative);
            const stat = await fs.promises.lstat(filename);
            if (stat.isSymbolicLink()) throw error('attention');
            if (stat.isDirectory()) {
                result.push({
                    relative,
                    type: 'directory',
                    size: 0,
                    mode: stat.mode & 0o777,
                });
                await walk(filename, relative);
            } else if (stat.isFile())
                result.push({
                    relative,
                    type: 'file',
                    size: stat.size,
                    mode: stat.mode & 0o777,
                    ...(hash ? { hash: await hashFile(filename, signal) } : {}),
                });
            else throw error('attention');
        }
    }
    await walk(root, '');
    return result;
}

/** Hashes a file in bounded chunks so a large package does not enter memory at once.
 * @param filename - Regular file path.
 * @param signal - Optional cancellation.
 */
async function hashFile(
    filename: string,
    signal?: AbortSignal,
): Promise<string> {
    const digest = createHash('sha256');
    const handle = await fs.promises.open(filename, 'r');
    try {
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let position = 0;
        for (;;) {
            signal?.throwIfAborted();
            const { bytesRead } = await handle.read(
                buffer,
                0,
                buffer.length,
                position,
            );
            if (!bytesRead) break;
            digest.update(buffer.subarray(0, bytesRead));
            position += bytesRead;
        }
        return digest.digest('hex');
    } finally {
        await handle.close();
    }
}

/** Copies a regular file in bounded chunks with cancellation and byte progress.
 * @param source - Verified source file.
 * @param destination - New path in the move-owned destination.
 * @param mode - Source permission bits.
 * @param signal - Move cancellation.
 * @param progress - Bytes written.
 * @param id - Move ID used to identify an incomplete owned copy.
 */
async function copyFile(
    source: string,
    destination: string,
    mode: number,
    signal: AbortSignal,
    progress: (bytes: number) => void,
    id: string,
): Promise<void> {
    const input = await fs.promises.open(source, 'r');
    let output: fs.promises.FileHandle | undefined;
    const partial = `${destination}.part-${id}`;
    let completed = false;
    try {
        output = await fs.promises.open(partial, 'wx', mode);
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let position = 0;
        for (;;) {
            signal.throwIfAborted();
            const { bytesRead } = await input.read(
                buffer,
                0,
                buffer.length,
                position,
            );
            if (!bytesRead) break;
            let written = 0;
            while (written < bytesRead) {
                signal.throwIfAborted();
                const result = await output.write(
                    buffer,
                    written,
                    bytesRead - written,
                    position + written,
                );
                written += result.bytesWritten;
                progress(result.bytesWritten);
            }
            position += bytesRead;
        }
        await output.chmod(mode);
        await output.sync();
        await output.close();
        output = undefined;
        await fs.promises.rename(partial, destination);
        completed = true;
    } finally {
        await output?.close();
        await input.close();
        if (!completed)
            await fs.promises
                .rm(partial, { force: true })
                .catch(() => undefined);
    }
}

/** Removes only recognised partial copies whose bytes still match the source prefix.
 * @param journal - Durable record of expected paths and copied content.
 */
async function removeOwnedPartials(journal: MoveJournal): Promise<void> {
    if (!(await lstat(journal.destination))) return;
    const known = new Map(
        journal.entries
            .filter((entry) => entry.type === 'file')
            .map((entry) => [entry.relative, entry]),
    );
    const suffix = `.part-${journal.id}`;
    async function walk(directory: string, prefix: string): Promise<void> {
        for (const name of await fs.promises.readdir(directory)) {
            const relative = prefix ? path.join(prefix, name) : name;
            const filename = path.join(journal.destination, relative);
            const stat = await fs.promises.lstat(filename);
            if (stat.isDirectory()) {
                await walk(filename, relative);
                continue;
            }
            if (!name.endsWith(suffix)) continue;
            const original = relative.slice(0, -suffix.length);
            const expected = known.get(original);
            if (
                !stat.isFile() ||
                !expected ||
                stat.size > expected.size ||
                !(await prefixMatches(
                    path.join(journal.source, original),
                    filename,
                    stat.size,
                ))
            )
                throw error('recovery');
            await fs.promises.rm(filename);
        }
    }
    await walk(journal.destination, '');
}

/** Checks a partial file against the current source without loading it into memory.
 * @param source - Expected original.
 * @param partial - Interrupted copy.
 * @param size - Number of copied bytes.
 */
async function prefixMatches(
    source: string,
    partial: string,
    size: number,
): Promise<boolean> {
    const original = await fs.promises.open(source, 'r');
    const copied = await fs.promises.open(partial, 'r');
    try {
        const left = Buffer.allocUnsafe(1024 * 1024);
        const right = Buffer.allocUnsafe(1024 * 1024);
        for (let position = 0; position < size; ) {
            const length = Math.min(left.length, size - position);
            const first = await original.read(left, 0, length, position);
            const second = await copied.read(right, 0, length, position);
            if (
                first.bytesRead !== length ||
                second.bytesRead !== length ||
                !left.subarray(0, length).equals(right.subarray(0, length))
            )
                return false;
            position += length;
        }
        return true;
    } finally {
        await copied.close();
        await original.close();
    }
}

/** Gets a path's own entry, allowing absent roots.
 * @param filename - Path to inspect.
 */
async function lstat(filename: string): Promise<fs.Stats | undefined> {
    try {
        return await fs.promises.lstat(filename);
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
            return undefined;
        throw cause;
    }
}

/** Resolves linked parents, including missing descendants, while keeping the final name literal.
 * @param filename - Candidate path, which may not exist yet.
 */
async function physicalPath(filename: string): Promise<string> {
    const original = path.resolve(filename);
    let parent = path.dirname(original);
    const missing: string[] = [];
    for (;;) {
        try {
            const resolved = await fs.promises.realpath(parent);
            return path.join(
                resolved,
                ...missing.reverse(),
                path.basename(original),
            );
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
            const next = path.dirname(parent);
            if (next === parent) throw cause;
            missing.push(path.basename(parent));
            parent = next;
        }
    }
}

/** Reads an absolute link target without following its final directory.
 * @param filename - Prevalidated directory link or Windows junction.
 */
async function storageLinkTarget(filename: string): Promise<string> {
    return path.resolve(
        path.dirname(filename),
        await fs.promises.readlink(filename),
    );
}

/** Compares storage locations through parent aliases, preserving missing-drive checks.
 * @param left - First absolute path, possibly through a linked parent.
 * @param right - Expected absolute path.
 */
async function sameStoragePath(left: string, right: string): Promise<boolean> {
    if (samePath(left, right)) return true;
    try {
        return samePath(await physicalPath(left), await physicalPath(right));
    } catch (cause) {
        // A missing drive cannot prove that two different spellings are equivalent.
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw cause;
    }
}

/** Compares paths using host case rules.
 * @param left - First absolute path.
 * @param right - Second absolute path.
 */
function samePath(left: string, right: string): boolean {
    const a = path.resolve(left);
    const b = path.resolve(right);
    return process.platform === 'win32'
        ? a.toLowerCase() === b.toLowerCase()
        : a === b;
}

/** Returns a strict descendant path without resolving the target on disk.
 * @param root - Expected containing root.
 * @param target - Candidate descendant.
 */
function relativeUnder(root: string, target: string): string | undefined {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    if (
        !relative ||
        path.isAbsolute(relative) ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`)
    )
        return undefined;
    return relative;
}

/** Recognises a readable imported package path.
 * @param relative - Candidate path beneath an imported storage root.
 */
function isImportedFilesRelative(relative: string): boolean {
    const parts = relative.split(path.sep);
    return (
        parts.length === 3 &&
        parts[0] === 'imported' &&
        isTemplateIdentity(parts[1]) &&
        isPortablePathSegment(parts[2])
    );
}

/** Checks whether one path contains the other.
 * @param left - First absolute path.
 * @param right - Second absolute path.
 */
function overlap(left: string, right: string): boolean {
    return (
        samePath(left, right) ||
        relativeUnder(left, right) !== undefined ||
        relativeUnder(right, left) !== undefined
    );
}

/** Compares complete sorted file snapshots.
 * @param left - Expected entries.
 * @param right - Actual entries.
 */
function equalEntries(left: Entry[], right: Entry[]): boolean {
    return (
        left.length === right.length &&
        left.every(
            (entry, index) =>
                entry.relative === right[index]?.relative &&
                entry.type === right[index]?.type &&
                entry.size === right[index]?.size &&
                entry.mode === right[index]?.mode &&
                (entry.hash === undefined || entry.hash === right[index]?.hash),
        )
    );
}

/** Accepts only surviving entries from an already verified move-owned tree.
 * @param remaining - Entries left after an interrupted recursive removal.
 * @param expected - Complete tree captured in the durable move journal.
 */
function entriesAreOwnedSubset(remaining: Entry[], expected: Entry[]): boolean {
    const known = new Map(expected.map((entry) => [entry.relative, entry]));
    return remaining.every((entry) => {
        const original = known.get(entry.relative);
        return original !== undefined && equalEntries([original], [entry]);
    });
}
