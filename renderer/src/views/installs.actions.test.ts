import type { InstalledRelease } from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createReleaseActions } from './installs.view';

describe('createReleaseActions', () => {
    it('invokes dependency hooks for retry, reinstall, and remove actions', async () => {
        const releasesMock = [
            { version: '4.2.0', mono: false } as InstalledRelease,
        ];
        const checkAllReleasesValid = vi.fn(() =>
            Promise.resolve(releasesMock),
        );
        const reinstallRelease = vi.fn(() =>
            Promise.resolve({ success: true, version: '4.2.0' }),
        );
        const removeRelease = vi.fn(() => Promise.resolve());

        const releaseActions = createReleaseActions({
            checkAllReleasesValid,
            reinstallRelease,
            removeRelease,
        });

        const result = await releaseActions.retry();
        expect(checkAllReleasesValid).toHaveBeenCalledTimes(1);
        expect(result).toBe(releasesMock);

        const release = { version: '4.2.0' } as InstalledRelease;
        await releaseActions.reinstall(release);
        expect(reinstallRelease).toHaveBeenCalledWith(release);

        await releaseActions.remove(release);
        expect(removeRelease).toHaveBeenCalledWith(release);
    });
});
