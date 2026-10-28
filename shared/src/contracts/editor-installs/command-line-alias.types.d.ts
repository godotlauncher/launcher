/** Reports an alias without exposing its private recovery representation. */
export type CommandLineAlias = {
    name: string;
    version: string;
    mono: boolean;
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
