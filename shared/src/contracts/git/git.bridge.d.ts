import type { GitIdentity } from '../projects/index.js';

/** Renderer-safe Git domain operations. */
export type GitBridge = {
    /**
     * Gets independently configured global Git identity values.
     *
     * @returns The global Git name and email, including partial identity.
     */
    getGlobalIdentity(): Promise<GitIdentity>;
};
