import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ConfigService } from '@mariodebono/di-config';
import type {
    CommandLineGodotResult,
    CommandLineGodotSelection,
    CommandLineGodotState,
    InstalledRelease,
} from '@shared/contracts';
import { z } from 'zod';
import type { AppConfig } from '../config/index.js';
import { JsonFileStore } from '../json-store/json-file.store.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
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
                  ...process.env,
                  HOME: home,
                  USERPROFILE: home,
                  LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
                  ZDOTDIR: home,
                  XDG_CONFIG_HOME: path.join(home, '.config'),
                  XDG_DATA_HOME: path.join(home, '.local', 'share'),
              }
            : { ...process.env };
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
