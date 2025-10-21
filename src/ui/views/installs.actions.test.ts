import { describe, expect, it, vi } from 'vitest';

import { createReleaseActions } from './installs.view';

describe('createReleaseActions', () => {
    it('invokes dependency hooks for retry and remove actions', async () => {
        const releasesMock = [{ version: '4.2.0', mono: false } as InstalledRelease];
        const checkAllReleasesValid = vi.fn(() => Promise.resolve(releasesMock));
        const removeRelease = vi.fn(() => Promise.resolve());

        const releaseActions = createReleaseActions({
            checkAllReleasesValid,
            removeRelease,
        });

        const result = await releaseActions.retry();
        expect(checkAllReleasesValid).toHaveBeenCalledTimes(1);
        expect(result).toBe(releasesMock);

        const release = { version: '4.2.0' } as InstalledRelease;
        await releaseActions.remove(release);
        expect(removeRelease).toHaveBeenCalledWith(release);
    });
});
