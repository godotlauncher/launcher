import { describe, expect, it } from 'vitest';
import { getInstallsViewState } from './installsView.model.ts';

describe('getInstallsViewState', () => {
    it('selects the guided empty state after loading completes', () => {
        expect(
            getInstallsViewState({
                installedReleaseCount: 0,
                downloadingReleaseCount: 0,
                loading: false,
                hasError: false,
            }),
        ).toBe('empty');
    });

    it('keeps download and installed rows on the list path', () => {
        expect(
            getInstallsViewState({
                installedReleaseCount: 0,
                downloadingReleaseCount: 1,
                loading: false,
                hasError: false,
            }),
        ).toBe('list');
        expect(
            getInstallsViewState({
                installedReleaseCount: 1,
                downloadingReleaseCount: 0,
                loading: false,
                hasError: false,
            }),
        ).toBe('list');
    });

    it('does not flash the empty state while loading or after an error', () => {
        expect(
            getInstallsViewState({
                installedReleaseCount: 0,
                downloadingReleaseCount: 0,
                loading: true,
                hasError: false,
            }),
        ).toBe('loading');
        expect(
            getInstallsViewState({
                installedReleaseCount: 0,
                downloadingReleaseCount: 0,
                loading: false,
                hasError: true,
            }),
        ).toBe('loading');
    });
});
