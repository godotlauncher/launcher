import { valid } from 'semver';
import { LAUNCHER_RELEASE_NOTES_URL } from '../app.constants';

/**
 * Builds a notes URL only for an exact, valid release version.
 * @param version - Version supplied by the update service.
 */
export function getAppReleaseNotesUrl(
    version: string | undefined,
): string | undefined {
    if (
        !version ||
        !/^[0-9]/.test(version) ||
        version.trim() !== version ||
        !valid(version)
    ) {
        return undefined;
    }
    return `${LAUNCHER_RELEASE_NOTES_URL}${encodeURIComponent(version)}/`;
}
