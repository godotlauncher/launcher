import type { UserPreferences } from '../preferences/index.js';
import type { InstalledRelease } from '../releases/index.js';

/** Reports an alias without exposing its private recovery representation. */
export type CommandLineAlias = {
    name: string;
    version: string;
    mono: boolean;
    management?: 'automatic' | 'manual' | 'unknown';
    state: 'active' | 'unresolved';
    problem?: string;
};
/** Reports registered commands, including reservations needing recovery. */
export type CommandLineAliasesState = { aliases: CommandLineAlias[] };
/** Reports a point-in-time name check; Apply must check again. */
export type CommandLineAliasAvailability = {
    available: boolean;
    reason?: string;
};
/** Reports a completed apply and whether the terminal needs restarting. */
export type CommandLineAliasResult = CommandLineAliasesState & {
    pathChanged: boolean;
};

/** Reports a non-fatal automatic command setup outcome after a successful install. */
export type AutomaticCommandLineAliasResult = {
    name: string;
    pathChanged: boolean;
    error?: string;
};

/** Chooses how a preference change treats existing named commands. */
export type AutomaticAliasChangeRequest = {
    enabled: boolean;
    mode: 'keep' | 'create-missing' | 'remove-automatic' | 'remove-all';
};
/** Describes one reviewed existing command or suggested command. */
export type AutomaticAliasChangeItem = {
    name: string;
    version: string;
    mono: boolean;
    management: 'automatic' | 'manual' | 'unknown';
    action: 'create' | 'remove' | 'skip';
    reason?: string;
};
/** Contains an opaque snapshot and the complete proposed effects. */
export type AutomaticAliasChangePreview = AutomaticAliasChangeRequest & {
    token: string;
    items: AutomaticAliasChangeItem[];
};
/** Reports the exact outcome of every reviewed command. */
export type AutomaticAliasChangeResult = {
    preferences: UserPreferences;
    outcomes: (AutomaticAliasChangeItem & {
        status: 'created' | 'removed' | 'skipped' | 'failed';
        error?: string;
    })[];
};

/** Reviews command changes for an explicit installed-editor selection. */
export type SelectedAliasChangeRequest = {
    mode: 'create-missing' | 'remove';
    editors: InstalledRelease[];
};
/** Binds counted effects to the reviewed registrations and alias registry. */
export type SelectedAliasChangePreview = {
    token: string;
    mode: SelectedAliasChangeRequest['mode'];
    items: AutomaticAliasChangeItem[];
};
/** Reports selected operations without modifying preferences or the default. */
export type SelectedAliasChangeResult = {
    outcomes: AutomaticAliasChangeResult['outcomes'];
    pathChanged: boolean;
};
