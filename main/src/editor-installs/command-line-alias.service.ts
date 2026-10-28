import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
    AutomaticAliasChangeItem,
    AutomaticAliasChangeRequest,
    AutomaticAliasChangeResult,
    CommandLineAliasAvailability,
    CommandLineAliasesState,
    CommandLineAliasResult,
    InstalledRelease,
} from '@shared/contracts';
import { t } from '../i18n/index.js';
import type { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import {
    type AliasBinding,
    type AliasEntry,
    CommandLineAliasStore,
} from './command-line-alias.store.js';
import {
    getAliasNameError,
    suggestAutomaticAlias,
} from './command-line-alias.util.js';
import {
    createGodotWrapper,
    getCommandLineExecutable,
} from './command-line-godot.util.js';
import type { CommandLinePathAdapter } from './command-line-path.adapter.js';

/** Owns alias intents and exclusive files, called only inside the command service queue. */
export class CommandLineAliasService {
    private readonly store: CommandLineAliasStore;
    /**
     * Creates a separate registry without migrating the default command.
     * @param coordinator - Atomic persistence coordinator.
     * @param directory - Trusted configuration directory.
     * @param adapter - Shared per-user PATH boundary.
     * @param platform - Current executable platform.
     */
    constructor(
        coordinator: JsonStoreCoordinatorService,
        directory: string,
        private readonly adapter: CommandLinePathAdapter,
        private readonly platform: NodeJS.Platform,
    ) {
        this.store = new CommandLineAliasStore(coordinator, directory);
    }

    /**
     * Reconciles unfinished work, then reports verified files or unresolved reservations.
     * @param installed - Authoritative installed-editor records.
     */
    async getState(
        installed: InstalledRelease[],
    ): Promise<CommandLineAliasesState> {
        const problems = new Map<string, string>();
        for (const entry of await this.store.read()) {
            try {
                if (entry.operation) await this.recover(entry, installed);
            } catch (error) {
                const message = this.message(error);
                const recovery = this.recoveryMessage(entry);
                problems.set(
                    entry.binding.name,
                    entry.operation?.kind === 'rename' && message !== recovery
                        ? `${recovery} ${message}`
                        : message,
                );
            }
        }
        const aliases: CommandLineAliasesState['aliases'] = [];
        for (const entry of await this.store.read()) {
            const binding =
                entry.operation?.kind === 'rename' &&
                entry.operation.phase === 'prepare' &&
                entry.operation.previous
                    ? entry.operation.previous
                    : entry.binding;
            let problem = problems.get(entry.binding.name);
            if (
                !problem &&
                (entry.operation ||
                    !(await this.owned(this.destination(binding), binding)))
            )
                problem = this.recoveryMessage(entry);
            aliases.push({
                name: binding.name,
                version: binding.version,
                mono: binding.mono,
                management: binding.management ?? 'unknown',
                state: problem ? 'unresolved' : 'active',
                ...(problem ? { problem } : {}),
            });
        }
        return { aliases };
    }

    /**
     * Checks a draft without writing files, PATH or reservations.
     * @param release - Authoritative editor being configured.
     * @param name - Literal draft command name.
     * @param findConflict - Request-local preview lookup; mutations use fresh checks.
     */
    async check(
        release: InstalledRelease,
        name: string,
        findConflict: (name: string) => Promise<string | null> = (command) =>
            this.adapter.findConflict(command),
    ): Promise<CommandLineAliasAvailability> {
        const error = getAliasNameError(name);
        if (error)
            return {
                available: false,
                reason: t(`installs:aliases.errors.${error}`),
            };
        const entries = await this.store.read();
        const own = entries.find(({ binding }) =>
            this.sameEditor(binding, release),
        );
        if (own?.operation)
            return { available: false, reason: this.recoveryMessage(own) };
        const owner = entries.find((entry) =>
            this.reservedNames(entry).includes(name),
        );
        if (owner && owner !== own)
            return {
                available: false,
                reason: t('installs:aliases.errors.taken', {
                    name:
                        owner.binding.version +
                        (owner.binding.mono ? ' .NET' : ''),
                }),
            };
        if (own) {
            if (
                !(await this.owned(
                    this.destination(own.binding),
                    own.binding,
                )) ||
                !(await this.owned(this.witness(own.binding), own.binding))
            )
                return { available: false, reason: this.recoveryMessage(own) };
            if (own.binding.name === name) return { available: true };
        }
        await this.requireExecutable(
            getCommandLineExecutable(release, this.platform),
        );
        if (release.valid === false)
            throw new Error(t('installs:aliases.errors.unavailable'));
        if (await this.stat(this.adapter.pathForCommand(name)))
            return {
                available: false,
                reason: t('installs:aliases.errors.external'),
            };
        if (await findConflict(name))
            return {
                available: false,
                reason: t('installs:aliases.errors.external'),
            };
        return { available: true };
    }

    /**
     * Builds a read-only plan and a private snapshot of its registry and editors.
     * @param request - Requested preference and treatment of existing commands.
     * @param installed - Current authoritative editor registrations.
     * @param unavailable - Reports active lifecycle reservations without acquiring them.
     */
    async previewChange(
        request: AutomaticAliasChangeRequest,
        installed: InstalledRelease[],
        unavailable: (
            item: AutomaticAliasChangeItem,
        ) => string | undefined = () => undefined,
    ) {
        const entries = await this.store.read();
        const items: AutomaticAliasChangeItem[] = [];
        const names = new Set(
            entries.flatMap((entry) => this.reservedNames(entry)),
        );
        let lookups: Promise<Map<string, string | null>> | undefined;
        /**
         * Shares only this preview's terminal lookup process results.
         * @param name - Locally validated candidate command.
         */
        const findConflict = async (name: string): Promise<string | null> => {
            lookups ??= this.adapter.findConflicts(
                installed
                    .filter(
                        (release) =>
                            !entries.some(({ binding }) =>
                                this.sameEditor(binding, release),
                            ),
                    )
                    .map((release) => suggestAutomaticAlias(release.version))
                    .filter(
                        (command) =>
                            !getAliasNameError(command) && !names.has(command),
                    ),
            );
            const results = await lookups;
            if (!results.has(name))
                throw new Error(t('installs:aliases.errors.unavailable'));
            return results.get(name) ?? null;
        };
        if (request.mode === 'create-missing') {
            for (const release of installed) {
                const existing = entries.find(({ binding }) =>
                    this.sameEditor(binding, release),
                );
                if (existing) continue;
                const name = suggestAutomaticAlias(release.version);
                const item: AutomaticAliasChangeItem = {
                    name,
                    version: release.version,
                    mono: release.mono,
                    management: 'automatic',
                    action: 'skip',
                };
                if (names.has(name))
                    item.reason = t('installs:aliases.errors.taken', { name });
                else {
                    try {
                        const availability = await this.check(
                            release,
                            name,
                            findConflict,
                        );
                        if (availability.available) {
                            item.action = 'create';
                            names.add(name);
                        } else item.reason = availability.reason;
                    } catch (error) {
                        item.reason = this.message(error);
                    }
                }
                items.push(item);
            }
        } else if (request.mode !== 'keep') {
            for (const entry of entries) {
                const { binding } = entry;
                const item: AutomaticAliasChangeItem = {
                    name: binding.name,
                    version: binding.version,
                    mono: binding.mono,
                    management: binding.management ?? 'unknown',
                    action: 'skip',
                };
                if (
                    request.mode === 'remove-automatic' &&
                    binding.management !== 'automatic'
                ) {
                    continue;
                }
                try {
                    if (
                        entry.operation ||
                        !(await this.owned(
                            this.destination(binding),
                            binding,
                        )) ||
                        !(await this.owned(this.witness(binding), binding))
                    )
                        item.reason = this.recoveryMessage(entry);
                    else item.action = 'remove';
                } catch (error) {
                    item.reason = this.message(error);
                }
                items.push(item);
            }
        }
        for (const item of items) {
            const reason =
                item.action !== 'skip' ? unavailable(item) : undefined;
            if (reason) {
                item.action = 'skip';
                item.reason = reason;
            }
        }
        return { items, snapshot: JSON.stringify({ entries, installed }) };
    }

    /**
     * Stages reviewed automatic creations before one fresh terminal lookup.
     * Called inside the shared command queue; registry transitions remain sequential.
     * @param items - Reviewed actions in their original order.
     * @param installed - Authoritative registrations held by the facade.
     */
    async applyChangeItems(
        items: AutomaticAliasChangeItem[],
        installed: InstalledRelease[],
    ): Promise<AutomaticAliasChangeResult['outcomes']> {
        const outcomes: AutomaticAliasChangeResult['outcomes'] = items.map(
            (item) => ({ ...item, status: 'skipped' }),
        );
        const staged: { index: number; binding: AliasBinding }[] = [];
        /**
         * Records a failed item without aborting independent commands.
         * @param index - Original reviewed item position.
         * @param error - Failure exposed to the caller.
         */
        const fail = (index: number, error: unknown) => {
            outcomes[index] = {
                ...items[index],
                status: 'failed',
                error: this.message(error),
            };
        };
        for (const [index, item] of items.entries()) {
            if (item.action !== 'create') continue;
            let binding: AliasBinding | undefined;
            try {
                const release = installed.find((candidate) =>
                    this.sameEditor(item, candidate),
                );
                if (!release)
                    throw new Error(t('installs:aliases.errors.unavailable'));
                if (
                    (await this.store.read()).some(({ binding }) =>
                        this.sameEditor(binding, release),
                    )
                )
                    throw new Error(t('installs:aliases.errors.recovery'));
                const availability = await this.check(
                    release,
                    item.name,
                    async () => null,
                );
                if (!availability.available)
                    throw new Error(availability.reason);
                binding = this.binding(release, item.name);
                binding.management = 'automatic';
                const operation = { kind: 'remove' as const };
                await this.put({ binding, operation });
                await this.stage(binding, operation);
                staged.push({ index, binding });
            } catch (error) {
                if (binding) await this.cleanupFailedCreation(binding);
                fail(index, error);
            }
        }
        let conflicts: Map<string, string | null>;
        try {
            conflicts = staged.length
                ? await this.adapter.findConflicts(
                      staged.map(({ binding }) => binding.name),
                  )
                : new Map();
        } catch (error) {
            for (const { index, binding } of staged) {
                await this.cleanupFailedCreation(binding);
                fail(index, error);
            }
            staged.length = 0;
            conflicts = new Map();
        }
        for (const { index, binding } of staged) {
            try {
                if (!conflicts.has(binding.name) || conflicts.get(binding.name))
                    throw new Error(t('installs:aliases.errors.external'));
                const current = (await this.store.read()).find(
                    ({ binding: candidate }) => candidate.id === binding.id,
                );
                if (
                    current?.operation?.kind !== 'remove' ||
                    JSON.stringify(current.binding) !== JSON.stringify(binding)
                )
                    throw new Error(t('installs:aliases.errors.recovery'));
                await this.requireExecutable(binding.executable);
                await this.publish(binding);
                await this.put({ binding });
                outcomes[index] = { ...items[index], status: 'created' };
            } catch (error) {
                await this.cleanupFailedCreation(binding);
                fail(index, error);
            }
        }
        for (const [index, item] of items.entries()) {
            if (item.action !== 'remove') continue;
            try {
                await this.applyChangeItem(item, installed);
                outcomes[index] = { ...item, status: 'removed' };
            } catch (error) {
                fail(index, error);
            }
        }
        return outcomes;
    }

    /**
     * Applies a reviewed item without recovering unrelated operations or changing PATH.
     * @param item - Exact reviewed command and requested action.
     * @param installed - Authoritative registrations rechecked by the facade.
     */
    async applyChangeItem(
        item: AutomaticAliasChangeItem,
        installed: InstalledRelease[],
    ): Promise<void> {
        if (item.action === 'create') {
            const release = installed.find((candidate) =>
                this.sameEditor(item, candidate),
            );
            if (!release)
                throw new Error(t('installs:aliases.errors.unavailable'));
            if (
                (await this.store.read()).some(({ binding }) =>
                    this.sameEditor(binding, release),
                )
            )
                throw new Error(t('installs:aliases.errors.recovery'));
            await this.create(release, item.name, true, false);
        } else if (item.action === 'remove') {
            const entry = (await this.store.read()).find(({ binding }) =>
                this.sameEditor(binding, item),
            );
            if (!entry || entry.binding.name !== item.name || entry.operation)
                throw new Error(t('installs:aliases.errors.recovery'));
            await this.put({
                binding: entry.binding,
                operation: { kind: 'remove' },
            });
            await this.erase(entry.binding);
            await this.forget(entry.binding);
        }
    }

    /**
     * Applies creation, removal or a recoverable replacement of a saved name.
     * @param release - Authoritative target editor.
     * @param name - Validated new name, or null for removal.
     * @param installed - Current editor records used for recovery.
     */
    async apply(
        release: InstalledRelease,
        name: string | null,
        installed: InstalledRelease[],
    ): Promise<CommandLineAliasResult> {
        if (name !== null) {
            const error = getAliasNameError(name);
            if (error) throw new Error(t(`installs:aliases.errors.${error}`));
        }
        await this.getState(installed);
        const existing = (await this.store.read()).find(({ binding }) =>
            this.sameEditor(binding, release),
        );
        if (existing?.operation)
            throw new Error(this.recoveryMessage(existing));
        if (name === null) {
            if (existing) {
                await this.put({
                    binding: existing.binding,
                    operation: { kind: 'remove' },
                });
                await this.erase(existing.binding);
                await this.forget(existing.binding);
            }
            return { ...(await this.getState(installed)), pathChanged: false };
        }
        if (existing) {
            if (
                !existing.operation &&
                existing.binding.name === name &&
                (await this.owned(
                    this.destination(existing.binding),
                    existing.binding,
                ))
            )
                return {
                    ...(await this.getState(installed)),
                    pathChanged: false,
                };
            return this.rename(release, name, existing, installed);
        }
        const { pathChanged } = await this.create(release, name);
        return { ...(await this.getState(installed)), pathChanged };
    }

    /**
     * Creates only an unbound editor's command without recovering unrelated intents.
     * @param release - Newly registered authoritative editor.
     * @param name - Suggested literal alias name.
     */
    async createAutomatically(release: InstalledRelease, name: string) {
        if (
            (await this.store.read()).some(({ binding }) =>
                this.sameEditor(binding, release),
            )
        )
            return undefined;
        return this.create(release, name, true);
    }

    /**
     * Publishes one exclusive command and retains failure-cleanup reservations.
     * @param release - Authoritative editor being configured.
     * @param name - Proposed literal alias name.
     * @param rollbackOnInterruption - Keeps provisional automatic setup cleanup-only until committed.
     * @param registerPath - Whether normal single-editor setup may register the bin directory.
     */
    private async create(
        release: InstalledRelease,
        name: string,
        rollbackOnInterruption = false,
        registerPath = true,
    ): Promise<{ pathChanged: boolean }> {
        const availability = await this.check(release, name);
        if (!availability.available) throw new Error(availability.reason);
        const binding = this.binding(release, name);
        binding.management = rollbackOnInterruption ? 'automatic' : 'manual';
        const operation = {
            kind: rollbackOnInterruption
                ? ('remove' as const)
                : ('create' as const),
        };
        await this.put({ binding, operation });
        let pathChanged = false;
        try {
            await this.stage(binding, operation);
            const registration = registerPath
                ? await this.adapter.register(name)
                : { pathChanged: false, conflict: null };
            pathChanged = registration.pathChanged;
            if (
                registration.conflict ||
                (await this.adapter.findConflict(name))
            )
                throw new Error(t('installs:aliases.errors.external'));
            await fs.link(this.witness(binding), this.destination(binding));
            await this.put({ binding });
        } catch (error) {
            await this.cleanupFailedCreation(binding);
            throw error;
        }
        return { pathChanged };
    }

    /**
     * Prevents failed creation from becoming delayed publication during recovery.
     * @param binding - Provisional file identity to clean without adopting other files.
     */
    private async cleanupFailedCreation(binding: AliasBinding): Promise<void> {
        try {
            await this.put({ binding, operation: { kind: 'remove' } });
        } catch {
            /* Still attempt owned-file cleanup if the registry is unavailable. */
        }
        try {
            await this.erase(binding);
            await this.forget(binding);
        } catch {
            /* Retain the removal reservation for safe recovery. */
        }
    }

    /**
     * Prepares the replacement before committing retirement of the working command.
     * Returns the committed name with its recovery state if retirement needs another attempt.
     * @param release - Authoritative installation whose name changes.
     * @param name - Proposed replacement command.
     * @param existing - Active saved binding.
     * @param installed - Current registrations for final verification.
     */
    private async rename(
        release: InstalledRelease,
        name: string,
        existing: AliasEntry,
        installed: InstalledRelease[],
    ): Promise<CommandLineAliasResult> {
        const previous = existing.binding;
        if (
            previous.editorPath !== release.editor_path ||
            previous.executable !==
                getCommandLineExecutable(release, this.platform)
        )
            throw new Error(t('installs:aliases.errors.unavailable'));
        const availability = await this.check(release, name);
        if (!availability.available) throw new Error(availability.reason);
        const binding = this.binding(release, name);
        const operation = {
            kind: 'rename' as const,
            phase: 'prepare' as const,
            previous,
        };
        const entry: AliasEntry = { binding, operation };
        await this.put(entry);
        let pathChanged = false;
        try {
            await this.stage(binding, operation);
            const registration = await this.adapter.register(name);
            pathChanged = registration.pathChanged;
            if (
                registration.conflict ||
                (await this.adapter.findConflict(name))
            )
                throw new Error(t('installs:aliases.errors.external'));
            await this.publish(binding);
            if (
                !(await this.owned(this.destination(binding), binding)) ||
                !(await this.owned(this.destination(previous), previous))
            )
                throw new Error(this.recoveryMessage(entry));
            await this.put({
                binding,
                operation: { ...operation, phase: 'commit' },
            });
        } catch (error) {
            try {
                await this.put(entry);
                await this.rollbackRename(entry);
            } catch {
                throw new Error(this.recoveryMessage(entry), { cause: error });
            }
            throw error;
        }
        const committed: AliasEntry = {
            binding,
            operation: { ...operation, phase: 'commit' },
        };
        try {
            await this.finishRename(committed, installed);
        } catch {
            // The committed replacement stays authoritative while recovery retries cleanup.
        }
        try {
            return { ...(await this.getState(installed)), pathChanged };
        } catch (error) {
            throw new Error(
                `Command ${name} was renamed, but its recovery state could not be read. ${this.recoveryMessage(committed)}`,
                { cause: error },
            );
        }
    }

    /**
     * Abandons a prepared replacement without retiring its original command.
     * @param entry - Prepare intent retaining both ownership witnesses.
     */
    private async rollbackRename(entry: AliasEntry): Promise<void> {
        const previous = entry.operation?.previous;
        if (
            !previous ||
            !(await this.owned(this.destination(previous), previous)) ||
            !(await this.owned(this.witness(previous), previous))
        )
            throw new Error(this.recoveryMessage(entry));
        await this.erase(entry.binding);
        await this.put({ binding: previous });
    }

    /**
     * Completes a committed rename only after verifying the replacement and target.
     * @param entry - Committed intent whose old name remains reserved.
     * @param installed - Authoritative registered installations.
     */
    private async finishRename(
        entry: AliasEntry,
        installed: InstalledRelease[],
    ): Promise<void> {
        const { binding, operation } = entry;
        const previous = operation?.previous;
        const release = installed.find((candidate) =>
            this.sameEditor(binding, candidate),
        );
        if (
            !previous ||
            !release ||
            release.valid === false ||
            release.editor_path !== binding.editorPath ||
            getCommandLineExecutable(release, this.platform) !==
                binding.executable
        )
            throw new Error(this.recoveryMessage(entry));
        await this.requireExecutable(binding.executable);
        if (await this.adapter.findConflict(binding.name))
            throw new Error(t('installs:aliases.errors.external'));
        await this.publish(binding);
        await this.erase(previous);
        await this.put({ binding });
    }

    /**
     * Lists all command names whose cleanup is not yet settled.
     * @param entry - Active or pending alias registration.
     */
    private reservedNames(entry: AliasEntry): string[] {
        return [
            entry.binding.name,
            ...(entry.operation?.kind === 'rename' && entry.operation.previous
                ? [entry.operation.previous.name]
                : []),
        ];
    }

    /**
     * Explains unresolved renames without claiming either command was rolled back.
     * @param entry - Registration retaining the operation context.
     */
    private recoveryMessage(entry: AliasEntry): string {
        return entry.operation?.kind === 'rename' && entry.operation.previous
            ? t('installs:aliases.errors.renameRecovery', {
                  previous: entry.operation.previous.name,
                  name: entry.binding.name,
              })
            : t('installs:aliases.errors.recovery');
    }

    /**
     * Removes commands before deletion and restores them only while the target still exists.
     * @param release - Editor reserved for removal.
     * @param remove - Existing default/files removal transaction.
     */
    async withRemoval<T>(
        release: InstalledRelease,
        remove: () => Promise<T>,
    ): Promise<T> {
        const entry = (await this.store.read()).find(({ binding }) =>
            this.sameEditor(binding, release),
        );
        if (!entry) return remove();
        if (entry.operation)
            throw new Error(t('installs:aliases.errors.recovery'));
        const { binding } = entry;
        if (!(await this.owned(this.witness(binding), binding)))
            throw new Error(t('installs:aliases.errors.recovery'));
        await this.put({ binding, operation: { kind: 'uninstall' } });
        await this.unlinkOwned(this.destination(binding), binding);
        let result: T;
        try {
            result = await remove();
        } catch (error) {
            try {
                await this.requireExecutable(binding.executable);
                await this.publish(binding);
                await this.put({ binding });
            } catch {
                throw new Error(t('installs:aliases.errors.recovery'), {
                    cause: error,
                });
            }
            throw error;
        }
        await this.erase(binding);
        await this.forget(binding);
        return result;
    }

    /**
     * Preserves a name while an explicit installation replacement updates its executable.
     * @param release - Replacement authoritative editor record.
     * @param persist - Existing registration/default transaction.
     */
    async withReplacement<T>(
        release: InstalledRelease,
        persist: () => Promise<T>,
    ): Promise<T> {
        const entry = (await this.store.read()).find(({ binding }) =>
            this.sameEditor(binding, release),
        );
        if (!entry) return persist();
        if (entry.operation)
            throw new Error(t('installs:aliases.errors.recovery'));
        if (
            entry.binding.editorPath === release.editor_path &&
            entry.binding.executable ===
                getCommandLineExecutable(release, this.platform)
        )
            return persist();
        const previous = entry.binding;
        const binding = this.binding(release, previous.name);
        binding.management = previous.management;
        await this.requireExecutable(binding.executable);
        const operation = { kind: 'rebind' as const, previous };
        await this.put({ binding, operation });
        await this.stage(binding, operation);
        let result: T;
        try {
            await this.publish(binding, previous);
            result = await persist();
        } catch (error) {
            try {
                await this.requireExecutable(previous.executable);
                await this.publish(previous, binding);
                await this.unlinkOwned(this.witness(binding), binding);
                await this.put({ binding: previous });
            } catch {
                throw new Error(t('installs:aliases.errors.recovery'), {
                    cause: error,
                });
            }
            throw error;
        }
        await this.unlinkOwned(this.witness(previous), previous);
        await this.put({ binding });
        return result;
    }

    /**
     * Reconciles one intent against the actual registered installation.
     * @param entry - Pending operation with its filesystem witness.
     * @param installed - Authoritative installed-editor records.
     */
    private async recover(
        entry: AliasEntry,
        installed: InstalledRelease[],
    ): Promise<void> {
        const { binding, operation } = entry;
        if (!operation) return;
        const release = installed.find((candidate) =>
            this.sameEditor(binding, candidate),
        );
        if (operation.kind === 'rename') {
            if (operation.phase === 'prepare') await this.rollbackRename(entry);
            else await this.finishRename(entry, installed);
            return;
        }
        if (operation.kind === 'remove') {
            await this.erase(binding);
            await this.forget(binding);
            return;
        }
        if (operation.kind === 'uninstall') {
            if (
                release &&
                (release.editor_path !== binding.editorPath ||
                    getCommandLineExecutable(release, this.platform) !==
                        binding.executable)
            )
                throw new Error(t('installs:aliases.errors.recovery'));
            const available =
                release && (await this.executableAvailable(binding.executable));
            if (available) {
                await this.publish(binding);
                await this.put({ binding });
            } else {
                await this.erase(binding);
                await this.forget(binding);
            }
            return;
        }
        const desired =
            operation.kind === 'rebind' &&
            operation.previous &&
            release?.editor_path === operation.previous.editorPath &&
            getCommandLineExecutable(release, this.platform) ===
                operation.previous.executable
                ? operation.previous
                : binding;
        const other = desired === binding ? operation.previous : binding;
        if (
            !release ||
            release.editor_path !== desired.editorPath ||
            getCommandLineExecutable(release, this.platform) !==
                desired.executable ||
            release.valid === false
        )
            throw new Error(t('installs:aliases.errors.unavailable'));
        await this.requireExecutable(desired.executable);
        if (!desired.dev || !desired.ino) {
            if (
                (await this.stat(this.witness(desired))) ||
                (await this.stat(this.destination(desired)))
            )
                throw new Error(t('installs:aliases.errors.recovery'));
            await this.forget(binding);
            return;
        }
        if (operation.kind === 'create') {
            if (await this.adapter.findConflict(binding.name))
                throw new Error(t('installs:aliases.errors.external'));
            await this.adapter.register(binding.name);
        }
        await this.publish(desired, other);
        if (other) await this.unlinkOwned(this.witness(other), other);
        await this.put({ binding: desired });
    }

    /**
     * Writes a complete private file, then records its identity before publishing any command.
     * @param binding - Pending binding updated with the new witness identity.
     * @param operation - Persistent operation retaining any previous binding.
     */
    private async stage(
        binding: AliasBinding,
        operation: NonNullable<AliasEntry['operation']>,
    ): Promise<void> {
        await fs.mkdir(this.adapter.binDirectory, { recursive: true });
        const file = await fs.open(this.witness(binding), 'wx', 0o755);
        try {
            await file.writeFile(binding.content, 'utf8');
            await file.sync();
            const info = await file.stat({ bigint: true });
            binding.dev = String(info.dev);
            binding.ino = String(info.ino);
        } finally {
            await file.close();
        }
        await this.put({ binding, operation });
    }

    /**
     * Publishes a verified witness exclusively, removing only an explicitly known old binding.
     * @param binding - Desired complete file and recorded identity.
     * @param previous - Optional proven-owned previous destination.
     */
    private async publish(
        binding: AliasBinding,
        previous?: AliasBinding,
    ): Promise<void> {
        if (!(await this.owned(this.witness(binding), binding)))
            throw new Error(t('installs:aliases.errors.recovery'));
        if (await this.owned(this.destination(binding), binding)) return;
        if (previous)
            await this.unlinkOwned(this.destination(previous), previous);
        await fs.link(this.witness(binding), this.destination(binding));
    }

    /**
     * Removes only files still matching the retained witness identity and complete contents.
     * @param binding - Registered command ownership.
     */
    private async erase(binding: AliasBinding): Promise<void> {
        await this.unlinkOwned(this.destination(binding), binding);
        await this.unlinkOwned(this.witness(binding), binding);
    }

    /**
     * Verifies ownership immediately before removing a regular file.
     * @param file - Command or witness path.
     * @param binding - Expected identity and contents.
     */
    private async unlinkOwned(
        file: string,
        binding: AliasBinding,
    ): Promise<void> {
        if (!(await this.stat(file))) return;
        if (!(await this.owned(file, binding)))
            throw new Error(t('installs:aliases.errors.recovery'));
        await fs.unlink(file);
    }

    /**
     * Verifies regular-file identity and contents without adopting a marker-only match.
     * @param file - Candidate command or witness.
     * @param binding - Persisted identity and contents.
     */
    private async owned(file: string, binding: AliasBinding): Promise<boolean> {
        const info = await this.stat(file);
        if (
            !info?.isFile() ||
            info.isSymbolicLink() ||
            !binding.dev ||
            !binding.ino ||
            String(info.dev) !== binding.dev ||
            String(info.ino) !== binding.ino
        )
            return false;
        const handle = await fs.open(
            file,
            fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
        );
        try {
            const actual = await handle.stat({ bigint: true });
            return (
                actual.isFile() &&
                String(actual.dev) === binding.dev &&
                String(actual.ino) === binding.ino &&
                (await handle.readFile('utf8')) === binding.content
            );
        } finally {
            await handle.close();
        }
    }

    /**
     * Reads a path without treating permission failures as absence.
     * @param file - Literal trusted path.
     */
    private async stat(
        file: string,
    ): Promise<Awaited<ReturnType<typeof fs.lstat>> | null> {
        try {
            return await fs.lstat(file, { bigint: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }

    /**
     * Verifies a target without launching it.
     * @param file - Authoritative executable path.
     */
    private async requireExecutable(file: string): Promise<void> {
        if (!(await fs.stat(file)).isFile())
            throw new Error(t('installs:aliases.errors.unavailable'));
        await fs.access(
            file,
            this.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK,
        );
    }
    /**
     * Checks target availability for safe uninstall recovery.
     * @param file - Previously registered executable.
     */
    private async executableAvailable(file: string): Promise<boolean> {
        try {
            await this.requireExecutable(file);
            return true;
        } catch (error) {
            if (
                ['ENOENT', 'ENOTDIR'].includes(
                    (error as NodeJS.ErrnoException).code || '',
                )
            )
                return false;
            throw error;
        }
    }
    /**
     * Creates the immutable wrapper content and fresh ownership token.
     * @param release - Authoritative installation.
     * @param name - Validated alias name.
     */
    private binding(release: InstalledRelease, name: string): AliasBinding {
        const executable = getCommandLineExecutable(release, this.platform);
        return {
            id: randomUUID(),
            management: 'manual',
            name,
            version: release.version,
            mono: release.mono,
            editorPath: release.editor_path,
            executable,
            content: createGodotWrapper(executable, this.platform, name),
        };
    }
    /**
     * Compares installation identity rather than display names.
     * @param binding - Persisted installation identity.
     * @param release - Registered installation identity.
     */
    private sameEditor(
        binding: Pick<AliasBinding, 'version' | 'mono'>,
        release: Pick<InstalledRelease, 'version' | 'mono'>,
    ): boolean {
        return (
            binding.version === release.version && binding.mono === release.mono
        );
    }
    /**
     * Resolves a private witness alongside the published command.
     * @param binding - Validated operation token.
     */
    private witness(binding: AliasBinding): string {
        return path.join(
            this.adapter.binDirectory,
            `.godot-launcher-alias-${binding.id}`,
        );
    }
    /**
     * Resolves a validated published command.
     * @param binding - Validated name.
     */
    private destination(binding: AliasBinding): string {
        return this.adapter.pathForCommand(binding.name);
    }
    /**
     * Replaces the record belonging to one installation, retaining other registrations.
     * @param entry - Next operation or active binding.
     */
    private async put(entry: AliasEntry): Promise<void> {
        await this.store.save([
            ...(await this.store.read()).filter(
                ({ binding }) => !this.sameEditor(binding, entry.binding),
            ),
            entry,
        ]);
    }
    /**
     * Clears only the current operation's registration.
     * @param binding - Exact operation being completed.
     */
    private async forget(binding: AliasBinding): Promise<void> {
        await this.store.save(
            (await this.store.read()).filter(
                (entry) => entry.binding.id !== binding.id,
            ),
        );
    }
    /**
     * Converts an operation failure to a persistent UI-readable recovery description.
     * @param error - Filesystem or registry failure.
     */
    private message(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
