import type { GitLfsTrackingPolicyDescriptor } from './git-lfs.types.js';

/** Renderer-safe Git LFS domain operations. */
export type GitLfsBridge = {
    /**
     * Gets the canonical tracking policy available to Create Project.
     *
     * @returns A read-only description of the main-process policy.
     */
    getTrackingPolicy(): Promise<GitLfsTrackingPolicyDescriptor>;
};
