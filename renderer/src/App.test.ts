import { describe, expect, it } from 'vitest';

import { shouldShowAppLoading } from './App.model';

describe('shouldShowAppLoading', () => {
    it('blocks rendering until preferences and releases are initially loaded', () => {
        expect(
            shouldShowAppLoading({
                prefsLoading: true,
                releasesInitialized: true,
            }),
        ).toBe(true);
        expect(
            shouldShowAppLoading({
                prefsLoading: false,
                releasesInitialized: false,
            }),
        ).toBe(true);
    });

    it('keeps the app mounted while releases refresh after initialization', () => {
        expect(
            shouldShowAppLoading({
                prefsLoading: false,
                releasesInitialized: true,
            }),
        ).toBe(false);
    });
});
