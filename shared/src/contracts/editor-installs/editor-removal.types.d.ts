import type { InstalledRelease } from '../releases/index.js';

/** One selected editor and the restriction applied by Select unused. */
export type EditorRemovalSelection = {
    release: InstalledRelease;
    onlyUnused: boolean;
};

/** Reports one editor's removal without hiding skipped or failed work. */
export type EditorRemovalOutcome = {
    release: InstalledRelease;
    status: 'removed' | 'skipped' | 'failed';
    error?: string;
};

/** Reports the complete batch and the authoritative remaining editor list. */
export type RemoveEditorsResult = {
    outcomes: EditorRemovalOutcome[];
    releases: InstalledRelease[];
};
