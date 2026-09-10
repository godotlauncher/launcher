import type { TerminalTargetId } from '@shared/contracts';

/** One compiled native terminal installation. */
export type TerminalTarget = {
    id: TerminalTargetId;
    displayName: string;
    executablePath: string;
};
