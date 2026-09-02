import { TextDecoder } from 'node:util';
import type { GitCredentialTarget } from './git-credential-protocol.util.js';

const MAX_INPUT_BYTES = 20 * 1_024;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export type GitCredentialHelperOperation = 'erase' | 'get' | 'store';

/**
 * Parses one supported Git credential-helper operation.
 *
 * @param value - Operation appended by Git.
 * @returns Supported operation, or null.
 */
export function parseGitCredentialHelperOperation(
    value: string | undefined,
): GitCredentialHelperOperation | null {
    return value === 'get' || value === 'store' || value === 'erase'
        ? value
        : null;
}

/**
 * Parses the structured destination supplied to a Git credential helper.
 *
 * @param input - Complete bounded helper standard input.
 * @returns Exact protocol, host and path, or null.
 */
export function parseGitCredentialHelperTarget(
    input: Buffer,
): GitCredentialTarget | null {
    if (input.length === 0 || input.length > MAX_INPUT_BYTES) {
        return null;
    }
    let text: string;
    try {
        text = utf8Decoder.decode(input);
    } catch {
        return null;
    }
    if (text.includes('\0') || text.includes('\r')) {
        return null;
    }
    const fields = new Map<string, string>();
    for (const line of text.split('\n')) {
        if (line === '') {
            continue;
        }
        const separator = line.indexOf('=');
        if (separator < 1) {
            return null;
        }
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        if (
            (key === 'protocol' || key === 'host' || key === 'path') &&
            (value === '' || fields.has(key))
        ) {
            return null;
        }
        if (key === 'protocol' || key === 'host' || key === 'path') {
            fields.set(key, value);
        }
    }
    const protocol = fields.get('protocol');
    const host = fields.get('host');
    const targetPath = fields.get('path');
    return protocol && host && targetPath
        ? { protocol, host, path: targetPath }
        : null;
}

/** Returns the maximum accepted Git credential-helper input size. */
export function getGitCredentialHelperInputLimit(): number {
    return MAX_INPUT_BYTES;
}
