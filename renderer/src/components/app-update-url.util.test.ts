import { describe, expect, it } from 'vitest';
import { LAUNCHER_RELEASE_NOTES_URL } from '../app.constants';
import { getAppReleaseNotesUrl } from './app-update-url.util';

describe('getAppReleaseNotesUrl', () => {
    it.each(['1.12.0', '1.12.1', '2.0.0-beta.2', '1.12.0+build.42'])(
        'targets the exact release %s',
        (version) => {
            expect(getAppReleaseNotesUrl(version)).toBe(
                `${LAUNCHER_RELEASE_NOTES_URL}${encodeURIComponent(version)}/`,
            );
        },
    );

    it.each([
        undefined,
        '',
        'v1.12.0',
        ' 1.12.0',
        '1.12.0 ',
        '1.12.0\n',
        '1.12',
        '01.12.0',
        '1.12.0-beta.01',
        '../1.12.0',
        '1.12.0/other',
        '1.12.0?preview=true',
        '1.12.0#notes',
    ])('omits guessed or unsafe release %s', (version) => {
        expect(getAppReleaseNotesUrl(version)).toBeUndefined();
    });
});
