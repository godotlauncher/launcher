import { promises as dns } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { Injectable } from '@mariodebono/di';
import type { PublicGitSourceInspectionResult } from '@shared/contracts';
import { sanitiseProjectDirectoryName } from '../../../utils/projectDirectoryName.utils.js';
import {
    NON_GLOBAL_IPV4_RANGES,
    NON_GLOBAL_IPV6_RANGES,
    PUBLIC_GIT_DNS_TIMEOUT_MS,
} from './public-address.constants.js';

type PublicGitSource = {
    canonicalUrl: string;
    suggestedDirectoryName: string;
    approvedAddresses: string[];
};

export type MainPublicGitSourceInspectionResult =
    | { ok: true; source: PublicGitSource }
    | Extract<PublicGitSourceInspectionResult, { ok: false }>;

const nonGlobalAddresses = new BlockList();
for (const [network, prefix] of NON_GLOBAL_IPV4_RANGES) {
    nonGlobalAddresses.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of NON_GLOBAL_IPV6_RANGES) {
    nonGlobalAddresses.addSubnet(network, prefix, 'ipv6');
}

@Injectable()
export class PublicGitSourceService {
    /**
     * Validates and resolves one anonymous public Git URL.
     *
     * @param value - User-supplied repository URL.
     * @returns A main-only inspected source with pinned candidate addresses.
     */
    async inspect(value: string): Promise<MainPublicGitSourceInspectionResult> {
        const parsed = parsePublicGitUrl(value);
        if (!parsed.ok) {
            return parsed;
        }

        let addresses: Array<{ address: string; family: number }>;
        try {
            addresses = await withTimeout(
                dns.lookup(parsed.url.hostname, {
                    all: true,
                    order: 'verbatim',
                }),
                PUBLIC_GIT_DNS_TIMEOUT_MS,
            );
        } catch {
            return { ok: false, reason: 'dns-unavailable' };
        }
        if (
            addresses.length === 0 ||
            addresses.some(({ address }) => !isPublicAddress(address))
        ) {
            return { ok: false, reason: 'non-public-host' };
        }

        const pathSegment = parsed.url.pathname.split('/').at(-1) ?? '';
        let decodedName: string;
        try {
            decodedName = decodeURIComponent(pathSegment);
        } catch {
            return { ok: false, reason: 'invalid-path' };
        }
        const repositoryName = decodedName.replace(/\.git$/u, '');
        if (!repositoryName) {
            return { ok: false, reason: 'invalid-path' };
        }
        return {
            ok: true,
            source: {
                canonicalUrl: parsed.url.toString(),
                suggestedDirectoryName:
                    sanitiseProjectDirectoryName(repositoryName),
                approvedAddresses: [
                    ...new Set(addresses.map(({ address }) => address)),
                ],
            },
        };
    }
}

/** Parses the strict anonymous HTTPS public-source syntax. */
function parsePublicGitUrl(
    value: string,
):
    | { ok: true; url: URL }
    | Extract<PublicGitSourceInspectionResult, { ok: false }> {
    if (
        !value ||
        hasControlCharacters(value) ||
        /%(?:2f|5c)/iu.test(value) ||
        value.includes('\\')
    ) {
        return { ok: false, reason: 'invalid-url' };
    }
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return { ok: false, reason: 'invalid-url' };
    }
    if (url.protocol !== 'https:') {
        return { ok: false, reason: 'unsupported-url' };
    }
    if (url.username || url.password || url.search || url.hash) {
        return { ok: false, reason: 'invalid-url' };
    }
    if (
        !url.hostname ||
        url.port !== '' ||
        isIP(url.hostname) !== 0 ||
        isLocalHostname(url.hostname)
    ) {
        return { ok: false, reason: 'invalid-host' };
    }
    if (url.pathname === '/' || url.pathname.endsWith('/')) {
        return { ok: false, reason: 'invalid-path' };
    }
    try {
        if (hasControlCharacters(decodeURIComponent(url.pathname))) {
            return { ok: false, reason: 'invalid-path' };
        }
    } catch {
        return { ok: false, reason: 'invalid-path' };
    }
    return { ok: true, url };
}

/** Returns whether text contains an ASCII control character. */
function hasControlCharacters(value: string): boolean {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
    });
}

/** Returns whether a hostname is an unqualified or localhost equivalent. */
function isLocalHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/\.$/u, '');
    return (
        normalized === 'localhost' ||
        normalized.endsWith('.localhost') ||
        !normalized.includes('.')
    );
}

/** Returns whether one DNS address is globally reachable. */
function isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) {
        return !nonGlobalAddresses.check(address, 'ipv4');
    }
    if (family !== 6) {
        return false;
    }
    const mapped = readMappedIpv4(address);
    if (mapped) {
        return !nonGlobalAddresses.check(mapped, 'ipv4');
    }
    return !nonGlobalAddresses.check(address, 'ipv6');
}

/** Extracts a dotted IPv4 address from an IPv4-mapped IPv6 value. */
function readMappedIpv4(address: string): string | null {
    const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu)?.[1];
    if (dotted && isIP(dotted) === 4) {
        return dotted;
    }
    const hexadecimal = address.match(
        /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/iu,
    );
    if (!hexadecimal) {
        return null;
    }
    const high = Number.parseInt(hexadecimal[1], 16);
    const low = Number.parseInt(hexadecimal[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/** Resolves a promise within a fixed caller timeout. */
async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(
                    () => reject(new Error('DNS lookup timed out')),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}
