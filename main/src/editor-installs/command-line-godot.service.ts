import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ConfigService } from '@mariodebono/di-config';
import type {
    AutomaticAliasChangeItem,
    AutomaticAliasChangePreview,
    AutomaticAliasChangeRequest,
    AutomaticAliasChangeResult,
    CommandLineGodotResult,
    CommandLineGodotSelection,
    CommandLineGodotState,
    InstalledRelease,
    SelectedAliasChangePreview,
    SelectedAliasChangeRequest,
    SelectedAliasChangeResult,
} from '@shared/contracts';
import { z } from 'zod';
import {
    getUserPreferences,
    readUserPreferencesSnapshot,
    setUserPreferences,
} from '../commands/userPreferences.js';
import type { AppConfig } from '../config/index.js';
import { JsonFileStore } from '../json-store/json-file.store.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { getExternalProcessEnvironment } from '../utils/child-process-environment.util.js';
import { CommandLineAliasService } from './command-line-alias.service.js';
import {
    COMMAND_LINE_GODOT_MARKER,
    createGodotWrapper,
    getCommandLineExecutable,
} from './command-line-godot.util.js';
import { CommandLinePathAdapter } from './command-line-path.adapter.js';

const selectionSchema = z
    .object({ version: z.string(), mono: z.boolean(), editorPath: z.string() })
    .nullable();

/** Owns the selected terminal editor and its stable per-user wrapper. */
@Injectable()
export class CommandLineGodotService extends JsonFileStore<CommandLineGodotSelection | null> {
    private readonly adapter: CommandLinePathAdapter;
    private readonly platform = os.platform();
    private readonly aliases: CommandLineAliasService;
    private readonly changePreviews = new Map<
        string,
        {
            request: AutomaticAliasChangeRequest;
            snapshot: string;
            preference: boolean;
            items: AutomaticAliasChangeItem[];
        }
    >();
    private readonly selectedPreviews = new Map<
        string,
        {
            request: SelectedAliasChangeRequest;
            snapshot: string;
            items: AutomaticAliasChangeItem[];
        }
    >();
    private operations: Promise<unknown> = Promise.resolve();

    /**
     * Creates fixture-safe registration and atomic selection persistence.
     * @param coordinator - Shared atomic JSON coordinator.
     * @param config - Runtime paths and isolated test configuration.
     */
    constructor(
        coordinator: JsonStoreCoordinatorService,
        config: ConfigService<AppConfig>,
    ) {
        const configDirectory = config.getOrThrow('paths.configDir');
        super(coordinator, {
            pathProvider: () =>
                path.join(configDirectory, 'command-line-godot.json'),
            defaultValue: () => null,
            parse: (raw) => selectionSchema.parse(JSON.parse(raw)),
        });
        const home = path.dirname(configDirectory);
        const fixture = config.get('e2eFixtures') === true;
        const env = fixture
            ? {
                  ...getExternalProcessEnvironment(),
                  HOME: home,
                  USERPROFILE: home,
                  LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
                  ZDOTDIR: home,
                  XDG_CONFIG_HOME: path.join(home, '.config'),
                  XDG_DATA_HOME: path.join(home, '.local', 'share'),
              }
            : getExternalProcessEnvironment();
        this.adapter = new CommandLinePathAdapter({
            platform: this.platform,
            home,
            env,
            fixture,
            shell: fixture
                ? '/bin/bash'
                : process.env.SHELL || os.userInfo().shell || '/bin/sh',
        });
        this.aliases = new CommandLineAliasService(
            coordinator,
            configDirectory,
            this.adapter,
            this.platform,
        );
    }

    /**
     * Captures an opaque, read-only plan for an explicit preference change.
     * @param request - Requested preference and treatment of existing commands.
     * @param installed - Reads authoritative registered editors inside the queue.
     * @param unavailable - Reports lifecycle reservations for preview counts.
     */
    previewAutomaticAliasChange(
        request: AutomaticAliasChangeRequest,
        installed: () => Promise<InstalledRelease[]>,
        unavailable: (
            item: AutomaticAliasChangeItem,
        ) => string | undefined = () => undefined,
    ): Promise<AutomaticAliasChangePreview> {
        return this.serialise(async () => {
            if (
                !request ||
                typeof request.enabled !== 'boolean' ||
                !(
                    request.enabled
                        ? ['keep', 'create-missing']
                        : ['keep', 'remove-automatic', 'remove-all']
                ).includes(request.mode)
            )
                throw new Error('Invalid automatic command change.');
            const plan = await this.aliases.previewChange(
                request,
                await installed(),
                unavailable,
            );
            const token = randomUUID();
            if (this.changePreviews.size >= 20) {
                const oldest = this.changePreviews.keys().next().value;
                if (oldest) this.changePreviews.delete(oldest);
            }
            this.changePreviews.set(token, {
                request: { ...request },
                ...plan,
                preference:
                    (await readUserPreferencesSnapshot())
                        .auto_create_editor_aliases === true,
            });
            return { ...request, token, items: plan.items };
        });
    }

    /**
     * Saves the current preference before applying a reviewed batch independently.
     * @param token - Opaque preview identity, consumed after successful validation.
     * @param installed - Reads current editor registrations inside the command queue.
     * @param reserve - Holds affected editor identities until all outcomes are recorded.
     * @param unavailable - Rechecks lifecycle reservations before committing.
     */
    commitAutomaticAliasChange(
        token: string,
        installed: () => Promise<InstalledRelease[]>,
        reserve: (items: AutomaticAliasChangeItem[]) => () => void,
        unavailable: (
            item: AutomaticAliasChangeItem,
        ) => string | undefined = () => undefined,
    ): Promise<AutomaticAliasChangeResult> {
        return this.serialise(async () => {
            const preview = this.changePreviews.get(token);
            if (!preview)
                throw new Error(
                    'The command preview has changed. Review the choices again.',
                );
            const releases = await installed();
            const current = await this.aliases.previewChange(
                preview.request,
                releases,
                unavailable,
            );
            const preferences = await readUserPreferencesSnapshot();
            if (
                current.snapshot !== preview.snapshot ||
                JSON.stringify(current.items) !==
                    JSON.stringify(preview.items) ||
                (preferences.auto_create_editor_aliases === true) !==
                    preview.preference
            )
                throw new Error(
                    'The command preview has changed. Review the choices again.',
                );
            const release = reserve(preview.items);
            try {
                const saved = await setUserPreferences({
                    ...preferences,
                    auto_create_editor_aliases: preview.request.enabled,
                });
                this.changePreviews.delete(token);
                const outcomes = await this.aliases.applyChangeItems(
                    preview.items,
                    releases,
                );
                return { preferences: saved, outcomes };
            } finally {
                release();
            }
        });
    }

    /** Captures selected effects without touching preferences or commands.
     * @param request - Explicit selected editor snapshots and command mode.
     * @param installed - Reads authoritative editors inside the shared queue.
     * @param unavailable - Reports active lifecycle reservations.
     */
    previewSelectedAliasChange(
        request: SelectedAliasChangeRequest,
        installed: () => Promise<InstalledRelease[]>,
        unavailable: (item: AutomaticAliasChangeItem) => string | undefined,
    ): Promise<SelectedAliasChangePreview> {
        return this.serialise(async () => {
            const plan = await this.selectedAliasPlan(
                request,
                await installed(),
                unavailable,
            );
            const token = randomUUID();
            if (this.selectedPreviews.size >= 20) {
                const oldest = this.selectedPreviews.keys().next().value;
                if (oldest) this.selectedPreviews.delete(oldest);
            }
            this.selectedPreviews.set(token, {
                request: structuredClone(request),
                ...plan,
            });
            return { token, mode: request.mode, items: plan.items };
        });
    }

    /** Applies a reviewed selection while preserving default and preference.
     * @param token - Single-use preview identity.
     * @param installed - Reads authoritative editor registrations.
     * @param reserve - Holds affected editor identities until completion.
     * @param unavailable - Rechecks active lifecycle reservations.
     */
    commitSelectedAliasChange(
        token: string,
        installed: () => Promise<InstalledRelease[]>,
        reserve: (items: AutomaticAliasChangeItem[]) => () => void,
        unavailable: (item: AutomaticAliasChangeItem) => string | undefined,
    ): Promise<SelectedAliasChangeResult> {
        return this.serialise(async () => {
            const preview = this.selectedPreviews.get(token);
            if (!preview)
                throw new Error(
                    'The command preview has changed. Review the choices again.',
                );
            const releases = await installed();
            const current = await this.selectedAliasPlan(
                preview.request,
                releases,
                unavailable,
            );
            if (
                current.snapshot !== preview.snapshot ||
                JSON.stringify(current.items) !== JSON.stringify(preview.items)
            )
                throw new Error(
                    'The command preview has changed. Review the choices again.',
                );
            const release = reserve(preview.items);
            this.selectedPreviews.delete(token);
            try {
                const setup = preview.items.some(
                    (item) => item.action === 'create',
                )
                    ? await this.adapter.register()
                    : undefined;
                const outcomes = await this.aliases.applyChangeItems(
                    preview.items,
                    releases,
                );
                return { outcomes, pathChanged: setup?.pathChanged ?? false };
            } finally {
                release();
            }
        });
    }

    /** Validates explicit snapshots before deriving selected command effects.
     * @param request - Selected editor snapshots and command mode.
     * @param installed - Current authoritative editor registrations.
     * @param unavailable - Reports active lifecycle reservations.
     */
    private async selectedAliasPlan(
        request: SelectedAliasChangeRequest,
        installed: InstalledRelease[],
        unavailable: (item: AutomaticAliasChangeItem) => string | undefined,
    ) {
        if (
            !request ||
            !['create-missing', 'remove'].includes(request.mode) ||
            !Array.isArray(request.editors) ||
            request.editors.length === 0
        )
            throw new Error('Invalid selected command change.');
        const editors: InstalledRelease[] = [];
        for (const snapshot of request.editors) {
            const current = installed.find(
                (candidate) =>
                    candidate.version === snapshot?.version &&
                    candidate.mono === snapshot?.mono,
            );
            if (
                !current ||
                [
                    'editor_path',
                    'install_path',
                    'console_path',
                    'source',
                    'managed_by_launcher',
                ].some(
                    (key) =>
                        current[key as keyof InstalledRelease] !==
                        snapshot[key as keyof InstalledRelease],
                )
            )
                throw new Error(
                    'The selected editor has changed. Select it again.',
                );
            if (!editors.includes(current)) editors.push(current);
        }
        return this.aliases.previewChange(
            {
                enabled: request.mode === 'create-missing',
                mode:
                    request.mode === 'remove' ? 'remove-all' : 'create-missing',
            },
            installed,
            unavailable,
            { editors, management: 'manual' },
        );
    }

    /**
     * Recovers alias intents under the shared command transaction queue.
     * @param installed - Authoritative registered editors.
     */
    getAliases(installed: () => Promise<InstalledRelease[]>) {
        return this.serialise(async () =>
            this.aliases.getState(await installed()),
        );
    }

    /**
     * Checks a proposed alias without changing registrations.
     * @param release - Authoritative target editor.
     * @param name - Literal draft name.
     */
    checkAlias(release: InstalledRelease, name: string) {
        return this.serialise(() => this.aliases.check(release, name));
    }

    /**
     * Applies an alias creation or removal within the shared queue.
     * @param release - Authoritative target editor.
     * @param name - New command or null for removal.
     * @param installed - Authoritative registered editors for recovery.
     */
    setAlias(
        release: InstalledRelease,
        name: string | null,
        installed: () => Promise<InstalledRelease[]>,
    ) {
        return this.serialise(async () =>
            this.aliases.apply(release, name, await installed()),
        );
    }

    /**
     * Attempts creation within the existing lifecycle reservation and shared command queue.
     * @param release - Newly registered editor.
     * @param name - Suggested alias to create without changing an existing binding.
     */
    createAutomaticAlias(release: InstalledRelease, name: string) {
        return this.serialise(async () => {
            if (
                (await getUserPreferences()).auto_create_editor_aliases !== true
            )
                return undefined;
            return this.aliases.createAutomatically(release, name);
        });
    }

    /** Gets the persisted selection even when its executable is unavailable. */
    getState(): Promise<CommandLineGodotState> {
        return this.serialise(async () => ({
            selection: (await this.readValue()).value,
            binDirectory: this.adapter.binDirectory,
        }));
    }

    /**
     * Selects an authoritative installation or clears only the managed wrapper.
     * @param release - Registered editor, or null to remove the default.
     */
    setDefault(
        release: InstalledRelease | null,
    ): Promise<CommandLineGodotResult> {
        return this.serialise(() => this.changeDefault(release));
    }

    /**
     * Keeps a selected custom editor aligned with an explicitly replaced registration.
     * @param release - New authoritative editor registration.
     * @param persist - Writes the registration while the command transaction is reserved.
     * @param previousRelease - Previous authoritative record, including any Windows console target.
     */
    updateRegisteredEditor<T>(
        release: InstalledRelease,
        persist: () => Promise<T>,
        previousRelease?: InstalledRelease,
    ): Promise<T> {
        return this.serialise(() =>
            this.aliases.withReplacement(release, async () => {
                const previous = (await this.readValue()).value;
                if (
                    previous?.version !== release.version ||
                    previous.mono !== release.mono
                )
                    return persist();
                const wrapper = await this.readManagedWrapper();
                await this.changeDefault(release);
                try {
                    return await persist();
                } catch (error) {
                    try {
                        await this.changeDefault(null);
                        await this.requireExecutable(
                            getCommandLineExecutable(
                                previousRelease ?? {
                                    ...release,
                                    editor_path: previous.editorPath,
                                },
                                this.platform,
                            ),
                        );
                        await this.writeWrapper(wrapper);
                        await this.replaceValue(previous);
                    } catch (restoreError) {
                        throw new AggregateError(
                            [error, restoreError],
                            'Editor replacement failed and the command-line default could not be restored. Select a default again after resolving the filesystem error.',
                        );
                    }
                    throw error;
                }
            }),
        );
    }

    /**
     * Clears the command before removal and restores only a verified surviving target.
     * @param release - Editor being removed under its lifecycle reservation.
     * @param removeFiles - Deletes editor files after command cleanup succeeds.
     */
    withEditorRemoval<T>(
        release: InstalledRelease,
        removeFiles: () => Promise<T>,
    ): Promise<T> {
        return this.serialise(() =>
            this.aliases.withRemoval(release, async () => {
                const selection = (await this.readValue()).value;
                if (
                    selection?.version !== release.version ||
                    selection.mono !== release.mono
                ) {
                    return removeFiles();
                }
                const wrapper = await this.readManagedWrapper();
                await this.changeDefault(null);
                try {
                    return await removeFiles();
                } catch (error) {
                    try {
                        const executable = getCommandLineExecutable(
                            release,
                            this.platform,
                        );
                        if (selection.editorPath !== release.editor_path)
                            throw new Error(
                                'The previous Godot editor is unavailable.',
                            );
                        await this.requireExecutable(executable);
                        await this.writeWrapper(wrapper);
                        await this.replaceValue(selection);
                    } catch (restoreError) {
                        throw new AggregateError(
                            [error, restoreError],
                            'Editor removal failed and the command-line default could not be restored. Select a default again after resolving the filesystem error.',
                        );
                    }
                    throw error;
                }
            }),
        );
    }

    /**
     * Orders registration changes so wrapper and persisted selection agree.
     * @param operation - One complete command registration operation.
     */
    private serialise<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.operations.then(operation);
        this.operations = result.catch(() => undefined);
        return result;
    }

    /**
     * Verifies that a captured command target can still be invoked before restoration.
     * @param executable - Authoritative platform-specific executable path.
     */
    private async requireExecutable(executable: string): Promise<void> {
        if (!(await fs.stat(executable)).isFile())
            throw new Error('The previous Godot editor is unavailable.');
        await fs.access(
            executable,
            this.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK,
        );
    }

    /**
     * Replaces the wrapper and rolls it back if selection persistence fails.
     * @param release - Editor to target, or null to clear.
     */
    private async changeDefault(
        release: InstalledRelease | null,
    ): Promise<CommandLineGodotResult> {
        const previous = await this.readManagedWrapper();
        let content: string | null = null;
        let selection: CommandLineGodotSelection | null = null;
        let conflict: string | null = null;
        let pathChanged = false;
        if (release) {
            const executable = getCommandLineExecutable(release, this.platform);
            if (
                release.valid === false ||
                !(await fs.stat(executable)).isFile()
            ) {
                throw new Error('The selected Godot editor is unavailable.');
            }
            await fs.access(
                executable,
                this.platform === 'win32'
                    ? fs.constants.F_OK
                    : fs.constants.X_OK,
            );
            content = createGodotWrapper(executable, this.platform);
            await fs.mkdir(this.adapter.binDirectory, { recursive: true });
            ({ conflict, pathChanged } = await this.adapter.register());
            selection = {
                version: release.version,
                mono: release.mono,
                editorPath: release.editor_path,
            };
        }
        await this.writeWrapper(content);
        try {
            await this.replaceValue(selection);
        } catch (error) {
            await this.writeWrapper(previous);
            throw error;
        }
        return {
            selection,
            binDirectory: this.adapter.binDirectory,
            conflict,
            pathChanged,
        };
    }

    /** Reads only regular wrapper files bearing the managed ownership marker. */
    private async readManagedWrapper(): Promise<string | null> {
        try {
            const file = await fs.lstat(this.adapter.wrapperPath);
            if (!file.isFile() || file.isSymbolicLink())
                throw new Error(
                    'The godot command in the bin directory is not managed by Godot Launcher.',
                );
            const content = await fs.readFile(this.adapter.wrapperPath, 'utf8');
            if (
                !content
                    .split(/\r?\n/)
                    .slice(0, 2)
                    .some(
                        (line) =>
                            line === `# ${COMMAND_LINE_GODOT_MARKER}` ||
                            line === `rem ${COMMAND_LINE_GODOT_MARKER}`,
                    )
            ) {
                throw new Error(
                    'The godot command in the bin directory is not managed by Godot Launcher.',
                );
            }
            return content;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }

    /**
     * Atomically installs or removes an owned wrapper without following symlinks.
     * @param content - New script, or null to remove it.
     */
    private async writeWrapper(content: string | null): Promise<void> {
        await this.readManagedWrapper();
        if (content === null) {
            await fs.rm(this.adapter.wrapperPath, { force: true });
            return;
        }
        const temporary = `${this.adapter.wrapperPath}.${randomUUID()}.tmp`;
        try {
            await fs.writeFile(temporary, content, { flag: 'wx', mode: 0o755 });
            await fs.rename(temporary, this.adapter.wrapperPath);
        } finally {
            await fs.rm(temporary, { force: true });
        }
    }
}
