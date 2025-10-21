import { describe, expect, it, vi } from 'vitest';

import { createReleaseActions } from './installs.view';

describe('createReleaseActions', () => {
    it('invokes dependency hooks for retry and remove actions', async () => {
        const checkAllReleasesValid = vi.fn(() => Promise.resolve());
        const removeRelease = vi.fn(() => Promise.resolve());

        const releaseActions = createReleaseActions({
            checkAllReleasesValid,
            removeRelease,
        });

        await releaseActions.retry();
        expect(checkAllReleasesValid).toHaveBeenCalledTimes(1);

        const release = { version: '4.2.0' } as InstalledRelease;
        await releaseActions.remove(release);
        expect(removeRelease).toHaveBeenCalledWith(release);
    });
});
