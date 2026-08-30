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

/**
 * Derives a public GitHub repository page from a standard Git remote.
 *
 * @param value - Token-free HTTPS or standard GitHub SSH remote.
 * @returns The public GitHub repository URL, or null.
 */
export function toGitHubRepositoryWebUrl(value: string): string | null {
    if (
        !value ||
        hasControlCharacters(value) ||
        value.includes('\\') ||
        value.includes('%')
    ) {
        return null;
    }

    const httpsRemote = normalizeGitRemoteUrl(value);
    if (httpsRemote) {
        const url = new URL(httpsRemote);
        return url.hostname === 'github.com'
            ? createGitHubWebUrl(url.pathname)
            : null;
    }

    const scpMatch =
        /^git@github\.com:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/u.exec(
            value.replace(/\.git$/u, ''),
        );
    if (scpMatch) {
        return createGitHubWebUrl(scpMatch[1]);
    }

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (
        url.protocol !== 'ssh:' ||
        url.username !== 'git' ||
        url.password !== '' ||
        url.hostname.toLowerCase() !== 'github.com' ||
        url.port !== '' ||
        url.search !== '' ||
        url.hash !== ''
    ) {
        return null;
    }
    return createGitHubWebUrl(url.pathname.replace(/\.git$/u, ''));
}

/**
 * Validates one exact GitHub owner and repository path.
 *
 * @param pathname - Slash-prefixed repository path.
 * @returns The public GitHub URL, or null.
 */
function createGitHubWebUrl(pathname: string): string | null {
    const segments = pathname.split('/').filter(Boolean);
    if (
        segments.length !== 2 ||
        segments.some((segment) => !/^[A-Za-z0-9_.-]+$/u.test(segment))
    ) {
        return null;
    }
    return `https://github.com/${segments[0]}/${segments[1]}`;
}

/** Returns whether text contains an ASCII control character. */
function hasControlCharacters(value: string): boolean {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
    });
}
