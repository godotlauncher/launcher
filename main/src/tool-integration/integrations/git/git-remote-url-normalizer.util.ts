/**
 * Normalises one anonymous HTTPS Git remote for conservative exact matching.
 *
 * @param value - Remote URL that must not contain credentials.
 * @returns A canonical URL, or null when the remote is unsafe or unsupported.
 */
export function normalizeGitRemoteUrl(value: string): string | null {
    if (
        !value ||
        hasControlCharacters(value) ||
        /%(?:2f|5c)/iu.test(value) ||
        value.includes('\\')
    ) {
        return null;
    }
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (
        url.protocol !== 'https:' ||
        url.username !== '' ||
        url.password !== '' ||
        url.hostname === '' ||
        (url.port !== '' && url.port !== '443') ||
        url.search !== '' ||
        url.hash !== '' ||
        url.pathname === '/'
    ) {
        return null;
    }
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase();
    url.port = '';
    url.pathname = url.pathname.replace(/\/$/u, '').replace(/\.git$/u, '');
    if (url.pathname === '/') {
        return null;
    }
    return url.toString().replace(/\/$/u, '');
}

/** Returns whether text contains an ASCII control character. */
function hasControlCharacters(value: string): boolean {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
    });
}
