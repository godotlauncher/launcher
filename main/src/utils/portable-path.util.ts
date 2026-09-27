/** Validates a portable path component, including Windows reserved names.
 * @param value - Untrusted component.
 */
export function isPortablePathSegment(value: string): boolean {
    return (
        !!value &&
        value !== '.' &&
        value !== '..' &&
        !/[\\/<>:"|?*]/.test(value) &&
        [...value].every((character) => character.charCodeAt(0) >= 32) &&
        !/[. ]$/.test(value) &&
        !/^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(
            value,
        )
    );
}
