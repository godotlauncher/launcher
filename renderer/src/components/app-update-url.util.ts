import { parse } from 'semver';
import { LAUNCHER_RELEASE_NOTES_URL } from '../app.constants';

/**
 * Builds a shared major.minor.patch notes URL from a valid release version.
 * @param version - Version supplied by the update service.
 */
export function getAppReleaseNotesUrl(
    version: string | undefined,
): string | undefined {
    if (!version || !/^[0-9]/.test(version) || version.trim() !== version) {
        return undefined;
    }
    const parsed = parse(version);
    if (!parsed) return undefined;
    return `${LAUNCHER_RELEASE_NOTES_URL}${parsed.major}.${parsed.minor}.${parsed.patch}/`;
}
