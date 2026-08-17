import { Injectable } from '@mariodebono/di';
import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';
import { GODOT_GIT_LFS_TRACKING_POLICY } from './git-lfs-tracking-policy.constants.js';

@Injectable()
export class GitLfsService {
    /**
     * Gets a renderer-safe copy of the canonical Git LFS tracking policy.
     *
     * @returns The policy identifier, display groups, and tracked patterns.
     */
    getTrackingPolicy(): GitLfsTrackingPolicyDescriptor {
        return {
            id: GODOT_GIT_LFS_TRACKING_POLICY.id,
            groups: GODOT_GIT_LFS_TRACKING_POLICY.groups.map((group) => ({
                id: group.id,
                patterns: [...group.patterns],
            })),
        };
    }
}
