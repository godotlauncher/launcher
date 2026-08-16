import type { GitIdentity } from '../projects/index.js';

/** A Launcher-owned identity with no effect until written to a repository. */
export type ProjectGitIdentityPreset = GitIdentity & {
    useForNewRepositories: boolean;
};
