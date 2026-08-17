import { describe, expect, it } from 'vitest';
import { GitLfsService } from './git-lfs.service.js';
import { GODOT_GIT_LFS_TRACKING_POLICY } from './git-lfs-tracking-policy.constants.js';

describe('GitLfsService', () => {
    it('returns the canonical Godot tracking policy as a defensive copy', () => {
        const service = new GitLfsService();

        const first = service.getTrackingPolicy();
        const second = service.getTrackingPolicy();

        expect(first).toEqual(GODOT_GIT_LFS_TRACKING_POLICY);
        expect(first).not.toBe(second);
        expect(first.groups).not.toBe(second.groups);
        expect(first.groups[0].patterns).not.toBe(second.groups[0].patterns);
    });
});
